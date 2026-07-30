import { useEffect, useRef } from 'react';

const NAME = 'adrian';

/** Sekunden bis zum vollständigen Zerfall — bewusst geduldig. */
const DECAY_SECONDS = 42;
/** Wie schnell die Berührung den Zerfall zurückholt. Bewusst nicht zu
 *  schnell — sonst ist das Zusammenziehen vorbei, bevor man die Wurzeln sieht. */
const HEAL_PER_SECOND = 0.8;
/** Reichweite des Zeigers, anteilig zur Buchstabenhöhe (mit Untergrenze). */
const REACH_RATIO = 0.8;
const REACH_MIN = 95;
/** Maximale Drift bei vollem Zerfall, anteilig zur Buchstabenhöhe — sonst
 *  zerstreut sich der Schriftzug auf dem Handy über den halben Bildschirm. */
const DRIFT_RATIO = 0.36;
/** Maximale Neigung in Grad bei vollem Zerfall. */
const MAX_TILT = 24;
/** Wurzelstränge pro Buchstabe. */
const STRANDS = 3;

type Letter = {
  el: HTMLSpanElement;
  homeX: number;
  homeY: number;
  anchorY: number;
  size: number;
  seed: number;
  angle: number;
  decay: number;
  influence: number;
  offX: number;
  offY: number;
};

/** Deterministisch — jeder Buchstabe driftet immer gleich, kein Flackern. */
function hash(i: number) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Ein Wurzelstrang vom Ankerpunkt zum Buchstaben. `t` ist das Wachstum (0..1),
 * die Wurzel schlängelt sich leicht und wird zur Spitze hin ruhiger.
 */
