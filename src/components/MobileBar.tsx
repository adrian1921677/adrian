import SoundToggle from './SoundToggle';

type MobileBarProps = {
  onOpenMenu: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
};

/** Auf kleinen Schirmen wandert die Navigation an den Daumen. */
export default function MobileBar({ onOpenMenu, soundEnabled, onToggleSound }: MobileBarProps) {
  return (
    <div className="fixed bottom-6 right-5 z-50 flex items-center gap-2 md:hidden">
      <SoundToggle enabled={soundEnabled} onToggle={onToggleSound} compact />
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Menü öffnen"
        className="liquid-glass flex flex-col items-end justify-center gap-[5px] rounded-full px-4 py-3.5"
      >
        <span className="h-[1.5px] w-5 bg-white" />
        <span className="h-[1.5px] w-3.5 bg-white" />
      </button>
    </div>
  );
}
