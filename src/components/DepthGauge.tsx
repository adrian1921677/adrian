import { useScrollProgress } from '../hooks/useScrollProgress';

/** Gesamtlänge der gedachten Strecke in Metern. */
const RUN_LENGTH = 1240;
const TICKS = 14;

/**
 * Scrollfortschritt als Streckenmessung — angelehnt an ein OTDR, mit dem man
 * im Glasfasernetz die Entfernung bis zur Störstelle misst. Passender als
 * ein Prozentbalken und erklärt nebenbei, womit Adrian arbeitet.
 */
export default function DepthGauge() {
  const { progress } = useScrollProgress();
  const metres = Math.round(progress * RUN_LENGTH);
  const filled = Math.round(progress * TICKS);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed bottom-8 right-6 z-40 hidden select-none text-right font-mono text-[0.7rem] md:block lg:right-10"
    >
      <div className="text-white/45 tabular-nums">
        {String(metres).padStart(4, '0')}
        <span className="text-white/30"> m</span>
      </div>

      <div className="mt-1.5 flex justify-end gap-[3px]">
        {Array.from({ length: TICKS }, (_, i) => (
          <span
            key={i}
            className={`h-2.5 w-px transition-colors duration-300 ${
              i < filled ? 'bg-accent/70' : 'bg-white/10'
            }`}
          />
        ))}
      </div>

      <div className="mt-1.5 text-white/30">
        {progress > 0.985 ? 'ende der strecke' : 'glasfaser'}
      </div>
    </div>
  );
}
