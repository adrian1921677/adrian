import { babble } from '../audio/babble';
import {
  ALL_DONE,
  FOLLOW_UPS,
  GREETING_REPLIES,
  IDLE_HINTS,
  INTRO,
  JOKES,
  NAME_REPLY,
  POKE_LINES,
  POKE_SPECIAL,
  SWITCH_LINES,
  THANKS_REPLY,
  TOPICS,
  UNKNOWN_REPLY,
} from '../data/content';
import { TOPIC_IDS, TOPIC_NODES } from '../data/nodes';
import type { TopicId } from '../data/nodes';
import type { Line, Mood, Topic } from '../data/types';
import { useAppStore } from '../state/store';
import type { AppState, CharacterAction } from '../state/store';
import { useDialogue } from './dialogueStore';
import type { DialogueMode } from './dialogueStore';
import { route } from './router';

/**
 * Dialogue director: owns the conversation flow and tells the scene what to do.
 * Every flow (intro, topic, small talk, poke, hint) runs with its own
 * AbortController; starting a new flow aborts the old one, so no stale
 * timer/await can touch state afterwards.
 */

const INTRO_DELAY = 1200;
const IDLE_HINT_AFTER = 25_000;
const REACTION_HOLD = 650;
const POKE_HOLD = 1800;
const ARRIVAL_TIMEOUT = 12_000;
const FIRST_CHAR_DELAY = 90;

const TOPIC_BY_ID = new Map<TopicId, Topic>(TOPICS.map((t) => [t.id, t]));

class Cancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'Cancelled';
  }
}

const app = () => useAppStore.getState();
const ui = useDialogue.setState;

