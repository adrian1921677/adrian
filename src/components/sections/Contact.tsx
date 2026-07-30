import { useState, type FormEvent } from 'react';
import Section from '../Section';
import { EMAIL, LINKEDIN } from '../../constants';

const FIELD =
  'w-full rounded-lg bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none transition-colors duration-300 focus:bg-white/[0.07] focus:ring-1 focus:ring-accent/40';

export default function Contact() {
  const [name, setName] = useState('');
  const [from, setFrom] = useState('');
  const [message, setMessage] = useState('');
  const [opened, setOpened] = useState(false);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const subject = `Hallo Adrian! – ${name.trim() || 'jemand aus dem Internet'}`;
    const body = `${message.trim()}\n\n—\n${name.trim()}\n${from.trim()}`;
    const href = `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    window.location.href = href;
    setOpened(true);
  };

  return (
    <Section id="kontakt" eyebrow="// ping adrian" title="Sag Hallo ♡" index="05 / 05">
      <div className="grid gap-16 lg:grid-cols-[1fr_1.1fr] lg:gap-24">
        <div>
          <p className="text-base leading-relaxed text-white/45">
            Projekt, Frage, schlechter Wortwitz über Semikolons — alles willkommen. Ich antworte
            meistens schneller als ein <span className="font-mono text-white/70">npm install</span>.
          </p>

          <a
            href={`mailto:${EMAIL}`}
            className="group mt-8 flex items-center gap-3 text-lg text-white/70 transition-colors duration-300 hover:text-accent sm:text-xl"
          >
            <span className="dot-available h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden="true" />
            <span className="break-all border-b border-white/10 pb-1 transition-colors group-hover:border-accent/50">
              {EMAIL}
            </span>
          </a>

          <a
            href={LINKEDIN}
            target="_blank"
            rel="noreferrer noopener"
            className="group mt-6 inline-flex items-baseline gap-2 font-mono text-[0.7rem] text-white/45 transition-colors duration-300 hover:text-accent"
          >
            <span className="border-b border-white/10 pb-0.5 transition-colors group-hover:border-accent/50">
              LinkedIn
            </span>
            <span
              aria-hidden="true"
              className="transition-transform duration-300 group-hover:translate-x-1"
            >
              ↗
            </span>
          </a>

          <p className="mt-10 font-mono text-[0.7rem] leading-relaxed text-white/30">
            {'// Antwortzeit: 1–2 Werktage'}
            <br />
            {'// Ausnahme: es ist Freitagnachmittag'}
          </p>
        </div>

        <form onSubmit={onSubmit}>
          <div className="space-y-5">
            <div>
              <label
                htmlFor="name"
                className="mb-2 block font-mono text-[0.7rem] tracking-wider text-white/30"
              >
                DEIN NAME
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ada Lovelace"
                className={FIELD}
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="mb-2 block font-mono text-[0.7rem] tracking-wider text-white/30"
              >
                DEINE MAIL
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                placeholder="ada@example.com"
                className={FIELD}
              />
            </div>

            <div>
              <label
                htmlFor="message"
                className="mb-2 block font-mono text-[0.7rem] tracking-wider text-white/30"
              >
                WORUM GEHT&apos;S?
              </label>
              <textarea
                id="message"
                name="message"
                required
                rows={5}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Erzähl mal…"
                className={`${FIELD} resize-none`}
              />
            </div>
          </div>

          <button
            type="submit"
            className="mt-7 w-full rounded-lg bg-accent px-6 py-3.5 text-sm font-semibold text-[#0a0a0a] transition-colors duration-300 hover:bg-white"
          >
            Ab die Post
          </button>

          <p className="mt-4 text-center font-mono text-[0.7rem] leading-relaxed text-white/30">
            {opened
              ? 'Dein Mail-Programm sollte jetzt offen sein. Abschicken musst du selbst ♡'
              : 'Öffnet dein Mail-Programm mit allem schon ausgefüllt.'}
          </p>
        </form>
      </div>
    </Section>
  );
}
