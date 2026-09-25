import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { director } from '../dialogue/director';
import { useDialogue } from '../dialogue/dialogueStore';
import { bubbleAnchor } from '../state/signals';
import { useAppStore } from '../state/store';
import { GameBox } from '../games/GameBox';
import { AskInput } from './AskInput';
import { CvModal } from './CvModal';
import { uiLayout } from './layout';
import { QuestionChips } from './QuestionChips';
import { AnchoredBubble, DockedBubble } from './SpeechBubble';
import { TopBar } from './TopBar';
import { useMediaQuery } from './useMediaQuery';
import { UserBubble } from './UserBubble';

/**
 * UI layer above the canvas. The root ignores pointer events so clicks reach
 * the 3D scene; each interactive element opts back in.
 */
export function Overlay() {
  const running = useAppStore((s) => s.phase === 'running');
  const anchored = useAnchoredMode();
  const stackRef = useRef<HTMLDivElement>(null);

  // Tell the anchored bubble how much room the bottom stack takes.
  useEffect(() => {
    const el = stackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      uiLayout.bottomInset = el.offsetHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [running]);

  return (
    <div className="pointer-events-none fixed inset-0 z-10 font-kanit">
      {running && (
        <>
          <TopBar />
          {anchored && <AnchoredBubble />}
          <div ref={stackRef} className="bottom-stack">
            <div className="flex w-full max-w-[900px] flex-col items-stretch gap-3">
              {!anchored && <DockedBubble />}
              <LeaveTopic />
              <UserBubble />
              <QuestionChips />
              <AskInput />
            </div>
          </div>
        </>
      )}
      <LiveRegion />
      <CvModal />
      <GameBox />
    </div>
  );
}

/** "Andere Frage": leave the current topic early. */
function LeaveTopic() {
  const inTopic = useDialogue((s) => s.inTopic !== null);
  return (
    <AnimatePresence>
      {inTopic && (
        <motion.div
          key="leave"
          className="flex justify-center"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
          transition={{ delay: 0.4 }}
        >
          <button type="button" className="ghost-btn pointer-events-auto" onClick={director.backToChoosing}>
            <ArrowLeft size={16} strokeWidth={2.6} aria-hidden="true" />
            Andere Frage
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Screen-reader mirror of the full current line (the bubble text itself is aria-hidden). */
function LiveRegion() {
  const text = useDialogue((s) => s.line?.text ?? '');
  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true">
      {text ? `Momo: ${text}` : ''}
    </div>
  );
}

/**
 * Anchored bubble on wide screens while the scene projects a visible anchor.
 * Polled per frame; React state only changes when the (debounced) mode flips.
 */
function useAnchoredMode(): boolean {
  const wide = useMediaQuery('(min-width: 640px)');
  const [visible, setVisible] = useState(bubbleAnchor.visible);

  useEffect(() => {
    let raf = 0;
    let state = bubbleAnchor.visible;
    let since = performance.now();
    setVisible(state);
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const v = bubbleAnchor.visible;
      if (v === state) {
        since = now;
        return;
      }
      // Appear quickly, disappear only after a moment (avoids flicker).
      if (now - since > (v ? 120 : 350)) {
        state = v;
        since = now;
        setVisible(v);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return wide && visible;
}
