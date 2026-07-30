import { useEffect } from 'react';

/** Je kleiner, desto träger zieht der Inhalt nach. */
const EASE = 0.075;
/** Darunter gilt die Bewegung als angekommen. */
const SNAP = 0.06;
/** Wie stark die Scrollgeschwindigkeit den Inhalt schert (Grad pro Pixel). */
const SKEW_PER_PIXEL = 0.035;
/** Deckel, sonst kippt die Seite bei einem Sprung komplett weg. */
const SKEW_MAX = 2.4;

export const SMOOTH_CONTENT_ID = 'smooth-content';

/**
 * Das Dokument scrollt weiterhin ganz normal — nur der Inhalt hängt der
 * Scrollposition verzögert hinterher. Dadurch bleiben Scrollbar, Tastatur,
 * Suchfunktion und Anker unangetastet.
 *
 * Auf Touch aus: dort kämpft die Dämpfung gegen den nativen Momentum-Scroll
 * und fühlt sich schlechter an als gar nichts.
 */
export function useSmoothScroll() {
  useEffect(() => {
    const content = document.getElementById(SMOOTH_CONTENT_ID);
    if (!content) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    if (reduced || coarse) return;

    const root = document.documentElement;
    const previousScrollBehavior = root.style.scrollBehavior;
    // Sonst federt die native Anker-Animation gegen unsere Dämpfung.
    root.style.scrollBehavior = 'auto';

    content.style.position = 'fixed';
    content.style.top = '0';
    content.style.left = '0';
    content.style.width = '100%';
    content.style.willChange = 'transform';

    let current = window.scrollY;
    let frame = 0;

    const syncHeight = () => {
      document.body.style.height = `${content.scrollHeight}px`;
    };
    syncHeight();

    const resizeObserver = new ResizeObserver(syncHeight);
    resizeObserver.observe(content);

    let skew = 0;

    const tick = () => {
      const target = window.scrollY;
      const delta = target - current;
      current += delta * EASE;
      if (Math.abs(delta) < SNAP) current = target;

      // Der Rückstand zur echten Scrollposition ist die gefühlte
      // Geschwindigkeit — daraus wird eine leichte Scherung.
      const wanted = Math.max(-SKEW_MAX, Math.min(SKEW_MAX, delta * SKEW_PER_PIXEL));
      skew += (wanted - skew) * 0.14;
      if (Math.abs(skew) < 0.01) skew = 0;

      content.style.transform =
        `translate3d(0, ${-current.toFixed(2)}px, 0) skewY(${skew.toFixed(3)}deg)`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    // Anker: das Ziel liegt im verschobenen Inhalt, also aus der aktuellen
    // Bildschirmposition plus der bereits gescrollten Strecke rechnen.
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;

      const anchor = (event.target as Element | null)?.closest?.('a[href^="#"]');
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const id = anchor.getAttribute('href')?.slice(1);
      if (!id) return;

      const targetEl = document.getElementById(id);
      if (!targetEl) return;

      event.preventDefault();
      const top = targetEl.getBoundingClientRect().top + current;
      window.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
      history.replaceState(null, '', `#${id}`);
    };

    document.addEventListener('click', onClick);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      document.removeEventListener('click', onClick);
      document.body.style.height = '';
      root.style.scrollBehavior = previousScrollBehavior;
      content.style.position = '';
      content.style.top = '';
      content.style.left = '';
      content.style.width = '';
      content.style.transform = '';
      content.style.willChange = '';
    };
  }, []);
}
