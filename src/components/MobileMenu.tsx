import { useEffect } from 'react';
import { NAV_ITEMS } from '../constants';

type MobileMenuProps = {
  onClose: () => void;
};

const BASE_DELAY = 100;
const STEP = 60;

export default function MobileMenu({ onClose }: MobileMenuProps) {
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Menü"
      className="animate-menu-backdrop fixed inset-0 z-[55] flex flex-col bg-[#0a0a0a] md:hidden"
    >
      {/* Schließen */}
      <div className="flex justify-end px-5 py-5">
        <button
          type="button"
          onClick={onClose}
          aria-label="Menü schließen"
          className="liquid-glass animate-menu-close relative flex h-12 w-12 items-center justify-center rounded-full"
        >
          <span className="absolute h-[1.5px] w-5 rotate-45 bg-white" />
          <span className="absolute h-[1.5px] w-5 -rotate-45 bg-white" />
        </button>
      </div>

      {/* Einträge */}
      <nav className="flex flex-1 flex-col items-center justify-center gap-7">
        {NAV_ITEMS.map((item, index) => (
          <a
            key={item.href}
            href={item.href}
            onClick={onClose}
            className="animate-menu-item text-3xl font-medium text-white sm:text-4xl"
            style={{ animationDelay: `${BASE_DELAY + index * STEP}ms` }}
          >
            {item.label}
          </a>
        ))}
      </nav>

      {/* CTA */}
      <div className="flex justify-center px-6 pb-14">
        <a
          href="#kontakt"
          onClick={onClose}
          className="liquid-glass animate-menu-item flex items-center gap-2.5 rounded-full px-6 py-3.5"
          style={{ animationDelay: `${BASE_DELAY + NAV_ITEMS.length * STEP}ms` }}
        >
          <span className="dot-available h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
          <span className="text-sm font-medium text-white">Sag Hallo</span>
        </a>
      </div>
    </div>
  );
}
