import { useId } from 'react';

type GridBackdropProps = {
  className?: string;
};

/**
 * Das 48px-Raster aus dem Hero, wiederverwendbar für die unteren Sections.
 * Pattern-ID kommt aus useId, sonst kollidieren mehrere Instanzen im DOM.
 */
export default function GridBackdrop({ className = '' }: GridBackdropProps) {
  const id = useId().replace(/:/g, '');

  return (
    <svg className={`h-full w-full ${className}`} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <pattern id={id} width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#64748b" strokeWidth="0.6" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
