import { useEffect, useRef } from 'react';
import GridBackdrop from './GridBackdrop';
import DecayingName from './DecayingName';
import { BG_IMAGE_1, FRONT_VIDEO, OVERLAY_IMAGE } from '../constants';

/** Radius of the cursor spotlight, in CSS pixels. */
const SPOT_RADIUS = 260;
/** Feather profile of the reveal mask: [stop, alpha]. */
const SPOT_STOPS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [0.4, 1],
  [0.6, 0.75],
  [0.75, 0.4],
  [0.88, 0.12],
  [1, 0],
];

const CURSOR_LERP = 0.1;
const GRID_LERP = 0.06;
const GRID_SHIFT = 16;
const FADE_LERP = 0.08;

/**
 * The mask canvas is rendered well below viewport resolution and stretched
 * back up via `mask-size: 100% 100%`. A radial gradient has no detail to
 * lose, and it keeps the per-frame `toDataURL()` encode cheap.
 */
const MASK_MAX_EDGE = 420;

export default function Hero() {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const revealRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    const reveal = revealRef.current;
    const grid = gridRef.current;
    if (!section || !canvas || !reveal || !grid) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Pointerless devices never get a mousemove, so keep the reveal lit.
    const hasHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    const cursor = { tx: 0, ty: 0, x: 0, y: 0, ti: hasHover ? 0 : 1, i: 0 };
    const parallax = { tx: 0, ty: 0, x: 0, y: 0 };

    let width = 0;
    let height = 0;
    let scale = 1;
    let lastKey = '';
    let pointerSeen = false;

    const measure = () => {
      const rect = section.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      scale = Math.min(1, MASK_MAX_EDGE / Math.max(width, height, 1));
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      lastKey = ''; // a resized canvas is cleared — force a redraw

      // Rest the spotlight over the lower half, where the showreel sits.
      // Re-seeded on every resize until a real pointer takes over, so a
      // zero-height first measurement can't strand it in the corner.
      if (!pointerSeen) {
        cursor.x = cursor.tx = width / 2;
        cursor.y = cursor.ty = height * 0.62;
      }
    };

    measure();

    const paint = (x: number, y: number, intensity: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (intensity > 0.002) {
        const cx = x * scale;
        const cy = y * scale;
        const r = Math.max(1, SPOT_RADIUS * scale);
        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        for (const [stop, alpha] of SPOT_STOPS) {
          gradient.addColorStop(stop, `rgba(255,255,255,${(alpha * intensity).toFixed(4)})`);
        }
        ctx.fillStyle = gradient;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }

      const url = canvas.toDataURL();
      reveal.style.setProperty('-webkit-mask-image', `url(${url})`);
      reveal.style.setProperty('mask-image', `url(${url})`);
    };

    let frame = requestAnimationFrame(function tick() {
      cursor.i += (cursor.ti - cursor.i) * FADE_LERP;

      if (cursor.i < 0.002 && cursor.ti === 0) {
        // Fully hidden — stop chasing so the loop can settle and idle.
        cursor.x = cursor.tx;
        cursor.y = cursor.ty;
      } else {
        cursor.x += (cursor.tx - cursor.x) * CURSOR_LERP;
        cursor.y += (cursor.ty - cursor.y) * CURSOR_LERP;
      }

      parallax.x += (parallax.tx - parallax.x) * GRID_LERP;
      parallax.y += (parallax.ty - parallax.y) * GRID_LERP;
      grid.style.transform = `translate3d(${parallax.x.toFixed(2)}px, ${parallax.y.toFixed(2)}px, 0)`;

      const key = `${cursor.x.toFixed(1)}|${cursor.y.toFixed(1)}|${cursor.i.toFixed(3)}`;
      if (key !== lastKey) {
        lastKey = key;
        paint(cursor.x, cursor.y, cursor.i);
      }

      frame = requestAnimationFrame(tick);
    });

    const onPointerMove = (event: PointerEvent) => {
      const rect = section.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      pointerSeen = true;
      cursor.tx = x;
      cursor.ty = y;
      cursor.ti = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height ? 1 : 0;

      parallax.tx = ((x - rect.width / 2) / (rect.width / 2)) * GRID_SHIFT;
      parallax.ty = ((y - rect.height / 2) / (rect.height / 2)) * GRID_SHIFT;
    };

    const onPointerLeave = () => {
      if (hasHover) cursor.ti = 0;
      parallax.tx = 0;
      parallax.ty = 0;
    };

    const observer = new ResizeObserver(measure);
    observer.observe(section);

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('blur', onPointerLeave);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('blur', onPointerLeave);
    };
  }, []);

  return (
    <section
      id="top"
      ref={sectionRef}
      className="font-helvetica-neue relative h-screen w-full overflow-hidden bg-[#0a0a0a]"
    >
      {/* Layer 1 — parallax grid */}
      <div className="absolute inset-0 z-0 overflow-hidden opacity-10">
        <div ref={gridRef} className="absolute -inset-10 will-change-transform">
          <GridBackdrop />
        </div>
      </div>

      {/* Layer 2 — background image */}
      <div
        className="absolute inset-0 z-10 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${BG_IMAGE_1})` }}
        role="img"
        aria-label="Dunkler, verwunschener Arbeitsplatz"
      />

      {/* Layer 3 — zerfallender Schriftzug */}
      <div className="absolute inset-x-0 top-20 z-20 flex flex-col items-center px-4 sm:top-28 md:top-32">
        <DecayingName />
        <p className="mt-4 font-mono text-[0.7rem] tracking-[0.2em] text-white/45 sm:mt-6">
          {'// meine kleine kreative ecke im internet'}
        </p>
      </div>

      {/* Layer 4 — atmosphere overlay */}
      <img
        src={OVERLAY_IMAGE}
        alt=""
        aria-hidden="true"
        onError={(event) => {
          event.currentTarget.style.display = 'none';
        }}
        className="pointer-events-none absolute inset-0 z-[25] h-full w-full object-cover"
      />

      {/* Layer 5 — spotlight reveal */}
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
      <div
        ref={revealRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-30 will-change-[mask-image]"
        style={{
          WebkitMaskSize: '100% 100%',
          maskSize: '100% 100%',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
        }}
      >
        <video
          src={FRONT_VIDEO}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ clipPath: 'inset(40% 0 0 0)' }}
        />
      </div>

      {/* Layer 6 — Scroll-Hinweis, über dem Spotlight damit er lesbar bleibt */}
      <a
        href="#ueber-mich"
        className="absolute inset-x-0 bottom-24 z-40 flex flex-col items-center gap-2 text-white/30 transition-colors hover:text-accent lg:bottom-10"
      >
        <span className="font-mono text-[0.7rem] tracking-[0.25em]">SCROLL</span>
        <span className="scroll-nudge text-lg leading-none">↓</span>
      </a>
    </section>
  );
}
