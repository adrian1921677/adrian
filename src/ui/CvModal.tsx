import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { TOPICS } from '../data/content';
import type { Line } from '../data/types';
import { useDialogue } from '../dialogue/dialogueStore';
import { iconFor } from './icons';

const FOCUSABLE = 'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])';

/**
 * "Lebenslauf als Text": the whole CV as a plain, scrollable document.
 * Fast path for recruiters and screen readers.
 */
export function CvModal() {
  const open = useDialogue((s) => s.cvOpen);
  const setOpen = useDialogue((s) => s.setCvOpen);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const raf = requestAnimationFrame(() => closeRef.current?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      returnFocus.current?.focus();
    };
  }, [open, setOpen]);

  // Keep Tab inside the dialog.
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

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="cv"
          className="pointer-events-auto fixed inset-0 z-40 flex items-end justify-center bg-[rgba(10,7,16,0.62)] p-0 backdrop-blur-sm sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cv-title"
            onKeyDown={trapTab}
            className="cv-panel"
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            <div className="flex items-start justify-between gap-4 border-b-[2.5px] border-ink px-6 pb-4 pt-5 sm:px-8">
              <div>
                <h2 id="cv-title" className="text-[26px] font-bold leading-tight text-ink">
                  Adrian Abdullahu
                </h2>
                <p className="text-[15px] text-ink-muted">Lebenslauf – die Textversion, ohne Umwege.</p>
              </div>
              <button
                ref={closeRef}
                type="button"
                className="cv-close"
                onClick={() => setOpen(false)}
                aria-label="Schließen"
              >
                <X size={20} strokeWidth={2.6} aria-hidden="true" />
              </button>
            </div>

            <div className="cv-scroll">
              {TOPICS.map((topic) => {
                const Icon = iconFor(topic.icon);
                return (
                  <section key={topic.id} aria-labelledby={`cv-${topic.id}`} className="py-5 first:pt-2">
                    <h3
                      id={`cv-${topic.id}`}
                      className="flex items-center gap-2 text-[19px] font-semibold text-ink"
                    >
                      <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-ink bg-lilac">
                        <Icon size={16} strokeWidth={2.4} aria-hidden="true" />
                      </span>
                      {topic.title}
                    </h3>
                    <div className="mt-3 space-y-3">
                      {topic.lines.map((line, i) => (
                        <CvLine key={i} line={line} />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CvLine({ line }: { line: Line }) {
  const text = <p className="text-[16px] font-light leading-relaxed text-ink">{line.text}</p>;
  switch (line.kind) {
    case 'card':
      return (
        <div>
          {text}
          <div className="mt-2 rounded-2xl border-2 border-ink bg-paper px-4 py-3">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-muted">{line.card.period}</p>
            <p className="text-[17px] font-semibold leading-snug text-ink">{line.card.title}</p>
            <p className="text-[14px] text-ink-muted">{line.card.org}</p>
            {line.card.bullets && (
              <ul className="mt-2 list-none space-y-1">
                {line.card.bullets.map((b) => (
                  <li key={b} className="flex gap-2 text-[15px] text-ink">
                    <span aria-hidden="true" className="text-pink">
                      ✦
                    </span>
                    {b}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      );
    case 'skills':
      return (
        <div>
          {text}
          <ul className="mt-2 space-y-1.5">
            {line.skills.map((s) => (
              <li key={s.name} className="grid grid-cols-[1fr_auto] items-center gap-x-3 text-[15px] text-ink">
                <span>{s.name}</span>
                <span className="tabular-nums text-ink-muted">{s.level} / 100</span>
                <span
                  className="col-span-2 mt-0.5 block h-2 overflow-hidden rounded-full bg-lilac-50"
                  aria-hidden="true"
                >
                  <span className="skill-fill block h-full rounded-full" style={{ width: `${s.level}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      );
    case 'contact':
      return (
        <div>
          {text}
          <ul className="mt-2 flex flex-wrap gap-2">
            {line.links.map((l) => {
              const Icon = iconFor(l.icon);
              const external = !l.href.startsWith('mailto:');
              return (
                <li key={l.href}>
                  <a
                    href={l.href}
                    {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    className="contact-btn"
                  >
                    <Icon size={17} strokeWidth={2.4} aria-hidden="true" />
                    <span>{l.label}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      );
    default:
      return text;
  }
}
