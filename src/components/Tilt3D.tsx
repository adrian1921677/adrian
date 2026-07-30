import { useRef, type ReactNode } from 'react';

type Tilt3DProps = {
  children: ReactNode;
  className?: string;
  /** Maximaler Ausschlag in Grad. */
  max?: number;
  scale?: number;
  perspective?: number;
};

/**
 * Neigt den Inhalt zum Zeiger hin. Kinder mit `translateZ(...)` schweben
 * dabei über der Karte — daher `preserve-3d` bis nach unten durch.
 * Auf Touch bewusst inaktiv: dort gibt es kein Hovern, nur Tippen.
 */
export default function Tilt3D({
  children,
  className = '',
  max = 9,
  scale = 1.02,
  perspective = 1100,
}: Tilt3DProps) {
  const innerRef = useRef<HTMLDivElement>(null);

  const reset = () => {
    const el = innerRef.current;
    if (el) el.style.transform = 'rotateX(0deg) rotateY(0deg) scale(1)';
  };

  return (
    <div
      className={className}
      style={{ perspective: `${perspective}px` }}
      onPointerMove={(event) => {
        if (event.pointerType !== 'mouse') return;
        const el = innerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const dx = (event.clientX - rect.left) / rect.width - 0.5;
        const dy = (event.clientY - rect.top) / rect.height - 0.5;
        el.style.transform =
          `rotateX(${(-dy * max * 2).toFixed(2)}deg) ` +
          `rotateY(${(dx * max * 2).toFixed(2)}deg) ` +
          `scale(${scale})`;
      }}
      onPointerLeave={reset}
      onBlur={reset}
    >
      <div ref={innerRef} className="tilt-inner h-full" style={{ transformStyle: 'preserve-3d' }}>
        {children}
      </div>
    </div>
  );
}