const warned = new Set<string>();
function warnOnce(key: string, msg: string) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[director] ${msg}`);
}

function say(text: string, mood: Mood = 'happy', gesture?: CharacterAction): Line {
  return { kind: 'say', text, mood, gesture };
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** ms to wait after revealing `ch`. Punctuation only pauses at a word boundary. */
function charDelay(ch: string, next: string | undefined, fast: boolean): number {
  const base = fast ? 12 : 26;
  if (next !== undefined && !/\s/.test(next)) return base;
  if ('.!?…'.includes(ch)) return fast ? 90 : 180;
  if (',;:'.includes(ch)) return fast ? 45 : 90;
  return base;
}

interface SpeakOptions {
  /** Wait for the visitor to advance after typing. */
  wait?: boolean;
  /** Auto-advance this many ms after typing (a click skips it). */
  hold?: number;
  /** Don't switch the mode to speaking/waiting (e.g. while choosing). */
  keepMode?: boolean;
}

class Director {
  private started = false;
  private unsubs: (() => void)[] = [];

  private flow: AbortController | null = null;
  private flowTopic: TopicId | null = null;
  private finishTyping: (() => void) | null = null;
  private advanceWait: (() => void) | null = null;
  private typing = false;

  private idleTimer = 0;
  private idleHintUsed = false;
  private allDoneShown = false;
  private pokes = 0;
  private pokeSpecialPending = false;
  private poking: { restore: Line | null } | null = null;
  private lastPicks = new WeakMap<readonly unknown[], number>();

  // ---------------------------------------------------------------- lifecycle

  start() {
    if (this.started) return;
    this.started = true;

    this.unsubs.push(
      useAppStore.subscribe((s, prev) => {
        if (s.phase !== prev.phase && s.phase === 'running') this.intro();
        if (s.phase !== 'running') return;
        if (s.topicRequest && s.topicRequest.nonce !== prev.topicRequest?.nonce) {
          this.selectTopic(s.topicRequest.id);
        }
        if (s.pokeNonce !== prev.pokeNonce) this.poke();
      })
    );

    window.addEventListener('keydown', this.onKey);
    window.addEventListener('pointerdown', this.onInteract, { passive: true });
    this.unsubs.push(() => {
      window.removeEventListener('keydown', this.onKey);
      window.removeEventListener('pointerdown', this.onInteract);
    });

    // Remount while already running (HMR): don't leave the dialogue stuck.
    if (app().phase === 'running') {
      if (useDialogue.getState().mode === 'idle') this.intro();
      else {
        const d = useDialogue.getState();
        if (d.line) ui({ typed: Array.from(d.line.text).length, done: true });
        this.enterChoosing();
      }
    }
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    this.cancelFlow();
    for (const u of this.unsubs) u();
    this.unsubs = [];
  }

  // ---------------------------------------------------------------- public API

  /** Click on the bubble, Space or Enter: finish typing, else next line. */
  advance = () => {
    if (this.finishTyping) {
      this.finishTyping();
      return;
    }
    const resolve = this.advanceWait;
    if (resolve) {
      this.advanceWait = null;
      resolve();
    }
  };

  selectTopic = (id: TopicId) => {
    if (app().phase !== 'running') return;
    if (this.flow && this.flowTopic === id) return; // already on it
    const topic = TOPIC_BY_ID.get(id);
    if (!topic) {
      warnOnce(`topic-${id}`, `no content for topic "${id}"`);
      return;
    }
    this.startFlow(id, (signal) => this.topicFlow(topic, signal));
  };

  /** Free-text question from the ask input. */
  ask = (raw: string) => {
    const text = raw.trim().slice(0, 200);
    if (!text || app().phase !== 'running') return;
    const prevId = useDialogue.getState().userText?.id ?? 0;
    ui({ userText: { text, id: prevId + 1 } });

    const r = route(text);
    if (r.type === 'topic') {
      this.selectTopic(r.id);
      return;
    }
    const intent = r.type === 'smalltalk' ? r.intent : 'unknown';
    this.startFlow(null, async (signal) => {
      ui({ mode: 'choosing' });
      const opts = { keepMode: true };
      switch (intent) {
        case 'greeting':
          await this.speak(say(this.pick(GREETING_REPLIES), 'happy', 'wave'), signal, opts);
          break;
        case 'name':
          await this.speak({ ...NAME_REPLY, gesture: NAME_REPLY.gesture ?? 'jump' }, signal, opts);
          break;
        case 'thanks':
          await this.speak({ ...THANKS_REPLY, gesture: THANKS_REPLY.gesture ?? 'celebrate' }, signal, opts);
          break;
        case 'joke': {
          const joke = this.pick(JOKES);
          await this.speak(say(joke.setup, 'thinking', 'think'), signal, { ...opts, hold: 1400 });
          await this.speak(say(joke.punchline, 'excited', 'jump'), signal, opts);
          break;
        }
        default:
          await this.speak({ ...UNKNOWN_REPLY, gesture: UNKNOWN_REPLY.gesture ?? 'shrug' }, signal, opts);
      }
      this.enterChoosing();
    });
  };

  /** "Andere Frage": leave the current topic and show the chips again. */
  backToChoosing = () => {
    if (!useDialogue.getState().inTopic) return;
    this.startFlow(null, async (signal) => {
      const s = app();
      s.setHighlight(null);
      s.setActiveTopic(null);
      s.setFacing('camera');
      ui({ mode: 'choosing', inTopic: null });
      await this.speak(say(this.pick(SWITCH_LINES)), signal, { keepMode: true });
      this.enterChoosing();
    });
  };

  // ---------------------------------------------------------------- flows

  private intro() {
    this.startFlow(null, async (signal) => {
      ui({ mode: 'idle', inTopic: null });
      await this.sleep(INTRO_DELAY, signal);
      app().play('wave');
      for (let i = 0; i < INTRO.length; i++) {
        await this.speak(INTRO[i], signal, { wait: i < INTRO.length - 1 });
      }
      this.enterChoosing();
    });
  }

  private async topicFlow(topic: Topic, signal: AbortSignal) {
    const s = app();
    const spot = TOPIC_NODES[topic.id].spot;
    const alreadyThere = s.currentSpot === spot && !s.walking;

    s.setHighlight(null);
    s.setActiveTopic(topic.id);
    s.setFocus(topic.id);
    s.walkTo(spot);
    if (!alreadyThere) babble.whoosh();
    ui({ mode: 'walking', inTopic: topic.id });

    await Promise.all([
      this.speak(say(topic.reaction, 'excited'), signal, { hold: REACTION_HOLD, keepMode: true }),
      this.waitArrival(spot, signal),
    ]);

    const a = app();
    a.setFacing('camera');
    a.setHighlight(topic.id);
    a.play('point');
    a.setScreenTitle(topic.title);
    await this.sleep(300, signal);

    for (const line of topic.lines) {
      await this.speak(line, signal, { wait: true });
    }

    const done = app();
    done.markVisited(topic.id);
    done.setHighlight(null);
    done.setActiveTopic(null);
    this.flowTopic = null; // picking the same topic again restarts it
    ui({ inTopic: null });

    const visited = app().visited;
    if (!this.allDoneShown && TOPIC_IDS.every((id) => visited.includes(id))) {
      this.allDoneShown = true;
      app().setScreenTitle('DANKE!');
      for (let i = 0; i < ALL_DONE.length; i++) {
        const last = i === ALL_DONE.length - 1;
        if (last) ui({ mode: 'choosing' });
        await this.speak(ALL_DONE[i], signal, { wait: !last, keepMode: last });
      }
    } else {
      ui({ mode: 'choosing' });
      await this.speak(say(this.pick(FOLLOW_UPS)), signal, { keepMode: true });
    }
    this.enterChoosing();
  }

  private poke() {
    this.pokes++;
    if (this.pokes === 5) this.pokeSpecialPending = true;
    app().play('jump');

    // Only talk back while resting in front of the chips; otherwise just hop.
    if (useDialogue.getState().mode !== 'choosing' || this.typing) return;

    const special = this.pokeSpecialPending;
    this.pokeSpecialPending = false;
    const line = special
      ? say(POKE_SPECIAL, 'proud', 'celebrate')
      : say(this.pick(POKE_LINES), 'excited');
    // A poke during another poke's hold restores the original line, not the poke line.
    const token = { restore: this.poking ? this.poking.restore : useDialogue.getState().line };

    this.startFlow(null, async (signal) => {
      this.poking = token;
      try {
        await this.speak(line, signal, { hold: special ? 2600 : POKE_HOLD, keepMode: true });
        if (token.restore) this.showStatic(token.restore);
        this.enterChoosing();
      } finally {
        if (this.poking === token) this.poking = null;
      }
    });
  }

  private idleHint() {
    this.idleTimer = 0;
    if (this.idleHintUsed || useDialogue.getState().mode !== 'choosing' || this.typing) return;
    this.idleHintUsed = true;
    this.startFlow(null, async (signal) => {
      await this.speak(say(this.pick(IDLE_HINTS), 'thinking', 'think'), signal, { keepMode: true });
      this.enterChoosing();
    });
  }

  // ---------------------------------------------------------------- primitives

  private startFlow(topic: TopicId | null, run: (signal: AbortSignal) => Promise<void>) {
    this.cancelFlow();
    const ac = new AbortController();
    this.flow = ac;
    this.flowTopic = topic;
    run(ac.signal)
      .catch((err: unknown) => {
        if (err instanceof Cancelled) return;
        console.error('[director]', err);
        if (this.flow === ac) this.enterChoosing();
      })
      .finally(() => {
        if (this.flow === ac) {
          this.flow = null;
          this.flowTopic = null;
        }
      });
  }

  private cancelFlow() {
    this.clearIdle();
    if (this.flow) {
      this.flow.abort();
      this.flow = null;
      this.flowTopic = null;
    }
    this.finishTyping = null;
    this.advanceWait = null;
    this.setTyping(false);
    ui({ awaiting: false });
  }

  private enterChoosing() {
    ui({ mode: 'choosing', inTopic: null, awaiting: false });
    this.armIdle();
  }

  private setMode(mode: DialogueMode) {
    if (useDialogue.getState().mode !== mode) ui({ mode });
  }

  private setTyping(on: boolean) {
    this.typing = on;
    if (app().talking !== on) app().setTalking(on);
  }

  /** Put a new line into the bubble (pop + gesture). */
  private show(line: Line) {
    ui({ line, lineId: useDialogue.getState().lineId + 1, typed: 0, done: false, awaiting: false });
    babble.pop();
    if (line.gesture) app().play(line.gesture);
  }

  /** Put a line back fully typed, without sound or gesture. */
  private showStatic(line: Line) {
    ui({
      line,
      lineId: useDialogue.getState().lineId + 1,
      typed: Array.from(line.text).length,
      done: true,
      awaiting: false,
    });
  }

  private async speak(line: Line, signal: AbortSignal, opts: SpeakOptions = {}) {
    if (signal.aborted) throw new Cancelled();
    if (!opts.keepMode) this.setMode('speaking');
    this.show(line);
    await this.type(line, signal);
    if (opts.hold !== undefined) {
      await this.waitAdvance(signal, opts.hold);
    } else if (opts.wait) {
      if (!opts.keepMode) this.setMode('waiting');
      ui({ awaiting: true });
      await this.waitAdvance(signal);
      ui({ awaiting: false });
    }
  }

  /** Typewriter. Resolves when fully revealed (or finished early via advance()). */
  private type(line: Line, signal: AbortSignal): Promise<void> {
    const chars = Array.from(line.text);
    const mood = line.mood ?? 'happy';
    const fast = reducedMotion();

    return new Promise<void>((resolve, reject) => {
      let i = 0;
      let timer = 0;
      const end = () => {
        window.clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        this.finishTyping = null;
        this.setTyping(false);
      };
      const finish = () => {
        ui({ typed: chars.length, done: true });
        end();
        resolve();
      };
      const onAbort = () => {
        end();
        reject(new Cancelled());
      };
      const step = () => {
        const ch = chars[i++];
        ui({ typed: i });
        babble.char(ch, mood);
        if (i >= chars.length) finish();
        else timer = window.setTimeout(step, charDelay(ch, chars[i], fast));
      };

      signal.addEventListener('abort', onAbort, { once: true });
      this.finishTyping = finish;
      this.setTyping(true);
      babble.begin(line.text);
      if (chars.length === 0) finish();
      else timer = window.setTimeout(step, FIRST_CHAR_DELAY);
    });
  }

  /** Resolves on advance() or after `ms` (if given). */
  private waitAdvance(signal: AbortSignal, ms?: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let timer = 0;
      const cleanup = () => {
        window.clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        if (this.advanceWait === done) this.advanceWait = null;
      };
      const done = () => {
        cleanup();
        resolve();
      };
      const onAbort = () => {
        cleanup();
        reject(new Cancelled());
      };
      if (signal.aborted) {
        reject(new Cancelled());
        return;
      }
      this.advanceWait = done;
      if (ms !== undefined) timer = window.setTimeout(done, ms);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        reject(new Cancelled());
        return;
      }
      const onAbort = () => {
        window.clearTimeout(timer);
        reject(new Cancelled());
      };
      const timer = window.setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  /** Resolves once the scene reports the character standing at `spot`. */
  private waitArrival(spot: string, signal: AbortSignal): Promise<void> {
    const arrived = (s: AppState) => s.currentSpot === spot && !s.walking;
    return new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        reject(new Cancelled());
        return;
      }
      if (arrived(app())) {
        resolve();
        return;
      }
      const cleanup = () => {
        unsub();
        window.clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
      };
      const onAbort = () => {
        cleanup();
        reject(new Cancelled());
      };
      const unsub = useAppStore.subscribe((s) => {
        if (arrived(s)) {
          cleanup();
          resolve();
        }
      });
      // Safety net: never hang the conversation if the scene can't walk.
      const timer = window.setTimeout(() => {
        warnOnce('arrival', `no arrive("${spot}") within ${ARRIVAL_TIMEOUT} ms — continuing anyway`);
        cleanup();
        resolve();
      }, ARRIVAL_TIMEOUT);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  // ---------------------------------------------------------------- idle / input

  private armIdle() {
    this.clearIdle();
    if (this.idleHintUsed) return;
    this.idleTimer = window.setTimeout(() => this.idleHint(), IDLE_HINT_AFTER);
  }

  private clearIdle() {
    if (this.idleTimer) window.clearTimeout(this.idleTimer);
    this.idleTimer = 0;
  }

  private onInteract = () => {
    if (this.idleTimer) this.armIdle();
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (app().phase !== 'running' || useDialogue.getState().cvOpen) return;
    this.onInteract();

    const target = e.target instanceof HTMLElement ? e.target : null;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;

    if (e.key === ' ' || e.key === 'Enter') {
      // Let focused buttons/links activate natively.
      if (target?.closest('button, a, [role="button"]')) return;
      e.preventDefault();
      if (!e.repeat) this.advance();
      return;
    }
    if (/^[1-6]$/.test(e.key) && useDialogue.getState().mode === 'choosing') {
      const topic = TOPICS[Number(e.key) - 1];
      if (topic) {
        e.preventDefault();
        babble.tick();
        this.selectTopic(topic.id);
      }
    }
  };

  // ---------------------------------------------------------------- utils

  /** Random pick that avoids repeating the previous pick from the same list. */
  private pick<T>(list: readonly T[]): T {
    if (list.length <= 1) return list[0];
    const prev = this.lastPicks.get(list) ?? -1;
    let i: number;
    if (prev < 0) i = Math.floor(Math.random() * list.length);
    else {
      i = Math.floor(Math.random() * (list.length - 1));
      if (i >= prev) i++;
    }
    this.lastPicks.set(list, i);
    return list[i];
  }
}

export const director = new Director();
