import { useEffect, useRef } from 'react';

/** Wie träge der Schein dem Punkt folgt. */
const GLOW_EASE = 0.16;

const INTERACTIVE = 'a, button, [role="button"], summary, label';
const TEXTUAL = 'input, textarea, [contenteditable="true"]';

type Mode = 'ruhe' | 'aktiv' | 'text';

/**
 * Glühwürmchen statt Systemzeiger: ein exakter Punkt für die Genauigkeit,
 * dahinter ein weicher Schein, der hinterherzieht. Über Links weitet sich
 * der Schein, über Textfeldern wird er zur Schreibmarke.
 *
 * Nur auf Geräten mit echtem Zeiger — auf Touch gibt es nichts zu ersetzen.
 */
export default function Cursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dot = dotRef.current;
    const glow = glowRef.current;
    if (!dot || !glow) return;

    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!fine) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    document.documentElement.classList.add('firefly');

    const target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const smooth = { ...target };
    let mode: Mode = 'ruhe';
    let visible = false;

    const setMode = (next: Mode) => {
      if (next === mode) return;
      mode = next;
      glow.dataset.mode = next;
      dot.dataset.mode = next;
    };

    const onMove = (event: PointerEvent) => {
      target.x = event.clientX;
      target.y = event.clientY;

      if (!visible) {
        visible = true;
        smooth.x = target.x;
        smooth.y = target.y;
        dot.style.opacity = '1';
        glow.style.opacity = '1';
      }

      const el = event.target;
      if (!(el instanceof Element)) return setMode('ruhe');
      if (el.closest(TEXTUAL)) return setMode('text');
      if (el.closest(INTERACTIVE)) return setMode('aktiv');
      setMode('ruhe');
    };

    const onLeave = () => {
      visible = false;
      dot.style.opacity = '0';
      glow.style.opacity = '0';
    };

    // Beim Klicken kurz zusammenzucken — gibt dem Zeiger Gewicht.
    const onDown = () => glow.classList.add('firefly-press');
    const onUp = () => glow.classList.remove('firefly-press');

    let frame = requestAnimationFrame(function tick() {
      if (reduced) {
        smooth.x = target.x;
        smooth.y = target.y;
      } else {
        smooth.x += (target.x - smooth.x) * GLOW_EASE;
        smooth.y += (target.y - smooth.y) * GLOW_EASE;
      }

      dot.style.transform = `translate3d(${target.x}px, ${target.y}px, 0) translate(-50%, -50%)`;
      glow.style.transform = `translate3d(${smooth.x.toFixed(2)}px, ${smooth.y.toFixed(
        2,
      )}px, 0) translate(-50%, -50%)`;

      frame = requestAnimationFrame(tick);
    });

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);

    return () => {
      cancelAnimationFrame(frame);
      document.documentElement.classList.remove('firefly');
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  return (
    <>
      <div ref={glowRef} className="firefly-glow" data-mode="ruhe" aria-hidden="true" />
      <div ref={dotRef} className="firefly-dot" data-mode="ruhe" aria-hidden="true" />
    </>
  );
}
