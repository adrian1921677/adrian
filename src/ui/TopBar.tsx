import { motion } from 'framer-motion';
import { FileText, Gamepad2, Volume2, VolumeX } from 'lucide-react';
import { babble } from '../audio/babble';
import { TOPIC_IDS } from '../data/nodes';
import { useDialogue } from '../dialogue/dialogueStore';
import { useAppStore } from '../state/store';
import { NeonWordmark } from './NeonWordmark';

export function TopBar() {
  const muted = useAppStore((s) => s.muted);
  const visitedCount = useAppStore((s) => s.visited.length);
  const setCvOpen = useDialogue((s) => s.setCvOpen);
  const setGames = useDialogue((s) => s.setGames);

  const toggleSound = () => {
    const next = !muted;
    useAppStore.getState().setMuted(next);
    babble.setMuted(next);
    if (!next) babble.tick();
  };

  return (
    <motion.header
      className="top-bar pointer-events-none"
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
    >
      <div className="select-none">
        <h1 className="sr-only">Adrian Abdullahu</h1>
        <NeonWordmark />
        <p className="wordmark-sub">
          Portfolio
          {visitedCount > 0 && (
            <span className="opacity-80">
              {' · '}
              {visitedCount}/{TOPIC_IDS.length} entdeckt
            </span>
          )}
        </p>
      </div>
      <div className="pointer-events-auto flex gap-2">
        <button
          type="button"
          className="glass-btn"
          onClick={toggleSound}
          aria-pressed={!muted}
          aria-label={muted ? 'Ton einschalten' : 'Ton ausschalten'}
          title={muted ? 'Ton an' : 'Ton aus'}
        >
          {muted ? (
            <VolumeX size={20} strokeWidth={2.2} aria-hidden="true" />
          ) : (
            <Volume2 size={20} strokeWidth={2.2} aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          className="glass-btn"
          onClick={() => {
            babble.tick();
            setGames('menu');
          }}
          aria-label="Momos Spielekiste"
          aria-haspopup="dialog"
          title="Spielekiste"
        >
          <Gamepad2 size={20} strokeWidth={2.2} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="glass-btn"
          onClick={() => setCvOpen(true)}
          aria-label="Lebenslauf als Text"
          aria-haspopup="dialog"
          title="Lebenslauf als Text"
        >
          <FileText size={20} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>
    </motion.header>
  );
}
