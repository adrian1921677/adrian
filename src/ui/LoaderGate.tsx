import { useProgress } from '@react-three/drei';
import { AnimatePresence, motion } from 'framer-motion';
import { RotateCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { babble } from '../audio/babble';
import { useAppStore } from '../state/store';

const STALL_MS = 15_000;

/**
 * Loading screen → "Reinkommen" gate. Covers the canvas until the visitor
 * enters (which is also the user gesture that unlocks audio).
 */
export function LoaderGate() {
  const phase = useAppStore((s) => s.phase);
  const sceneReady = useAppStore((s) => s.sceneReady);
  const progress = useProgress((s) => s.progress);
  const active = useProgress((s) => s.active);
  const errorCount = useProgress((s) => s.errors.length);

  const loaded = progress >= 100 && !active;
  // Everything downloaded but the scene never reported ready (setup crashed)?
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    if (!loaded || sceneReady) return;
    const t = window.setTimeout(() => setStalled(true), STALL_MS);
    return () => window.clearTimeout(t);
  }, [loaded, sceneReady]);

  const failed = (errorCount > 0 || stalled) && !sceneReady;
  const ready = sceneReady && (progress >= 100 || !active);

  useEffect(() => {
    if (ready && phase === 'loading') useAppStore.getState().setPhase('gate');
  }, [ready, phase]);

  const gate = phase === 'gate';
  const pct = Math.round(sceneReady ? 100 : Math.min(99, Math.max(0, progress)));

  return (
    <AnimatePresence>
      {phase !== 'running' && (
        <motion.div
          key="loader"
          className="pointer-events-auto fixed inset-0 z-30 grid place-items-center px-6"
          initial={false}
          animate={{ backgroundColor: gate ? 'rgba(10,7,16,0.5)' : 'rgba(10,7,16,0.94)' }}
          exit={{ opacity: 0, transition: { duration: 0.7, ease: 'easeOut' } }}
          transition={{ duration: 0.8 }}
        >
          <div className="flex w-full max-w-[420px] flex-col items-center text-center">
            <LoaderMomo sad={failed} />
            {failed ? (
              <ErrorPanel />
            ) : gate ? (
              <Gate />
            ) : (
              <Progress pct={pct} />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Progress({ pct }: { pct: number }) {
  return (
    <div className="mt-6 w-full" role="status" aria-live="polite">
      <p className="text-[18px] font-medium text-cream">
        Momo räumt noch schnell auf… <span className="tabular-nums">{pct}&nbsp;%</span>
      </p>
      <div
        className="mx-auto mt-4 h-4 w-full max-w-[300px] overflow-hidden rounded-full bg-[rgba(255,244,230,0.12)] p-[3px]"
        role="progressbar"
        aria-label="Ladefortschritt"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div
          className="skill-fill h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${Math.max(6, pct)}%` }}
        />
      </div>
    </div>
  );
}

function Gate() {
  const [entering, setEntering] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    btnRef.current?.focus({ preventScroll: true });
  }, []);

  const enter = () => {
    if (entering) return;
    setEntering(true);
    // unlock() must start synchronously inside the click.
    babble
      .unlock()
      .catch(() => undefined)
      .then(() => {
        babble.pop();
        useAppStore.getState().setPhase('running');
      });
  };

  return (
    <motion.div
      className="mt-7 flex flex-col items-center"
      initial={{ opacity: 0, y: 16, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 360, damping: 20 }}
    >
      <button ref={btnRef} type="button" className="gate-btn" onClick={enter} disabled={entering}>
        Reinkommen <span aria-hidden="true">👋</span>
      </button>
      <p className="mt-5 text-[15px] font-light text-[rgba(255,244,230,0.7)]">
        am besten mit Ton <span aria-hidden="true">🔊</span>
      </p>
    </motion.div>
  );
}

function ErrorPanel() {
  return (
    <div className="mt-6 flex flex-col items-center" role="alert">
      <p className="text-[18px] font-medium text-cream">Hoppla, das Zimmer konnte nicht geladen werden.</p>
      <p className="mt-1 text-[15px] font-light text-[rgba(255,244,230,0.65)]">
        Vielleicht hilft ein neuer Versuch?
      </p>
      <button type="button" className="gate-btn gate-btn--small mt-6" onClick={() => window.location.reload()}>
        <RotateCw size={18} strokeWidth={2.6} aria-hidden="true" />
        Nochmal laden
      </button>
    </div>
  );
}

/** Tiny SVG Momo that hops while loading (and looks sad on errors). */
function LoaderMomo({ sad }: { sad: boolean }) {
  return (
    <div className={`loader-momo ${sad ? 'is-sad' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 120 124" width="112" height="116" className="loader-momo-body">
        <path d="M60 34 Q58 20 66 11" fill="none" stroke="#1B1530" strokeWidth="3.5" strokeLinecap="round" />
        <circle className="loader-momo-tip" cx="67" cy="10" r="6.5" fill="#FFE58A" stroke="#1B1530" strokeWidth="3" />
        <ellipse cx="30" cy="46" rx="9" ry="10" fill="#B9A6FF" stroke="#1B1530" strokeWidth="3.5" />
        <ellipse cx="90" cy="46" rx="9" ry="10" fill="#B9A6FF" stroke="#1B1530" strokeWidth="3.5" />
        <path
          d="M60 32 C88 32 106 52 106 80 C106 104 88 114 60 114 C32 114 14 104 14 80 C14 52 32 32 60 32 Z"
          fill="#B9A6FF"
          stroke="#1B1530"
          strokeWidth="3.5"
        />
        <path d="M34 56 C40 46 50 42 58 42" fill="none" stroke="#D9CEFF" strokeWidth="5" strokeLinecap="round" />
        <g className="loader-momo-eyes">
          <ellipse cx="45" cy="76" rx="7" ry="9" fill="#1B1530" />
          <ellipse cx="75" cy="76" rx="7" ry="9" fill="#1B1530" />
          <circle cx="47.5" cy="72.5" r="2.6" fill="#FFFDF8" />
          <circle cx="77.5" cy="72.5" r="2.6" fill="#FFFDF8" />
        </g>
        <ellipse cx="33" cy="90" rx="7" ry="4" fill="#FF9DB5" opacity="0.8" />
        <ellipse cx="87" cy="90" rx="7" ry="4" fill="#FF9DB5" opacity="0.8" />
        {sad ? (
          <path d="M53 96 Q60 90 67 96" fill="none" stroke="#1B1530" strokeWidth="3" strokeLinecap="round" />
        ) : (
          <path d="M53 90 Q60 97 67 90" fill="none" stroke="#1B1530" strokeWidth="3" strokeLinecap="round" />
        )}
      </svg>
      <div className="loader-momo-shadow" />
    </div>
  );
}
