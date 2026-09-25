import type { Mood } from '../data/types';
import { talkSignal } from '../state/signals';
import { useAppStore } from '../state/store';

/**
 * Animalese-style mumbling + tiny UI sounds, synthesised with Web Audio (no files).
 * Everything no-ops safely before `unlock()` or when Web Audio is unavailable.
 * The talk signal (mouth movement) is written on every syllable, even when muted.
 */

type Formants = readonly [number, number];

const VOWELS: Record<string, Formants> = {
  a: [800, 1150],
  e: [400, 2000],
  i: [300, 2300],
  o: [450, 800],
  u: [325, 700],
  ä: [600, 1600],
  ö: [430, 1400],
  ü: [310, 1650],
  y: [310, 1700],
};
const BASIC_VOWELS = ['a', 'e', 'i', 'o', 'u'] as const;
const PLOSIVES = new Set(['p', 't', 'k', 'b', 'd', 'g']);
const LETTER = /\p{L}/u;

interface Voice {
  /** Base pitch in Hz */
  base: number;
  /** Relative loudness */
  gain: number;
  /** Minimum ms between syllables */
  minGap: number;
  /** Syllable length in seconds */
  dur: number;
}

const VOICES: Record<Mood, Voice> = {
  happy: { base: 420, gain: 1, minGap: 55, dur: 0.066 },
  excited: { base: 470, gain: 1.05, minGap: 48, dur: 0.058 },
  thinking: { base: 340, gain: 0.9, minGap: 60, dur: 0.07 },
  proud: { base: 390, gain: 1, minGap: 55, dur: 0.068 },
  shy: { base: 380, gain: 0.6, minGap: 58, dur: 0.064 },
};

const MASTER_GAIN = 0.22;
const SYLLABLE_PEAK = 1.6;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let muted = useAppStore.getState().muted;

// Text cursor so consonants can borrow the formants of the next vowel.
let text: string[] = [];
let cursor = 0;
let lettersSinceBlip = 99;
let lastBlipAt = -Infinity;
let prevWasLetter = false;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function nextVowel(from: number): string | null {
  const end = Math.min(text.length, from + 8);
  for (let i = from; i < end; i++) {
    const c = text[i].toLowerCase();
    if (c in VOWELS) return c;
  }
  return null;
}

function live(): AudioContext | null {
  if (!ctx || !master || muted) return null;
  if (ctx.state !== 'running') {
    // e.g. iOS "interrupted" after a call — try to recover, skip this sound.
    ctx.resume().catch(() => undefined);
    return null;
  }
  return ctx;
}

function cleanup(nodes: AudioNode[]) {
  return () => {
    for (const n of nodes) {
      try {
        n.disconnect();
      } catch {
        /* already disconnected */
      }
    }
  };
}

function playSyllable(ac: AudioContext, f0: number, formants: Formants, voice: Voice, plosive: boolean) {
  const out = master!;
  const t = ac.currentTime + 0.002;
  const dur = voice.dur;

  const osc = ac.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(f0 * 0.92, t + dur);

  const f1 = ac.createBiquadFilter();
  f1.type = 'bandpass';
  f1.frequency.value = formants[0];
  f1.Q.value = 7;
  const f2 = ac.createBiquadFilter();
  f2.type = 'bandpass';
  f2.frequency.value = formants[1];
  f2.Q.value = 9;
  const f2Gain = ac.createGain();
  f2Gain.gain.value = 0.7;
  // A little low-passed body keeps the pitch readable.
  const body = ac.createBiquadFilter();
  body.type = 'lowpass';
  body.frequency.value = 1400;
  const bodyGain = ac.createGain();
  bodyGain.gain.value = 0.16;

  const env = ac.createGain();
  const peak = SYLLABLE_PEAK * voice.gain;
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(peak, t + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  env.gain.linearRampToValueAtTime(0, t + dur + 0.008);

  osc.connect(f1).connect(env);
  osc.connect(f2).connect(f2Gain).connect(env);
  osc.connect(body).connect(bodyGain).connect(env);
  env.connect(out);

  osc.onended = cleanup([osc, f1, f2, f2Gain, body, bodyGain, env]);
  osc.start(t);
  osc.stop(t + dur + 0.02);

  if (plosive && noise) {
    const src = ac.createBufferSource();
    src.buffer = noise;
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3000;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.45 * voice.gain, t + 0.001);
    g.gain.linearRampToValueAtTime(0, t + 0.008);
    src.connect(hp).connect(g).connect(out);
    src.onended = cleanup([src, hp, g]);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 0.012);
  }
}

