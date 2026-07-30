import type { ReactNode } from 'react';
import GridBackdrop from './GridBackdrop';

type SectionProps = {
  id: string;
  eyebrow: string;
  title: string;
  /** Kleine Ordnungsziffer rechts, wie in einer technischen Zeichnung. */
  index?: string;
  children: ReactNode;
};

export default function Section({ id, eyebrow, title, index, children }: SectionProps) {
  return (
    <section
      id={id}
      className="relative scroll-mt-24 overflow-hidden px-5 py-28 sm:px-8 sm:py-36 md:pl-28 lg:pl-32"
    >
      <div className="pointer-events-none absolute inset-0 opacity-[0.06]">
        <GridBackdrop />
      </div>

      {/* Perspektive am Elternteil: der Fluchtpunkt liegt so in der Mitte
          dieses Abschnitts und wandert nicht mit der Seitenhöhe davon. */}
      <div className="relative mx-auto w-full max-w-5xl" style={{ perspective: '1100px' }}>
        <div data-depth style={{ transformStyle: 'preserve-3d', willChange: 'transform' }}>
          <header>
            <p className="font-mono text-[0.7rem] tracking-[0.25em] text-accent/60">{eyebrow}</p>

            <div className="mt-3 flex items-end gap-6">
              <h2 className="serif text-5xl leading-[0.95] text-white sm:text-6xl">{title}</h2>

              {/* Haarlinie statt Rahmen — gibt Struktur, ohne alles einzukasteln */}
              <span
                aria-hidden="true"
                className="mb-4 h-px flex-1 bg-gradient-to-r from-white/10 to-transparent"
              />

              {index && (
                <span aria-hidden="true" className="mb-3 font-mono text-[0.7rem] text-white/30">
                  {index}
                </span>
              )}
            </div>
          </header>

          <div className="mt-14 sm:mt-20">{children}</div>
        </div>
      </div>
    </section>
  );
}
