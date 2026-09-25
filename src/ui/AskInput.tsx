import { AnimatePresence, motion } from 'framer-motion';
import { Send } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { babble } from '../audio/babble';
import { director } from '../dialogue/director';
import { useDialogue } from '../dialogue/dialogueStore';

/** Free-text question field under the chips. */
export function AskInput() {
  const choosing = useDialogue((s) => s.mode === 'choosing');
  const [value, setValue] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = value.trim();
    if (!text) return;
    babble.tick();
    setValue('');
    director.ask(text);
  };

  return (
    <AnimatePresence>
      {choosing && (
        <motion.form
          key="ask"
          onSubmit={submit}
          className="ask-form pointer-events-auto"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12, transition: { duration: 0.15 } }}
          transition={{ type: 'spring', stiffness: 360, damping: 26, delay: 0.3 }}
          role="search"
        >
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Frag Momo etwas…"
            aria-label="Frag Momo etwas"
            maxLength={200}
            autoComplete="off"
            enterKeyHint="send"
            className="ask-input"
          />
          <button type="submit" className="ask-send" aria-label="Frage senden" disabled={!value.trim()}>
            <Send size={18} strokeWidth={2.5} aria-hidden="true" />
          </button>
        </motion.form>
      )}
    </AnimatePresence>
  );
}