function buildGraph(ac: AudioContext) {
  master = ac.createGain();
  master.gain.value = muted ? 0 : MASTER_GAIN;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 4500;
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 12;
  comp.ratio.value = 3;
  comp.attack.value = 0.003;
  comp.release.value = 0.15;
  master.connect(lp).connect(comp).connect(ac.destination);

  noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
}

function tone(type: OscillatorType, from: number, to: number, dur: number, peak: number) {
  const ac = live();
  if (!ac) return;
  const t = ac.currentTime + 0.002;
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  g.gain.linearRampToValueAtTime(0, t + dur + 0.008);
  osc.connect(g).connect(master!);
  osc.onended = cleanup([osc, g]);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export const babble = {
  /** Create/resume the AudioContext. Call synchronously inside a user gesture. */
  unlock(): Promise<void> {
    try {
      if (!ctx) {
        const AC =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return Promise.resolve();
        ctx = new AC();
        buildGraph(ctx);
      }
      // iOS: playing a buffer inside the gesture unlocks output.
      const silent = ctx.createBuffer(1, 1, ctx.sampleRate);
      const src = ctx.createBufferSource();
      src.buffer = silent;
      src.connect(ctx.destination);
      src.start(0);
      if (ctx.state !== 'running') {
        const timeout = new Promise<void>((r) => window.setTimeout(r, 800));
        return Promise.race([ctx.resume().catch(() => undefined), timeout]).then(() => undefined);
      }
    } catch (err) {
      console.warn('[babble] Web Audio unavailable', err);
    }
    return Promise.resolve();
  },

  setMuted(m: boolean): void {
    muted = m;
    if (ctx && master) master.gain.setTargetAtTime(m ? 0 : MASTER_GAIN, ctx.currentTime, 0.02);
  },

  /**
   * Optional: announce the text about to be typed so consonants can use the
   * formants of the following vowel. `char()` must then be called in order.
   */
  begin(line: string): void {
    text = Array.from(line);
    cursor = 0;
    lettersSinceBlip = 99;
    prevWasLetter = false;
  },

  /** Called for every revealed character; decides itself when to blip. */
  char(ch: string, mood: Mood = 'happy'): void {
    const index = text[cursor] === ch ? cursor : -1;
    cursor++;
    if (!LETTER.test(ch)) {
      prevWasLetter = false;
      return;
    }
    const voice = VOICES[mood] ?? VOICES.happy;
    const wordStart = !prevWasLetter;
    prevWasLetter = true;
    lettersSinceBlip++;

    const now = performance.now();
    if (now - lastBlipAt < voice.minGap) return;
    if (!wordStart && lettersSinceBlip < 2) return;
    lettersSinceBlip = 0;
    lastBlipAt = now;

    const lower = ch.toLowerCase();
    const isVowel = lower in VOWELS;
    talkSignal.lastBlipAt = now;
    talkSignal.intensity = isVowel ? 1 : 0.55;

    const ac = live();
    if (!ac) return;

    const code = hash(lower);
    const vowel = isVowel
      ? lower
      : (index >= 0 ? nextVowel(index + 1) : null) ?? BASIC_VOWELS[code % BASIC_VOWELS.length];
    const step = Math.pow(1.03, (code % 7) - 3);
    const jitter = 1 + (Math.random() - 0.5) * 0.03;
    playSyllable(ac, voice.base * step * jitter, VOWELS[vowel], voice, PLOSIVES.has(lower));
  },

  /** New bubble appears. */
  pop(): void {
    tone('sine', 600, 900, 0.07, 0.45);
  },

  /** Hover / click on a chip. */
  tick(): void {
    tone('sine', 1200, 1200, 0.025, 0.1);
  },

  /** Momo starts walking. */
  whoosh(): void {
    const ac = live();
    if (!ac || !noise) return;
    const t = ac.currentTime + 0.002;
    const src = ac.createBufferSource();
    src.buffer = noise;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(350, t);
    bp.frequency.exponentialRampToValueAtTime(1800, t + 0.14);
    bp.frequency.exponentialRampToValueAtTime(600, t + 0.3);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.12);
    g.gain.linearRampToValueAtTime(0, t + 0.3);
    src.connect(bp).connect(g).connect(master!);
    src.onended = cleanup([src, bp, g]);
    src.start(t, Math.random() * 0.4);
    src.stop(t + 0.32);
  },
};

// Keep in sync with the store even if someone only flips `muted` there.
useAppStore.subscribe((s, prev) => {
  if (s.muted !== prev.muted) babble.setMuted(s.muted);
});
