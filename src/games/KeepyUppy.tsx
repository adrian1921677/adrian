import { useEffect, useRef, useState } from 'react';
import { babble } from '../audio/babble';
import { readBest, saveBest } from './registry';

const GRAVITY = 1500; // px/s²
const KICK = 640; // px/s upward
const RADIUS = 26;

type Phase = 'ready' | 'playing' | 'over';

/** Tap the ball to keep it in the air. Where you hit it decides where it flies. */
export function KeepyUppy() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>('ready');
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => readBest('keepy'));
  const [record, setRecord] = useState(false);
  const game = useRef({ x: 0, y: 0, vx: 0, vy: 0, spin: 0, kicks: 0, phase: 'ready' as Phase, w: 0, h: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const g = game.current;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      g.w = canvas.clientWidth;
      g.h = canvas.clientHeight;
      canvas.width = Math.round(g.w * dpr);
      canvas.height = Math.round(g.h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (g.phase === 'ready') {
        g.x = g.w / 2;
        g.y = g.h - RADIUS - 14;
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.033);
      last = now;
      if (g.phase === 'playing') {
        // A touch more gravity every 10 kicks keeps it interesting.
        g.vy += GRAVITY * (1 + Math.floor(g.kicks / 10) * 0.08) * dt;
        g.x += g.vx * dt;
        g.y += g.vy * dt;
        g.spin += g.vx * dt * 0.05;
        if (g.x < RADIUS) {
          g.x = RADIUS;
          g.vx = Math.abs(g.vx) * 0.8;
        } else if (g.x > g.w - RADIUS) {
          g.x = g.w - RADIUS;
          g.vx = -Math.abs(g.vx) * 0.8;
        }
        if (g.y < RADIUS) {
          g.y = RADIUS;
          g.vy = Math.abs(g.vy) * 0.5;
        }
        if (g.y - RADIUS > g.h) {
          g.phase = 'over';
          setPhase('over');
          const isRecord = g.kicks > 0 && saveBest('keepy', g.kicks);
          setRecord(isRecord);
          if (isRecord) {
            setBest(g.kicks);
            babble.pop();
          }
        }
      }
      draw(ctx, g.w, g.h, g.x, g.y, g.spin);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const kickAt = (px: number, py: number) => {
    const g = game.current;
    if (g.phase !== 'playing') {
      g.phase = 'playing';
      g.kicks = 0;
      g.x = g.w / 2;
      g.y = g.h - RADIUS - 14;
      g.vx = 0;
      g.vy = -KICK;
      setScore(0);
      setRecord(false);
      setPhase('playing');
      babble.tick();
      return;
    }
    const dx = g.x - px;
    const dy = g.y - py;
    if (dx * dx + dy * dy > (RADIUS * 1.6) ** 2) return; // missed
    g.kicks++;
    g.vy = -KICK - Math.random() * 60;
    g.vx = dx * 9 + (Math.random() - 0.5) * 80;
    setScore(g.kicks);
    babble.tick();
  };

  return (
    <div className="game-wrap">
      <div className="game-hud">
        <span>
          Kicks <b>{score}</b>
        </span>
        <span>
          Rekord <b>{best ?? '–'}</b>
        </span>
      </div>
      <canvas
        ref={canvasRef}
        className="game-canvas touch-none"
        onPointerDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          kickAt(e.clientX - r.left, e.clientY - r.top);
        }}
        aria-label="Spielfeld: tippe den Ball an"
      />
      <p className="game-hint" aria-live="polite">
        {phase === 'ready' && 'Tippen zum Anstoßen – dann den Ball antippen, bevor er fällt!'}
        {phase === 'playing' && 'Links antippen = Ball fliegt nach rechts.'}
        {phase === 'over' && (record ? `Neuer Rekord: ${score}! 🏆 Nochmal?` : `${score} Kicks. Tippen für die nächste Runde.`)}
      </p>
    </div>
  );
}

function draw(ctx: CanvasRenderingContext2D, w: number, h: number, x: number, y: number, spin: number) {
  ctx.clearRect(0, 0, w, h);
  // pitch
  ctx.fillStyle = '#2f7d4f';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let i = 0; i < w; i += 48) ctx.fillRect(i, 0, 24, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(w / 2, h, 70, Math.PI, 0);
  ctx.stroke();
  // shadow
  const lift = Math.max(0, Math.min(1, (h - y) / h));
  ctx.fillStyle = `rgba(0,0,0,${0.28 - lift * 0.18})`;
  ctx.beginPath();
  ctx.ellipse(x, h - 8, RADIUS * (1 - lift * 0.5), 6 * (1 - lift * 0.5), 0, 0, Math.PI * 2);
  ctx.fill();
  // ball
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(spin);
  ctx.fillStyle = '#fbfaf6';
  ctx.strokeStyle = '#1b1530';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1b1530';
  pentagon(ctx, 0, 0, RADIUS * 0.36);
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    pentagon(ctx, Math.cos(a) * RADIUS * 0.86, Math.sin(a) * RADIUS * 0.86, RADIUS * 0.3, a);
  }
  ctx.beginPath();
  ctx.arc(0, 0, RADIUS, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function pentagon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rot = 0) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, RADIUS, 0, Math.PI * 2);
  ctx.clip();
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = rot - Math.PI / 2 + (i * Math.PI * 2) / 5;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
