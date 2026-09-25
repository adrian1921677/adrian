import { useEffect, useRef, useState } from 'react';
import { babble } from '../audio/babble';
import { readBest, saveBest } from './registry';

/** Things you can find in Momo's room. */
const SYMBOLS = [
  { emoji: '☕', name: 'Kaffee' },
  { emoji: '🎮', name: 'Controller' },
  { emoji: '⚽', name: 'Fußball' },
  { emoji: '🏐', name: 'Volleyball' },
  { emoji: '🔦', name: 'Scheinwerfer' },
  { emoji: '📞', name: 'Telefon' },
];

interface Card {
  id: number;
  sym: number;
}

function shuffled(): Card[] {
  const cards = SYMBOLS.flatMap((_, sym) => [sym, sym]).map((sym, id) => ({ id, sym }));
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

/** Classic pairs game — fewest moves wins. */
export function Memory() {
  const [cards, setCards] = useState(shuffled);
  const [open, setOpen] = useState<number[]>([]);
  const [found, setFound] = useState<Set<number>>(() => new Set());
  const [moves, setMoves] = useState(0);
  const [best, setBest] = useState(() => readBest('memory'));
  const [record, setRecord] = useState(false);
  const timer = useRef<number>();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const done = found.size === SYMBOLS.length;

  const flip = (idx: number) => {
    if (open.length === 2 || open.includes(idx) || found.has(cards[idx].sym)) return;
    babble.tick();
    const next = [...open, idx];
    setOpen(next);
    if (next.length < 2) return;
    const m = moves + 1;
    setMoves(m);
    const [a, b] = next;
    if (cards[a].sym === cards[b].sym) {
      const f = new Set(found).add(cards[a].sym);
      setFound(f);
      setOpen([]);
      if (f.size === SYMBOLS.length) {
        const isRecord = saveBest('memory', m, true);
        setRecord(isRecord);
        if (isRecord) setBest(m);
        babble.pop();
      }
    } else {
      timer.current = window.setTimeout(() => setOpen([]), 750);
    }
  };

  const restart = () => {
    window.clearTimeout(timer.current);
    setCards(shuffled());
    setOpen([]);
    setFound(new Set());
    setMoves(0);
    setRecord(false);
  };

  return (
    <div className="game-wrap">
      <div className="game-hud">
        <span>
          Züge <b>{moves}</b>
        </span>
        <span>
          Paare <b>{found.size}/{SYMBOLS.length}</b>
        </span>
        <span>
          Rekord <b>{best ?? '–'}</b>
        </span>
      </div>
      <div className="memory-grid">
        {cards.map((c, i) => {
          const up = open.includes(i) || found.has(c.sym);
          return (
            <button
              key={c.id}
              type="button"
              className={`memory-card ${up ? 'is-up' : ''} ${found.has(c.sym) ? 'is-found' : ''}`}
              onClick={() => flip(i)}
              aria-label={up ? SYMBOLS[c.sym].name : `Karte ${i + 1}, verdeckt`}
            >
              <span className="memory-inner" aria-hidden="true">
                <span className="memory-back">?</span>
                <span className="memory-front">{SYMBOLS[c.sym].emoji}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="game-hint" aria-live="polite">
        {done
          ? record
            ? `Neuer Rekord: ${moves} Züge! 🏆`
            : `Geschafft in ${moves} Zügen!`
          : 'Finde alle Paare mit so wenig Zügen wie möglich.'}
      </p>
      {done && (
        <button type="button" className="game-start" onClick={restart}>
          Nochmal mischen
        </button>
      )}
    </div>
  );
}
