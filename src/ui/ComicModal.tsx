import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE = 'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])';

let openCount = 0;
/** True while any ComicModal is mounted — the dialogue director pauses its keys then. */
export const isModalOpen = () => openCount > 0;

interface ComicModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Extra keys the content wants (arrows etc.); Esc always closes. */
  onKey?: (e: KeyboardEvent) => void;
  wide?: boolean;
}

/**
 * Comic-style dialog rendered into <body> (the speech bubble is transformed,
 * which would otherwise trap `position: fixed`). Esc closes, Tab stays inside,
 * focus returns to where it came from. Keys are handled in the capture phase
 * and marked defaultPrevented, so the dialogue director ignores them.
 */
export function ComicModal({ title, onClose, children, onKey, wide }: ComicModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const keyRef = useRef(onKey);
  keyRef.current = onKey;
  const closeFn = useRef(onClose);
  closeFn.current = onClose;

  useEffect(() => {
    openCount++;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const raf = requestAnimationFrame(() => closeRef.current?.focus());
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeFn.current();
        return;
      }
      keyRef.current?.(e);
    };
    window.addEventListener('keydown', handle, true);
    return () => {
      openCount--;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', handle, true);
      returnFocus?.focus();
    };
  }, []);

  const trapTab = (e: ReactKeyboardEvent) => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <motion.div
      className="comic-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={trapTab}
        className={`comic-panel ${wide ? 'is-wide' : ''}`}
        initial={{ opacity: 0, y: 30, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      >
        <div className="comic-head">
          <h2 className="comic-title">{title}</h2>
          <button ref={closeRef} type="button" className="cv-close" onClick={onClose} aria-label="Schließen">
            <X size={20} strokeWidth={2.8} aria-hidden="true" />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>,
    document.body,
  );
}
