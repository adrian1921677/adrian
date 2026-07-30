import { useEffect } from 'react';

/** Maximale Neigung an den Bildschirmrändern, in Grad. */
const MAX_TILT = 6;
/** Wie weit ein Block am Rand nach hinten rückt, in Pixeln. */
const MAX_DEPTH = 96;

/**
 * Blöcke mit `data-depth` liegen auf einer gedachten Trommel: Was in der
 * Bildmitte steht, zeigt flach nach vorn — was zum Rand wandert, kippt weg
 * und rückt nach hinten. Dadurch fühlt sich Scrollen nach Bewegung durch
 * einen Raum an statt nach Verschieben einer Fläche.
 *
 * Die Perspektive sitzt am jeweiligen Elternelement, nicht global: so hat
 * jeder Block seinen eigenen, stabilen Fluchtpunkt.
 */
export function useDepthScroll() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let targets: HTMLElement[] = [];

    const collect = () => {
      targets = Array.from(document.querySelectorAll<HTMLElement>('[data-depth]'));
    };
    collect();

    // Neue Abschnitte (z. B. durch Code-Änderungen im Dev) mit aufnehmen.
    const observer = new MutationObserver(collect);
    observer.observe(document.body, { childList: true, subtree: true });

    let frame = requestAnimationFrame(function tick() {
      const viewport = window.innerHeight;
      const middle = viewport / 2;

      for (const el of targets) {
        const rect = el.getBoundingClientRect();

        // Komplett außerhalb: nicht anfassen, spart Layoutarbeit.
        if (rect.bottom < -viewport || rect.top > viewport * 2) continue;

        // Auf ±1 begrenzt: eine Viewporthöhe Abstand zur Mitte ist der volle
        // Ausschlag. Ohne diese Klemme überschreiten Neigung und Tiefe die
        // Werte, die die Konstanten oben versprechen.
        const centre = rect.top + rect.height / 2;
        const offset = Math.max(-1, Math.min(1, (centre - middle) / viewport));

        const tilt = -offset * MAX_TILT;
        const depth = -Math.abs(offset) * MAX_DEPTH;

        el.style.transform = `translate3d(0, 0, ${depth.toFixed(1)}px) rotateX(${tilt.toFixed(2)}deg)`;
      }

      frame = requestAnimationFrame(tick);
    });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      for (const el of targets) el.style.transform = '';
    };
  }, []);
}
