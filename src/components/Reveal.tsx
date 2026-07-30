import { useEffect, useRef, type ReactNode } from 'react';

type RevealProps = {
  children: ReactNode;
  className?: string;
  /** Verzögerung in Millisekunden, für gestaffelte Listen. */
  delay?: number;
  /** Richtung, aus der der Inhalt hereinkommt. */
  from?: 'unten' | 'links' | 'rechts';
};

const OFFSET: Record<NonNullable<RevealProps['from']>, string> = {
  unten: 'translate3d(0, 42px, 0)',
  links: 'translate3d(-48px, 0, 0)',
  rechts: 'translate3d(48px, 0, 0)',
};

/**
 * Blendet den Inhalt beim Hereinscrollen ein — einmalig, danach bleibt er
 * stehen. Nichts nervt mehr als Elemente, die beim Zurückscrollen wieder
 * verschwinden.
 */
export default function Reveal({ children, className = '', delay = 0, from = 'unten' }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.style.opacity = '1';
      el.style.transform = 'none';
      return;
    }

    el.style.opacity = '0';
    el.style.transform = OFFSET[from];
    el.style.transition = `opacity 900ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms, transform 900ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          el.style.opacity = '1';
          el.style.transform = 'none';
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [delay, from]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
