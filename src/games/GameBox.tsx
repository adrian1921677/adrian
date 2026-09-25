import { AnimatePresence } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { babble } from '../audio/babble';
import { useDialogue } from '../dialogue/dialogueStore';
import { ComicModal } from '../ui/ComicModal';
import { FixTheNet } from './FixTheNet';
import { KeepyUppy } from './KeepyUppy';
import { Memory } from './Memory';
import { GAMES, readBest } from './registry';

/** "Spielekiste": menu of mini-games, opened from the top bar, Momo or free text. */
export function GameBox() {
  const games = useDialogue((s) => s.games);
  const setGames = useDialogue((s) => s.setGames);
  const current = GAMES.find((g) => g.id === games);

  return (
    <AnimatePresence>
      {games && (
        <ComicModal
          key="games"
          title={current ? `${current.emoji} ${current.title}` : '🎮 Momos Spielekiste'}
          onClose={() => setGames(null)}
        >
          {current ? (
            <>
              <button type="button" className="game-back" onClick={() => setGames('menu')}>
                <ArrowLeft size={16} strokeWidth={2.8} aria-hidden="true" />
                Alle Spiele
              </button>
              {current.id === 'keepy' && <KeepyUppy />}
              {current.id === 'fix' && <FixTheNet />}
              {current.id === 'memory' && <Memory />}
            </>
          ) : (
            <ul className="game-menu">
              {GAMES.map((g) => {
                const best = readBest(g.id);
                return (
                  <li key={g.id}>
                    <button
                      type="button"
                      className="game-menu-item"
                      onClick={() => {
                        babble.tick();
                        setGames(g.id);
                      }}
                    >
                      <span className="game-menu-emoji" aria-hidden="true">
                        {g.emoji}
                      </span>
                      <span className="flex flex-col items-start text-left">
                        <span className="text-[17px] font-semibold leading-tight">{g.title}</span>
                        <span className="text-[14px] leading-snug text-ink-muted">{g.pitch}</span>
                      </span>
                      {best !== null && (
                        <span className="game-menu-best">
                          🏆 {best}
                          {g.id === 'memory' ? ' Züge' : ''}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ComicModal>
      )}
    </AnimatePresence>
  );
}
