import { useMemo, useState } from 'react';
import SoundToggle from './SoundToggle';
import { NAV_ITEMS } from '../constants';
import { useScrollProgress } from '../hooks/useScrollProgress';

type SideNavProps = {
  soundEnabled: boolean;
  onToggleSound: () => void;
};

const WIDTH = 56;
const CENTER = 28;
const SPACING = 108;
const PAD = 40;
/** Ausschlag der Ranke nach links/rechts. */
const SWAY = 8;
const WAVELENGTH = 58;

const vineX = (y: number) => CENTER + Math.sin(y / WAVELENGTH) * SWAY;

export default function SideNav({ soundEnabled, onToggleSound }: SideNavProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const { progress, activeHref } = useScrollProgress();

  const { height, path, nodes } = useMemo(() => {
    const h = PAD * 2 + (NAV_ITEMS.length - 1) * SPACING;

    let d = `M ${vineX(0).toFixed(2)} 0`;
    for (let y = 6; y <= h; y += 6) {
      d += ` L ${vineX(y).toFixed(2)} ${y}`;
    }

    const n = NAV_ITEMS.map((item, i) => {
      const y = PAD + i * SPACING;
      return { ...item, y, x: vineX(y) };
    });

    return { height: h, path: d, nodes: n };
  }, []);

  return (
    <>
      <nav
        aria-label="Hauptnavigation"
        className="fixed left-3 top-1/2 z-50 hidden -translate-y-1/2 md:block lg:left-6"
        style={{ width: WIDTH, height }}
      >
        <svg
          width={WIDTH}
          height={height}
          viewBox={`0 0 ${WIDTH} ${height}`}
          fill="none"
          aria-hidden="true"
          className="absolute inset-0 overflow-visible"
        >
          {/* Ruhende Ranke — wächst beim Laden von oben nach unten */}
          <path
            d={path}
            stroke="#a8c08d"
            strokeOpacity="0.22"
            strokeWidth="1.2"
            strokeLinecap="round"
            pathLength={1}
            className="vine-grow"
          />

          {/* Zweite Ranke darüber: füllt sich mit dem Scrollfortschritt */}
          <path
            d={path}
            stroke="#e8d5a6"
            strokeOpacity="0.7"
            strokeWidth="1.6"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - progress}
            style={{ transition: 'stroke-dashoffset 240ms linear' }}
          />

          {nodes.map((node) => {
            const isActive = activeHref === node.href;
            const lit = isActive || hovered === node.href;
            return (
              <g key={node.href}>
                {/* Blattpaar, sprießt am aktiven Knoten */}
                {[-1, 1].map((side) => (
                  <ellipse
                    key={side}
                    cx={node.x + side * 9}
                    cy={node.y - 3}
                    rx={7.5}
                    ry={3.2}
                    fill="#a8c08d"
                    transform={`rotate(${side * -28} ${node.x + side * 9} ${node.y - 3})`}
                    style={{
                      transformBox: 'fill-box',
                      transformOrigin: 'center',
                      transition:
                        'opacity 420ms ease, scale 420ms cubic-bezier(0.34, 1.4, 0.5, 1)',
                      transitionDelay: `${side > 0 ? 70 : 0}ms`,
                      opacity: lit ? 0.75 : 0,
                      scale: lit ? '1' : '0.3',
                    }}
                  />
                ))}

                <circle
                  cx={node.x}
                  cy={node.y}
                  r={lit ? 4.6 : 3}
                  fill={lit ? '#e8d5a6' : '#a8c08d'}
                  fillOpacity={lit ? 1 : 0.5}
                  className="transition-all duration-300"
                  style={lit ? { filter: 'drop-shadow(0 0 6px rgba(232, 213, 166, 0.7))' } : undefined}
                />
              </g>
            );
          })}
        </svg>

        {/* Beschriftungen, von unten nach oben lesbar */}
        {nodes.map((node) => {
          const isActive = activeHref === node.href;
          const lit = isActive || hovered === node.href;
          return (
            <a
              key={node.href}
              href={node.href}
              onMouseEnter={() => setHovered(node.href)}
              onMouseLeave={() => setHovered((c) => (c === node.href ? null : c))}
              onFocus={() => setHovered(node.href)}
              onBlur={() => setHovered((c) => (c === node.href ? null : c))}
              aria-current={isActive ? 'true' : undefined}
              className="absolute flex -translate-y-1/2 items-center outline-none"
              style={{ top: node.y, left: node.x + 16 }}
            >
              <span
                className={`text-[0.7rem] font-medium uppercase tracking-[0.26em] transition-all duration-300 ${
                  lit ? 'text-white' : 'text-white/30'
                }`}
                style={{
                  writingMode: 'vertical-rl',
                  transform: `rotate(180deg) translateY(${lit ? '-4px' : '0'})`,
                }}
              >
                {node.label}
              </span>
            </a>
          );
        })}
      </nav>

      {/* Ton-Schalter — Desktop unten links, unter der Ranke */}
      <div className="fixed bottom-8 left-3 z-50 hidden md:block lg:left-6" style={{ width: WIDTH }}>
        <div className="flex justify-center">
          <SoundToggle enabled={soundEnabled} onToggle={onToggleSound} compact />
        </div>
      </div>
    </>
  );
}
