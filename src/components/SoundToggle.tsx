import { AMBIENCE_TOGGLE_ATTR } from '../hooks/useAmbience';

type SoundToggleProps = {
  enabled: boolean;
  onToggle: () => void;
  compact?: boolean;
};

const BAR_HEIGHTS = ['h-2', 'h-3.5', 'h-2.5'];
const BAR_DELAYS = ['0ms', '160ms', '320ms'];

export default function SoundToggle({ enabled, onToggle, compact = false }: SoundToggleProps) {
  return (
    <button
      type="button"
      {...{ [AMBIENCE_TOGGLE_ATTR]: '' }}
      onClick={onToggle}
      aria-pressed={enabled}
      aria-label={enabled ? 'Ton ausschalten' : 'Ton einschalten'}
      title={enabled ? 'Pssst… aus' : 'Wald anmachen'}
      className={`liquid-glass group flex items-center rounded-full ${
        compact ? 'gap-0 px-4 py-3.5' : 'gap-2.5 px-4 py-2.5'
      }`}
    >
      <span className="flex h-4 items-end gap-[3px]" aria-hidden="true">
        {BAR_HEIGHTS.map((height, index) => (
          <span
            key={index}
            className={`w-[2px] rounded-full transition-all duration-500 ${
              enabled ? `${height} sound-bar bg-accent` : 'h-[2px] bg-white/30'
            }`}
            style={enabled ? { animationDelay: BAR_DELAYS[index] } : undefined}
          />
        ))}
      </span>
      {!compact && (
        <span className="font-mono text-[0.7rem] text-white/45 transition-colors group-hover:text-white">
          {enabled ? 'Wald an' : 'Wald aus'}
        </span>
      )}
    </button>
  );
}
