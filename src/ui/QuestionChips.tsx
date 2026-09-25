import { AnimatePresence, motion } from 'framer-motion';
import { Check } from 'lucide-react';
import type { PointerEvent } from 'react';
import { babble } from '../audio/babble';
import { TOPICS } from '../data/content';
import type { TopicId } from '../data/nodes';
import { director } from '../dialogue/director';
import { useDialogue } from '../dialogue/dialogueStore';
import { useAppStore } from '../state/store';
import { iconFor } from './icons';

const hoverTick = (e: PointerEvent) => {
  if (e.pointerType === 'mouse') babble.tick();
};

/** Question chips — the visitor's side of the conversation. Visible while choosing. */
export function QuestionChips() {
  const choosing = useDialogue((s) => s.mode === 'choosing');
  const visited = useAppStore((s) => s.visited);

  return (
    <AnimatePresence>
      {choosing && (
        <motion.nav
          key="chips"
          aria-label="Fragen an Momo"
          className="chip-row pointer-events-auto"
          exit={{ opacity: 0, y: 12, transition: { duration: 0.18 } }}
        >
          {TOPICS.map((t, i) => (
            <Chip
              key={t.id}
              index={i}
              id={t.id}
              question={t.question}
              icon={t.icon}
              visited={visited.includes(t.id)}
            />
          ))}
        </motion.nav>
      )}
    </AnimatePresence>
  );
}

interface ChipProps {
  index: number;
  id: TopicId;
  question: string;
  icon: string;
  visited: boolean;
}

function Chip({ index, id, question, icon, visited }: ChipProps) {
  const Icon = iconFor(icon);
  return (
    <motion.div
      className="chip-slot"
      initial={{ opacity: 0, y: 34, scale: 0.55 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 17, delay: 0.05 + index * 0.065 }}
    >
      {/* Float lives on its own layer so hover/press transforms don't fight it. */}
      <span className="chip-float" style={{ animationDelay: `${-index * 0.83}s` }}>
        <button
          type="button"
          className={`chip ${visited ? 'is-visited' : ''}`}
          onPointerEnter={hoverTick}
          onClick={() => {
            babble.tick();
            director.selectTopic(id);
          }}
          aria-keyshortcuts={String(index + 1)}
          aria-label={visited ? `${question} (schon gefragt)` : question}
        >
          <Icon size={18} strokeWidth={2.4} aria-hidden="true" className="shrink-0" />
          <span>{question}</span>
          {visited && (
            <span className="chip-check" aria-hidden="true">
              <Check size={11} strokeWidth={4} />
            </span>
          )}
        </button>
      </span>
    </motion.div>
  );
}
