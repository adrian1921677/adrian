import { useEffect, useState } from 'react';
import { NAV_ITEMS } from '../constants';

type ScrollState = {
  /** 0 … 1 über das gesamte Dokument. */
  progress: number;
  /** href des Abschnitts, der gerade am meisten im Bild ist. */
  activeHref: string | null;
};

/**
 * Fortschritt und aktiver Abschnitt für die Ranke in der Navigation.
 * Bewusst getrennt vom Smooth-Scroll: das hier darf auch laufen, wenn
 * die Dämpfung wegen `prefers-reduced-motion` aus ist.
 */
export function useScrollProgress(): ScrollState {
  const [state, setState] = useState<ScrollState>({ progress: 0, activeHref: null });

  useEffect(() => {
    let frame = 0;

    const read = () => {
      frame = 0;

      const max = document.body.scrollHeight - window.innerHeight;
      const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;

      // Der Abschnitt mit der größten sichtbaren Fläche gewinnt.
      let bestHref: string | null = null;
      let bestVisible = 0;

      for (const item of NAV_ITEMS) {
        const el = document.getElementById(item.href.slice(1));
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        const visible = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
        if (visible > bestVisible) {
          bestVisible = visible;
          bestHref = item.href;
        }
      }

      setState((prev) =>
        Math.abs(prev.progress - progress) < 0.002 && prev.activeHref === bestHref
          ? prev
          : { progress, activeHref: bestHref },
      );
    };

    const onScroll = () => {
      if (frame) return; // pro Frame höchstens einmal messen
      frame = requestAnimationFrame(read);
    };

    read();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return state;
}
