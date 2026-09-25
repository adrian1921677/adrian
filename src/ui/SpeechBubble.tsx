import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useRef } from 'react';
import type { MouseEvent, RefObject } from 'react';
import { director } from '../dialogue/director';
import { useDialogue } from '../dialogue/dialogueStore';
import { bubbleAnchor } from '../state/signals';
import { useAppStore } from '../state/store';
import { uiLayout } from './layout';
import { LineExtras } from './LineExtras';

const MARGIN = 12;
const TAIL = 16; // how far the tail tip sticks out below the box
const GAP = 10; // tail tip → anchor
const SIDE_GAP = 60; // bubble edge → anchor when placed beside Momo
const TAIL_INSET = 30; // keep the tail away from the rounded corners
const FOLLOW = 14; // damping rate for following the anchor

/**
 * Anchored speech bubble: floats above Momo's head, positioned from
 * `bubbleAnchor` in its own rAF loop via a transform on a ref (no React
 * re-render per frame). Falls back to Momo's side if it doesn't fit above.
 */
export function AnchoredBubble() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const tailRef = useRef<HTMLDivElement>(null);
  const hasLine = useDialogue((s) => s.line !== null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const size = { w: 0, h: 0 };
    let snap = true;
    const ro = new ResizeObserver(() => {
      size.w = el.offsetWidth;
      size.h = el.offsetHeight;
      snap = true;
    });
    ro.observe(el);

    let raf = 0;
    let last = performance.now();
    let x = 0;
    let y = 0;
    let placement: 'down' | 'left' | 'right' = 'down';
    // Last values written to the DOM (skip redundant writes).
    let wx = Infinity;
    let wy = Infinity;
    let tailEl: HTMLDivElement | null = null;
    let tailDir = '';
    let tailPos = Infinity;
    let hintSide = '';

    const clamp = (v: number, lo: number, hi: number) => (hi < lo ? lo : v < lo ? lo : v > hi ? hi : v);

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (!bubbleAnchor.visible || size.w === 0) return;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const ax = bubbleAnchor.x;
      const ay = bubbleAnchor.y;
      const w = size.w;
      const h = size.h;
      const minTop = uiLayout.topInset;
      const maxBottom = vh - uiLayout.bottomInset - MARGIN;

      // Prefer above the head; hysteresis so it doesn't flip while Momo bobs.
      const aboveTop = ay - GAP - TAIL - h;
      const fitsAbove = aboveTop >= minTop - (placement === 'down' ? 24 : 0);
      const roomRight = vw - ax - SIDE_GAP - MARGIN;
      const roomLeft = ax - SIDE_GAP - MARGIN;
      let side: 'left' | 'right' | null = null;
      if (!fitsAbove) {
        if (placement === 'left' && roomRight >= w) side = 'right';
        else if (placement === 'right' && roomLeft >= w) side = 'left';
        else if (Math.max(roomLeft, roomRight) >= w) side = roomRight >= roomLeft ? 'right' : 'left';
      }

      let tx: number;
      let ty: number;
      if (side) {
        // Bubble beside Momo; its tail points back toward the head.
        placement = side === 'right' ? 'left' : 'right';
        tx = side === 'right' ? ax + SIDE_GAP : ax - SIDE_GAP - w;
        ty = clamp(ay + 30 - h * 0.4, minTop, maxBottom - h);
      } else {
        placement = 'down';
        tx = clamp(ax - w / 2, MARGIN, vw - MARGIN - w);
        ty = clamp(aboveTop, minTop, maxBottom - h);
      }

      if (snap) {
        x = tx;
        y = ty;
        snap = false;
      } else {
        const k = 1 - Math.exp(-FOLLOW * dt);
        x += (tx - x) * k;
        y += (ty - y) * k;
      }
      if (Math.abs(x - wx) > 0.1 || Math.abs(y - wy) > 0.1) {
        wx = x;
        wy = y;
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
        if (!el.dataset.placed) el.dataset.placed = '1';
      }

      const tail = tailRef.current;
      if (!tail) return;
      let dir: string = placement;
      let pos: number;
      if (placement === 'down') {
        pos = clamp(ax - x, TAIL_INSET, w - TAIL_INSET);
        // Box pushed well over the anchor (no room above) — a tail would point nowhere.
        if (y + h > ay + 20) dir = 'none';
      } else {
        pos = clamp(ay + 30 - y, TAIL_INSET, h - TAIL_INSET);
      }
      if (tail !== tailEl || dir !== tailDir) {
        tailEl = tail;
        tailDir = dir;
        tail.dataset.dir = dir;
        tailPos = Infinity;
      }
      if (Math.abs(pos - tailPos) > 0.25) {
        tailPos = pos;
        tail.style.setProperty('--tail', `${pos.toFixed(1)}px`);
      }
      const side2 = dir === 'down' && pos > w * 0.55 ? 'left' : 'right';
      if (side2 !== hintSide) {
        hintSide = side2;
        el.dataset.hint = side2;
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className="bubble-anchored pointer-events-auto fixed left-0 top-0"
      style={{ visibility: hasLine ? 'visible' : 'hidden' }}
      data-hint="right"
    >
      <BubbleCard tailRef={tailRef} />
    </div>
  );
}

