import { useEffect, useRef, useState } from 'react';
import { babble } from '../audio/babble';
import { readBest, saveBest } from './registry';

const PORTS = 16;
const LIVES = 3;

type PortState = 'ok' | 'fault' | 'gold' | 'fixed' | 'down';
type Phase = 'ready' | 'playing' | 'over';

/**
 * Patch panel whack-a-mole: ports turn red (fault) — click them before the
 * link drops. Golden ports are worth 3. Three dropped links and it's over.
 */
export function FixTheNet() {
  const [ports, setPorts] = useState<PortState[]>(() => Array(PORTS).fill('ok'));
  const [phase, setPhase] = useState<Phase>('ready');
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(LIVES);
  const [best, setBest] = useState(() => readBest('fix'));
  const [record, setRecord] = useState(false);
  const g = useRef({ phase: 'ready' as Phase, score: 0, lives: LIVES, deadlines: Array<number>(PORTS).fill(0), states: Array<PortState>(PORTS).fill('ok'), nextSpawn: 0 });

  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const s = g.current;
      if (s.phase !== 'playing') return;
      let changed = false;
      // Faults that expired drop the link.
      for (let i = 0; i < PORTS; i++) {
        const st = s.states[i];
        if ((st === 'fault' || st === 'gold') && now > s.deadlines[i]) {
          s.states[i] = 'down';
          s.deadlines[i] = now + 700;
          s.lives--;
          changed = true;
          setLives(s.lives);
          if (s.lives <= 0) {
            s.phase = 'over';
            setPhase('over');
            const isRecord = s.score > 0 && saveBest('fix', s.score);
            setRecord(isRecord);
            if (isRecord) {
              setBest(s.score);
              babble.pop();
            }
          }
        } else if ((st === 'fixed' || st === 'down') && now > s.deadlines[i]) {
          s.states[i] = 'ok';
          changed = true;
        }
      }
      // Spawn new faults, faster as the score climbs.
      if (s.phase === 'playing' && now > s.nextSpawn) {
        const free = s.states.map((st, i) => (st === 'ok' ? i : -1)).filter((i) => i >= 0);
        if (free.length) {
          const i = free[Math.floor(Math.random() * free.length)];
          const gold = Math.random() < 0.1;
          s.states[i] = gold ? 'gold' : 'fault';
          s.deadlines[i] = now + Math.max(900, 2300 - s.score * 45) * (gold ? 0.7 : 1);
          changed = true;
        }
        s.nextSpawn = now + Math.max(320, 950 - s.score * 22) * (0.7 + Math.random() * 0.6);
      }
      if (changed) setPorts([...s.states]);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const start = () => {
    const s = g.current;
    s.phase = 'playing';
    s.score = 0;
    s.lives = LIVES;
    s.states.fill('ok');
    s.nextSpawn = performance.now() + 400;
    setPorts([...s.states]);
    setScore(0);
    setLives(LIVES);
    setRecord(false);
    setPhase('playing');
    babble.tick();
  };

  const hit = (i: number) => {
    const s = g.current;
    if (s.phase !== 'playing') return;
    const st = s.states[i];
    if (st !== 'fault' && st !== 'gold') return;
    s.score += st === 'gold' ? 3 : 1;
    s.states[i] = 'fixed';
    s.deadlines[i] = performance.now() + 380;
    setScore(s.score);
    setPorts([...s.states]);
    babble.tick();
  };

  return (
    <div className="game-wrap">
      <div className="game-hud">
        <span>
          Entstört <b>{score}</b>
        </span>
        <span aria-label={`${lives} Leben`}>
          {'💚'.repeat(Math.max(0, lives))}
          {'🖤'.repeat(Math.max(0, LIVES - lives))}
        </span>
        <span>
          Rekord <b>{best ?? '–'}</b>
        </span>
      </div>
      <div className="fix-panel">
        <div className="fix-label">SWITCH · DÜSSELDORF-03</div>
        <div className="fix-grid">
          {ports.map((st, i) => (
            <button
              key={i}
              type="button"
              className={`fix-port is-${st}`}
              onPointerDown={(e) => {
                e.preventDefault();
                hit(i);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  hit(i);
                }
              }}
              disabled={phase !== 'playing'}
              aria-label={`Port ${i + 1}: ${LABEL[st]}`}
            >
              <span className="fix-led" aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
      {phase !== 'playing' ? (
        <button type="button" className="game-start" onClick={start}>
          {phase === 'ready' ? 'Schicht beginnen' : 'Nochmal'}
        </button>
      ) : null}
      <p className="game-hint" aria-live="polite">
        {phase === 'ready' && 'Rote Ports sind gestört – klick sie, bevor die Leitung fällt. Gold zählt dreifach!'}
        {phase === 'playing' && 'Schneller! Das Netz wird unruhig…'}
        {phase === 'over' && (record ? `Neuer Rekord: ${score} Ports! 🏆` : `Netz down nach ${score} Ports. Adrian übernimmt ab hier.`)}
      </p>
    </div>
  );
}

const LABEL: Record<PortState, string> = {
  ok: 'läuft',
  fault: 'gestört',
  gold: 'gestört, dreifache Punkte',
  fixed: 'entstört',
  down: 'ausgefallen',
};
