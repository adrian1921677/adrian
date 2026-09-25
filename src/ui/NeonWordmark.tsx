import { babble } from '../audio/babble';
import { useAppStore } from '../state/store';

/** Adrian's monogram from the previous site (viewBox 0 0 256 256). */
const LOGO_PATH =
  'M 256 64 L 256 128 L 192.5 128 L 160 95 L 128 64 L 96 95 L 63.5 128 L 64 128 L 128 192 L 128 256 L 64.5 256 L 32 223 L 0 192 L 0 64 L 64 0 L 192 0 Z M 256 192 L 256 256 L 192.5 256 L 160 223 L 128 192 L 128 128 L 192 128 Z';

const FIRST = 'Adrian';
const LAST = 'Abdullahu';

/**
 * The name as a neon sign — same pink tube as the </> sign in the room.
 * It flickers on when you enter, letters hop on hover, and a click makes Momo wave.
 */
export function NeonWordmark() {
  const onClick = () => {
    const s = useAppStore.getState();
    if (s.phase !== 'running' || s.walking) return;
    s.play('wave');
    babble.pop();
  };

  let i = 0;
  const letters = (word: string) =>
    Array.from(word).map((ch) => (
      <span key={i} className="neon-letter" style={{ ['--i' as string]: i++ }}>
        {ch}
      </span>
    ));

  return (
    <button type="button" className="neon-mark pointer-events-auto" onClick={onClick} aria-label="Adrian Abdullahu – Momo winkt">
      <span className="neon-logo" aria-hidden="true">
        <svg viewBox="-24 -24 304 304" width="100%" height="100%">
          <path d={LOGO_PATH} />
        </svg>
      </span>
      <span className="neon-text" aria-hidden="true">
        <span className="neon-first">{letters(FIRST)}</span>
        <span className="neon-last">{letters(LAST)}</span>
      </span>
    </button>
  );
}
