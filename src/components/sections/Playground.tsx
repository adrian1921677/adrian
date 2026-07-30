import { useEffect, useRef, useState } from 'react';
import Section from '../Section';

type Face = {
  key: string;
  transform: string;
  eyebrow: string;
  headline: string;
  note: string;
  /** 0 = im Schatten, 1 = voll im Licht. Das Licht kommt von oben. */
  light: number;
};

/** Die sechs Seiten sitzen je eine halbe Kantenlänge vom Mittelpunkt weg. */
const HALF = 'calc(var(--cube) / 2)';

const FACES: Face[] = [
  { key: 'top', transform: `rotateX(90deg) translateZ(${HALF})`, eyebrow: 'vim', headline: ':q!', note: 'ich komme hier nie raus', light: 1 },
  { key: 'front', transform: `translateZ(${HALF})`, eyebrow: 'npm run kaffee', headline: '☕', note: 'added 1 package in 0.3s', light: 0.62 },
  { key: 'right', transform: `rotateY(90deg) translateZ(${HALF})`, eyebrow: 'git blame', headline: '🫣', note: '// hier war ich müde', light: 0.48 },
  { key: 'left', transform: `rotateY(-90deg) translateZ(${HALF})`, eyebrow: 'deploy --friday', headline: '⚠', note: 'Abgebrochen. Gern geschehen.', light: 0.48 },
  { key: 'back', transform: `rotateY(180deg) translateZ(${HALF})`, eyebrow: 'rm -rf bugs/', headline: '🐛', note: 'Verzeichnis nicht leer', light: 0.4 },
  { key: 'bottom', transform: `rotateX(-90deg) translateZ(${HALF})`, eyebrow: 'sudo make sandwich', headline: '🥪', note: 'Okay.', light: 0.16 },
];

/** Flächenfarbe und Kantenhelligkeit aus dem Lichtwert ableiten. */
function faceStyle(light: number) {
  const base = 22 + light * 58;
  return {
    background: `linear-gradient(180deg,
      rgba(${Math.round(base * 1.35)}, ${Math.round(base * 1.45)}, ${Math.round(base * 1.2)}, 0.94) 0%,
      rgba(${Math.round(base * 0.7)}, ${Math.round(base * 0.78)}, ${Math.round(base * 0.62)}, 0.94) 100%)`,
    // organic — der Würfel gehört zum Gewachsenen, nicht zur UI-Ebene
    borderColor: `rgba(168, 192, 141, ${(0.2 + light * 0.5).toFixed(2)})`,
  };
}

/** Grad pro Sekunde, solange niemand dran dreht. */
const IDLE_SPIN = 9;

export default function Playground() {
  const cubeRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const cube = cubeRef.current;
    if (!cube) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const angle = { x: -18, y: 24 };
    const velocity = { x: 0, y: 0 };
    let held = false;
    let lastPointer: { x: number; y: number } | null = null;
    let pointerId: number | null = null;

    const apply = () => {
      cube.style.transform = `rotateX(${angle.x.toFixed(2)}deg) rotateY(${angle.y.toFixed(2)}deg)`;
    };
    apply();

    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (!held) {
        // Schwung ausklingen lassen, danach ruhig weiterdrehen.
        velocity.x *= 0.94;
        velocity.y *= 0.94;
        angle.x += velocity.x * dt;
        angle.y += velocity.y * dt + (reduced ? 0 : IDLE_SPIN * dt);
        // Kippachse sanft zurückholen, sonst steht der Würfel irgendwann kopf.
        angle.x += (-18 - angle.x) * Math.min(1, dt * 0.6);
        apply();
      }

      frame = requestAnimationFrame(tick);
    });

    const onDown = (event: PointerEvent) => {
      held = true;
      pointerId = event.pointerId;
      lastPointer = { x: event.clientX, y: event.clientY };
      velocity.x = 0;
      velocity.y = 0;
      cube.setPointerCapture(event.pointerId);
      setDragging(true);
    };

    const onMove = (event: PointerEvent) => {
      if (!held || !lastPointer || event.pointerId !== pointerId) return;
      const dx = event.clientX - lastPointer.x;
      const dy = event.clientY - lastPointer.y;
      lastPointer = { x: event.clientX, y: event.clientY };

      angle.y += dx * 0.45;
      angle.x = Math.max(-80, Math.min(80, angle.x - dy * 0.45));
      velocity.y = dx * 12;
      velocity.x = -dy * 12;
      apply();
    };

    const onUp = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      held = false;
      lastPointer = null;
      pointerId = null;
      setDragging(false);
    };

    cube.addEventListener('pointerdown', onDown);
    cube.addEventListener('pointermove', onMove);
    cube.addEventListener('pointerup', onUp);
    cube.addEventListener('pointercancel', onUp);

    return () => {
      cancelAnimationFrame(frame);
      cube.removeEventListener('pointerdown', onDown);
      cube.removeEventListener('pointermove', onMove);
      cube.removeEventListener('pointerup', onUp);
      cube.removeEventListener('pointercancel', onUp);
    };
  }, []);

  return (
    <Section id="spielplatz" eyebrow="// bitte anfassen" title="Spielplatz" index="04 / 05">
      <div className="grid items-center gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
        <div
          className="cube-scene flex justify-center py-6"
          style={{ perspective: '900px' }}
        >
          <div
            ref={cubeRef}
            role="img"
            aria-label="Drehbarer Würfel mit sechs Konsolenbefehlen"
            className={`relative touch-none select-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            style={{
              width: 'var(--cube)',
              height: 'var(--cube)',
              transformStyle: 'preserve-3d',
            }}
          >
            {FACES.map((face) => (
              <div
                key={face.key}
                className="cube-face rounded-xl"
                style={{ transform: face.transform, ...faceStyle(face.light) }}
              >
                <span
                  className="font-mono text-[0.7rem] tracking-wider"
                  style={{ color: `rgba(232, 213, 166, ${0.35 + face.light * 0.5})` }}
                >
                  {face.eyebrow}
                </span>
                <span
                  className="text-3xl sm:text-4xl"
                  style={{ opacity: 0.45 + face.light * 0.55 }}
                >
                  {face.headline}
                </span>
                <span
                  className="font-mono text-[0.7rem] leading-snug"
                  style={{ color: `rgba(255, 255, 255, ${0.25 + face.light * 0.35})` }}
                >
                  {face.note}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-base leading-relaxed text-white/45">
            Sechs Befehle, null Konsequenzen — ungefähr wie meine Staging-Umgebung. Pack den Würfel
            und dreh ihn. Er läuft danach von selbst weiter, so wie meine Nebenprojekte.
          </p>

          <p className="mt-6 font-mono text-[0.7rem] leading-relaxed text-white/30">
            {'// gebaut aus sechs divs und reiner CSS-Perspektive'}
            <br />
            {'// keine 3D-Bibliothek, kein Megabyte Ballast'}
          </p>

          <div className="mt-8 inline-flex items-center gap-2.5">
            <span className="dot-available h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
            <span className="font-mono text-[0.7rem] text-white/45">ziehen zum Drehen</span>
          </div>
        </div>
      </div>
    </Section>
  );
}