function rootPath(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  t: number,
  seed: number,
  strand: number,
) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;

  const spread = (strand - (STRANDS - 1) / 2) * 0.9;
  const segments = 6;
  let d = `M ${x0.toFixed(1)} ${y0.toFixed(1)}`;

  for (let s = 1; s <= segments; s += 1) {
    const f = (s / segments) * t;
    const taper = 1 - f * 0.65;
    const wobble =
      Math.sin(f * Math.PI * 2.4 + seed * 6.2 + strand * 1.9) * 13 * taper + spread * 9 * taper;

    const midF = f - 0.5 / segments;
    const cx = x0 + dx * midF + px * wobble;
    const cy = y0 + dy * midF + py * wobble;
    const ex = x0 + dx * f + px * wobble * 0.55;
    const ey = y0 + dy * f + py * wobble * 0.55;

    d += ` Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
  }

  return d;
}

export default function DecayingName() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const letterRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const svg = svgRef.current;
    if (!wrap || !svg) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const letters: Letter[] = [];

    const measure = () => {
      const width = wrap.offsetWidth;
      const height = wrap.offsetHeight;
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      svg.style.width = `${width}px`;
      svg.style.height = `${height}px`;

      // Zustand sichern, bevor die Liste neu aufgebaut wird — sonst setzt
      // jedes Resize den Zerfall zurück auf null.
      const previous = letters.slice();
      letters.length = 0;

      letterRefs.current.forEach((el, i) => {
        if (!el) return;
        // offset*, nicht getBoundingClientRect: Letzteres liefert die bereits
        // verschobene Position, der Heimatpunkt würde mitwandern.
        const parent = el.offsetParent as HTMLElement | null;
        const baseX = parent && parent !== wrap ? parent.offsetLeft : 0;
        const baseY = parent && parent !== wrap ? parent.offsetTop : 0;

        const prev = previous[i];
        letters.push({
          el,
          homeX: baseX + el.offsetLeft + el.offsetWidth / 2,
          homeY: baseY + el.offsetTop + el.offsetHeight / 2,
          // Wurzeln wachsen aus dem Boden unter dem Buchstaben.
          anchorY: baseY + el.offsetTop + el.offsetHeight * 0.92,
          size: el.offsetHeight || 64,
          seed: hash(i),
          angle: hash(i * 3.3) * Math.PI * 2,
          decay: prev?.decay ?? 0,
          influence: prev?.influence ?? 0,
          offX: prev?.offX ?? 0,
          offY: prev?.offY ?? 0,
        });
      });
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(wrap);

    const pointer = { x: 0, y: 0, active: false };

    const onPointerMove = (event: PointerEvent) => {
      const box = wrap.getBoundingClientRect();
      pointer.x = event.clientX - box.left;
      pointer.y = event.clientY - box.top;
      // Großzügiger Rand, damit die Wurzeln schon vor dem Wort reagieren.
      // Die genaue Reichweite entscheidet dann jeder Buchstabe für sich.
      const margin = Math.max(REACH_MIN, box.height * REACH_RATIO);
      pointer.active =
        pointer.x > -margin &&
        pointer.y > -margin &&
        pointer.x < box.width + margin &&
        pointer.y < box.height + margin;
    };

    const onPointerLeave = () => {
      pointer.active = false;
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('blur', onPointerLeave);

    let last = performance.now();
    let elapsed = 0;
    let frame = requestAnimationFrame(function tick(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      elapsed += dt;

      letters.forEach((letter, i) => {
        const currentX = letter.homeX + letter.offX;
        const currentY = letter.homeY + letter.offY;

        const reach = Math.max(REACH_MIN, letter.size * REACH_RATIO);
        const distance = pointer.active
          ? Math.hypot(pointer.x - currentX, pointer.y - currentY)
          : Infinity;
        const raw = distance === Infinity ? 0 : Math.max(0, 1 - distance / reach);
        letter.influence += (raw - letter.influence) * Math.min(1, dt * 9);

        // Streicheln heilt schneller, als die Zeit zersetzt.
        const rate =
          letter.influence > 0.08
            ? -HEAL_PER_SECOND * letter.influence
            : 1 / DECAY_SECONDS;
        letter.decay = Math.min(1, Math.max(0, letter.decay + rate * dt));

        const pull = letter.decay * (1 - letter.influence * 0.92);
        const drift = pull * letter.size * DRIFT_RATIO;
        const float = reduced ? 0 : pull * letter.size * 0.03;

        const targetX =
          Math.cos(letter.angle) * drift + Math.sin(elapsed * 0.45 + letter.seed * 7) * float;
        const targetY =
          Math.sin(letter.angle) * drift * 0.72 +
          Math.cos(elapsed * 0.37 + letter.seed * 5) * float;

        letter.offX += (targetX - letter.offX) * Math.min(1, dt * 2.2);
        letter.offY += (targetY - letter.offY) * Math.min(1, dt * 2.2);

        const tilt = Math.sin(letter.angle) * MAX_TILT * pull;
        letter.el.style.transform = `translate3d(${letter.offX.toFixed(2)}px, ${letter.offY.toFixed(
          2,
        )}px, 0) rotate(${tilt.toFixed(2)}deg)`;
        // Je zersetzter, desto blasser — als würde der Buchstabe verwehen.
        letter.el.style.opacity = (1 - pull * 0.72).toFixed(3);

        // --- Wurzeln ---------------------------------------------------
        // Sie wachsen aus dem Boden *unter* dem Buchstaben zu ihm hoch. So
        // bleiben sie sichtbar, solange der Zeiger da ist — auch wenn der
        // Buchstabe längst wieder zu Hause ist.
        const grow = Math.min(1, letter.influence * 1.6);
        const groundY = letter.anchorY + letter.size * 0.22;

        for (let s = 0; s < STRANDS; s += 1) {
          const path = pathRefs.current[i * STRANDS + s];
          if (!path) continue;

          if (grow < 0.02) {
            path.style.opacity = '0';
            continue;
          }

          path.setAttribute(
            'd',
            rootPath(letter.homeX, groundY, currentX, currentY, grow, letter.seed + s * 0.31, s),
          );
          path.style.opacity = (grow * 0.85).toFixed(3);
          path.style.strokeWidth = (2.3 - s * 0.45).toFixed(2);
        }
      });

      frame = requestAnimationFrame(tick);
    });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('blur', onPointerLeave);
    };
  }, []);

  return (
    <div ref={wrapRef} className="relative inline-block">
      <svg
        ref={svgRef}
        aria-hidden="true"
        // z-10: die Wurzeln liegen über den Glyphen, sonst verschwinden sie
        // hinter der Schrift und man sieht nur die Enden.
        className="pointer-events-none absolute left-0 top-0 z-10 overflow-visible"
        fill="none"
      >
        {NAME.split('').flatMap((_, i) =>
          Array.from({ length: STRANDS }, (__, s) => (
            <path
              key={`${i}-${s}`}
              ref={(el) => {
                pathRefs.current[i * STRANDS + s] = el;
              }}
              stroke="#a8c08d"
              strokeLinecap="round"
              style={{ opacity: 0 }}
            />
          )),
        )}
      </svg>

      <h1
        aria-label={NAME}
        className="serif relative flex justify-center text-[4.5rem] leading-[0.9] xs:text-[5.5rem] sm:text-[10rem] md:text-[13rem] lg:text-[16rem]"
      >
        {NAME.split('').map((char, i) => (
          <span
            key={i}
            aria-hidden="true"
            ref={(el) => {
              letterRefs.current[i] = el;
            }}
            // Licht fällt von oben ein — pro Buchstabe, damit auch die
            // weggedrifteten korrekt von oben angeleuchtet wirken.
            className="lit-from-above inline-block will-change-transform"
          >
            {char}
          </span>
        ))}
      </h1>
    </div>
  );
}
