import Logo from './Logo';
import { EMAIL, LINKEDIN } from '../constants';

export default function Footer() {
  return (
    <footer className="relative border-t border-white/10 px-5 py-10 sm:px-8 md:pl-28 lg:pl-32">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 sm:flex-row sm:justify-between">
        <div className="flex items-center gap-3">
          <Logo size={20} className="opacity-40" />
          <span className="font-mono text-[0.7rem] text-white/45">
            Adrian Abdullahu — {new Date().getFullYear()}
          </span>
        </div>

        <div className="flex flex-col items-center gap-3 sm:items-end">
          <div className="flex items-center gap-4 font-mono text-[0.7rem]">
            <a href={`mailto:${EMAIL}`} className="text-white/45 transition-colors hover:text-accent">
              {EMAIL}
            </a>
            <span aria-hidden="true" className="text-white/30">
              ·
            </span>
            <a
              href={LINKEDIN}
              target="_blank"
              rel="noreferrer noopener"
              className="text-white/45 transition-colors hover:text-accent"
            >
              LinkedIn ↗
            </a>
          </div>
          <p className="text-center font-mono text-[0.7rem] text-white/30 sm:text-right">
            Gebaut mit ♡, zu viel Kaffee und einem Tab Stack&nbsp;Overflow.
          </p>
        </div>
      </div>
    </footer>
  );
}
