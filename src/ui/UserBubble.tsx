import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useDialogue } from '../dialogue/dialogueStore';

const SHOW_MS = 2800;

/** Echo of the visitor's free-text question ("Du: …"), shown briefly. */
export function UserBubble() {
  const userText = useDialogue((s) => s.userText);
  const [visibleId, setVisibleId] = useState<number | null>(null);

  useEffect(() => {
    if (!userText) return;
    setVisibleId(userText.id);
    const t = window.setTimeout(() => setVisibleId(null), SHOW_MS);
    return () => window.clearTimeout(t);
  }, [userText]);

  const show = userText !== null && visibleId === userText.id;

  return (
    <AnimatePresence>
      {show && (
        <motion.p
          key={userText.id}
          className="user-bubble"
          initial={{ opacity: 0, y: 10, scale: 0.85 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, transition: { duration: 0.2 } }}
          transition={{ type: 'spring', stiffness: 480, damping: 26 }}
        >
          <span className="font-semibold">Du:</span> {userText.text}
        </motion.p>
      )}
    </AnimatePresence>
  );
}
