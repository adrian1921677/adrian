import { useEffect } from 'react';

/**
 * Dämpfung pro Sekunde. Höher = strammer. Der Wert geht in eine
 * zeitbasierte Exponentialfunktion ein, ist also unabhängig von der
 * Bildwiederholrate — bei 144 Hz fühlt es sich an wie bei 60 Hz.
 */
const LAMBDA = 9;
/** Wie weit ein Rasterschritt am Mausrad trägt. */
const WHEEL_FACTOR = 1;
/** Darunter gilt die Bewegung als angekommen. */
const SNAP = 0.4;
/** Toleranz, um eigenes Scrollen von fremdem zu unterscheiden. */
const OWN_SCROLL_TOLERANCE = 1.5;

export const SMOOTH_CONTENT_ID = 'smooth-content';

function normalizeWheel(event: WheelEvent) {
  if (event.deltaMode === 1) return event.deltaY * 16; // Zeilen
  if (event.deltaMode === 2) return event.deltaY * window.innerHeight; // Seiten
  return event.deltaY; // Pixel
}

/** Eigene Scrollbereiche (z. B. Codeboxen) sollen sich normal verhalten. */
function scrollableAncestor(node: EventTarget | null): HTMLElement | null {
  let el = node instanceof Element ? node : null;
  while (el && el !== document.body && el !== document.documentElement) {
    const overflowY = getComputedStyle(el).overflowY;
    const scrolls = overflowY === 'auto' || overflowY === 'scroll';
    if (scrolls && el.scrollHeight > el.clientHeight + 1) return el as HTMLElement;
    el = el.parentElement;
  }
  return null;
}

/**
 * Das Mausrad wird vollständig übernommen: Der Browser darf nicht mehr selbst
 * animieren, sonst liegen zwei Glättungen übereinander und es fühlt sich
 * teigig an. Wir sammeln die Radstufen in einem Ziel und fahren die echte
 * Scrollposition zeitbasiert dorthin.
 *
 * Das Dokument scrollt dabei ganz normal — kein verschobener Container.
 * Scrollbalken, Tastatur, Suchfunktion und `position: fixed` bleiben intakt.
 *
 * Aus bei Touch (dort gibt es nativen Schwung, der besser ist als alles
 * Nachgebaute) und bei `prefers-reduced-motion`.
 */
export function useSmoothScroll() {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    if (reduced || coarse) return;

    const root = document.documentElement;
    const previousBehavior = root.style.scrollBehavior;
    // Sonst federt die native Animation gegen unsere Dämpfung.
    root.style.scrollBehavior = 'auto';

    const maxScroll = () => Math.max(0, root.scrollHeight - window.innerHeight);

    let target = window.scrollY;
    let current = window.scrollY;
    let running = false;
    let last = 0;
    let frame = 0;

    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // Zeitbasierte Annäherung statt fester Faktor pro Frame.
      const alpha = 1 - Math.exp(-LAMBDA * dt);
      current += (target - current) * alpha;

      if (Math.abs(target - current) < SNAP) {
        current = target;
        running = false;
      }

      window.scrollTo(0, current);

      frame = running ? requestAnimationFrame(step) : 0;
    };

    const start = () => {
      if (running) return;
      running = true;
      last = performance.now();
      frame = requestAnimationFrame(step);
    };

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return; // Zoomen nicht kapern
      if (scrollableAncestor(event.target)) return;

      event.preventDefault();
      target = Math.max(0, Math.min(maxScroll(), target + normalizeWheel(event) * WHEEL_FACTOR));
      start();
    };

    // Scrollbalken, Tastatur, Sprungmarken: Ziel nachziehen, sonst reißt es
    // die Seite beim nächsten Radimpuls zurück.
    const onScroll = () => {
      if (Math.abs(window.scrollY - current) < OWN_SCROLL_TOLERANCE) return;
      current = window.scrollY;
      target = window.scrollY;
      running = false;
    };

    const onResize = () => {
      target = Math.max(0, Math.min(maxScroll(), target));
    };

    // Anker mit derselben Physik anfahren statt springen zu lassen.
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;

      const anchor = (event.target as Element | null)?.closest?.('a[href^="#"]');
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const id = anchor.getAttribute('href')?.slice(1);
      if (!id) return;

      const targetEl = document.getElementById(id);
      if (!targetEl) return;

      event.preventDefault();
      const top = targetEl.getBoundingClientRect().top + window.scrollY;
      target = Math.max(0, Math.min(maxScroll(), top));
      start();
      history.replaceState(null, '', `#${id}`);
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    document.addEventListener('click', onClick);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('click', onClick);
      root.style.scrollBehavior = previousBehavior;
    };
  }, []);
}
