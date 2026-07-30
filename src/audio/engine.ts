/**
 * Wald-Ambiente im Hintergrund. Ein einziger AudioContext, faul erzeugt.
 *
 * Wichtig: Browser verbieten Ton ohne Nutzergeste. Wir versuchen den Start
 * deshalb sofort beim Laden und melden „blocked", wenn der Browser ablehnt —
 * dann startet es beim ersten Klick/Scroll/Tastendruck nach.
 */

export const AMBIENCE_URL = '/audio/forest-ambience.mp3';

/** Bewusst leise — soll Hintergrund bleiben. */
const AMBIENCE_GAIN = 0.12;
const FADE_IN = 2.6;
const FADE_OUT = 0.7;
/** Überblendung zwischen zwei Durchläufen, damit der Loop nicht klackt. */
const CROSSFADE = 4;
/** Wie weit im Voraus der nächste Durchlauf eingeplant wird. */
const LOOKAHEAD = 6;

export type StartResult = 'running' | 'blocked' | 'unavailable';

type Engine = {
  ctx: AudioContext;
  master: GainNode;
};

let engine: Engine | null = null;
let buffer: AudioBuffer | null = null;
let loading: Promise<AudioBuffer | null> | null = null;
let nextStart = 0;
let scheduler: number | null = null;
let live: AudioBufferSourceNode[] = [];
let wanted = false;

function getEngine(): Engine | null {
  if (engine) return engine;

  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  const ctx = new Ctor();

  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  engine = { ctx, master };
  return engine;
}

async function loadAmbience(ctx: AudioContext): Promise<AudioBuffer | null> {
  if (buffer) return buffer;
  if (loading) return loading;

  loading = (async () => {
    try {
      const res = await fetch(AMBIENCE_URL);
      if (!res.ok) return null;
      buffer = await ctx.decodeAudioData(await res.arrayBuffer());
      return buffer;
    } catch {
      return null; // Ohne Wald läuft die Seite trotzdem.
    } finally {
      loading = null;
    }
  })();

  return loading;
}

/**
 * Startet einen Durchlauf mit Ein-/Ausblendung. Zwei Durchläufe überlappen
 * sich um CROSSFADE Sekunden — dadurch ist die Schnittkante der gekürzten
 * Datei nicht hörbar.
 */
function playSegment(eng: Engine, buf: AudioBuffer, at: number) {
  const src = eng.ctx.createBufferSource();
  src.buffer = buf;

  const gain = eng.ctx.createGain();
  const end = at + buf.duration;

  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(1, at + CROSSFADE);
  gain.gain.setValueAtTime(1, end - CROSSFADE);
  gain.gain.linearRampToValueAtTime(0, end);

  src.connect(gain).connect(eng.master);
  src.start(at);
  src.stop(end + 0.05);

  live.push(src);
  src.onended = () => {
    live = live.filter((s) => s !== src);
    try {
      src.disconnect();
      gain.disconnect();
    } catch {
      /* schon getrennt */
    }
  };
}

function runScheduler(eng: Engine, buf: AudioBuffer) {
  const step = buf.duration - CROSSFADE;

  const tick = () => {
    // Nach einem suspend/resume kann die geplante Zeit in der Vergangenheit
    // liegen — dann neu ab jetzt aufsetzen statt alles nachzufeuern.
    if (nextStart < eng.ctx.currentTime) nextStart = eng.ctx.currentTime + 0.05;

    while (nextStart < eng.ctx.currentTime + LOOKAHEAD) {
      playSegment(eng, buf, nextStart);
      nextStart += step;
    }
    scheduler = window.setTimeout(tick, (LOOKAHEAD / 2) * 1000);
  };

  tick();
}

function stopAmbience() {
  if (scheduler !== null) {
    window.clearTimeout(scheduler);
    scheduler = null;
  }
  for (const src of live) {
    try {
      src.stop();
    } catch {
      /* schon gestoppt */
    }
  }
  live = [];
  nextStart = 0;
}

export function isRunning() {
  return engine?.ctx.state === 'running' && scheduler !== null;
}

export async function enableAudio(): Promise<StartResult> {
  const eng = getEngine();
  if (!eng) return 'unavailable';

  wanted = true;
  try {
    await eng.ctx.resume();
  } catch {
    /* Autoplay-Sperre — unten als 'blocked' gemeldet */
  }

  if (eng.ctx.state !== 'running') return 'blocked';

  const now = eng.ctx.currentTime;
  eng.master.gain.cancelScheduledValues(now);
  eng.master.gain.setValueAtTime(eng.master.gain.value, now);
  eng.master.gain.linearRampToValueAtTime(AMBIENCE_GAIN, now + FADE_IN);

  const buf = await loadAmbience(eng.ctx);
  // Während des Ladens kann längst wieder ausgeschaltet worden sein.
  if (buf && wanted && scheduler === null) {
    nextStart = eng.ctx.currentTime + 0.15;
    runScheduler(eng, buf);
  }

  return eng.ctx.state === 'running' ? 'running' : 'blocked';
}

export function disableAudio() {
  wanted = false;
  const eng = engine;
  if (!eng) return;

  const now = eng.ctx.currentTime;
  eng.master.gain.cancelScheduledValues(now);
  eng.master.gain.setValueAtTime(eng.master.gain.value, now);
  eng.master.gain.linearRampToValueAtTime(0, now + FADE_OUT);

  window.setTimeout(() => {
    if (wanted) return; // in der Zwischenzeit wieder eingeschaltet
    stopAmbience();
    void eng.ctx.suspend();
  }, FADE_OUT * 1000 + 120);
}

export function suspendForBackground() {
  if (engine && wanted) void engine.ctx.suspend();
}

export function resumeFromBackground() {
  if (engine && wanted) void engine.ctx.resume();
}