/** Docked speech bubble: a panel at the bottom (narrow screens / anchor off-screen). */
export function DockedBubble() {
  const hasLine = useDialogue((s) => s.line !== null);
  if (!hasLine) return null;
  return (
    <div className="pointer-events-auto mb-2 w-full max-w-[640px] self-center" data-hint="right">
      <BubbleCard />
    </div>
  );
}

function BubbleCard({ tailRef }: { tailRef?: RefObject<HTMLDivElement> }) {
  const line = useDialogue((s) => s.line);
  const lineId = useDialogue((s) => s.lineId);
  const done = useDialogue((s) => s.done);
  const awaiting = useDialogue((s) => s.awaiting);
  const reduce = useReducedMotion();

  if (!line) return null;

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('a, button')) return;
    director.advance();
  };

  return (
    <motion.div
      key={lineId}
      className="bubble-shape relative"
      style={{ transformOrigin: '50% 100%' }}
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.72, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={reduce ? { duration: 0.15 } : { type: 'spring', stiffness: 520, damping: 24, mass: 0.8 }}
    >
      <div
        className={`bubble-box ${done && !awaiting ? '' : 'cursor-pointer'}`}
        onClick={onClick}
      >
        <BubbleText text={line.text} />
        <LineExtras line={line} shown={done} />
      </div>
      {tailRef && <div ref={tailRef} className="bubble-tail" data-dir="down" aria-hidden="true" />}
      <NameTag />
      {awaiting && (
        <button
          type="button"
          className="bubble-next"
          onClick={() => director.advance()}
          aria-label="Weiter"
        >
          weiter <span aria-hidden="true">⏎</span>
        </button>
      )}
    </motion.div>
  );
}

function NameTag() {
  const talking = useAppStore((s) => s.talking);
  return (
    <span className="bubble-name" aria-hidden="true">
      <span className={`bubble-dot ${talking ? 'is-talking' : ''}`} />
      Momo
    </span>
  );
}

/**
 * The full text is always laid out (the unrevealed rest is transparent), so
 * the bubble has its final size from the first frame and never jumps.
 * Hidden from screen readers — the live region announces the whole line.
 */
function BubbleText({ text }: { text: string }) {
  const typed = useDialogue((s) => s.typed);
  const chars = useMemo(() => Array.from(text), [text]);
  const shown = typed >= chars.length ? text : chars.slice(0, typed).join('');
  const rest = typed >= chars.length ? '' : chars.slice(typed).join('');
  return (
    <p className="bubble-text" aria-hidden="true">
      {shown}
      {rest && <span className="bubble-rest">{rest}</span>}
    </p>
  );
}
