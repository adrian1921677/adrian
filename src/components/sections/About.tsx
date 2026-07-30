import Section from '../Section';
import Tilt3D from '../Tilt3D';
import Reveal from '../Reveal';
import { LINKEDIN } from '../../constants';

/** Geburtstag aus dem Lebenslauf — Alter rechnet sich selbst, statt zu veralten. */
const BIRTHDAY = new Date(2002, 8, 28);

function age() {
  const now = new Date();
  let years = now.getFullYear() - BIRTHDAY.getFullYear();
  const beforeBirthday =
    now.getMonth() < BIRTHDAY.getMonth() ||
    (now.getMonth() === BIRTHDAY.getMonth() && now.getDate() < BIRTHDAY.getDate());
  if (beforeBirthday) years -= 1;
  return years;
}

const STECKBRIEF: Array<[string, string]> = [
  ['zuhause', 'Wuppertal, NRW'],
  ['jahrgang', `2002 · ${age()}`],
  ['beruf', 'IT-Systemelektroniker'],
  ['bei', 'Deutsche Telekom, Düsseldorf'],
  ['netz', 'Kupfer & Glasfaser'],
  ['sprachen', 'Deutsch · Englisch'],
  ['führerschein', 'Klasse B'],
  ['nebenbei', 'React · Next.js · TypeScript'],
];

const SKILLS = [
  'Systeminstallation & -wartung',
  'Fehlerdiagnose & Entstörung',
  'Hardware- und Softwarekonfiguration',
  'Kupfer- und Glasnetz',
  'Benutzersupport & Schulung',
  'Handwerk',
];

export default function About() {
  return (
    <Section
      id="ueber-mich"
      eyebrow="// whoami"
      title="Tagsüber Netz, abends Interface."
      index="01 / 05"
    >
      <div className="grid gap-16 lg:grid-cols-[1.1fr_1fr] lg:gap-24">
        <div>
          <p className="serif text-2xl leading-[1.2] text-white sm:text-3xl">
            Tagsüber suche ich Störungen im Glasfasernetz. Abends baue ich Oberflächen.
          </p>

          <p className="mt-8 max-w-md border-l border-white/10 pl-5 text-base leading-relaxed text-white/45">
            Derselbe Job, ehrlich gesagt — rausfinden, wo es hakt. Angefangen hat es mit Bühnenlicht
            bei Pina Bausch. Seitdem: Level-Design, Logistik, Labor, Telekom.
          </p>

          <a
            href="#werdegang"
            className="group mt-7 inline-flex items-baseline gap-2 font-mono text-[0.7rem] text-white/45 transition-colors duration-300 hover:text-accent"
          >
            <span className="border-b border-white/10 pb-0.5 transition-colors group-hover:border-accent/50">
              ganzer Werdegang
            </span>
            <span
              aria-hidden="true"
              className="transition-transform duration-300 group-hover:translate-x-1"
            >
              →
            </span>
          </a>

          <div className="mt-14">
            <p className="font-mono text-[0.7rem] tracking-[0.2em] text-accent/60">
              {'// was ich kann'}
            </p>
            <ul className="mt-5 space-y-2.5">
              {SKILLS.map((skill, index) => (
                <Reveal key={skill} delay={index * 55}>
                  <li className="group flex items-baseline gap-4 text-sm text-white/45 transition-colors duration-300 hover:text-white">
                    <span className="font-mono text-[0.7rem] text-white/30">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span>{skill}</span>
                    <span
                      aria-hidden="true"
                      className="h-px flex-1 bg-white/10 transition-colors duration-300 group-hover:bg-accent/40"
                    />
                  </li>
                </Reveal>
              ))}
            </ul>
          </div>

          <p className="mt-12 font-mono text-[0.7rem] leading-relaxed text-white/30">
            {'// der Wald läuft schon — Schalter unten links'}
            <br />
            {'// oben über den Namen fahren, der fällt sonst auseinander'}
          </p>
        </div>

        {/* Steckbrief ohne Kasten: Schlüssel, Punktlinie, Wert — wie ein Register.
            Die Ebenen liegen im Raum gestaffelt, dadurch kippt die Liste plastisch. */}
        <Tilt3D max={7} scale={1}>
          <div style={{ transformStyle: 'preserve-3d' }}>
            <p
              className="font-mono text-[0.7rem] tracking-[0.2em] text-accent/60"
              style={{ transform: 'translateZ(30px)' }}
            >
              {'// steckbrief'}
            </p>

            <dl className="mt-6">
              {STECKBRIEF.map(([key, value]) => (
                <div key={key} className="flex items-baseline gap-3 py-3">
                  <dt
                    className="font-mono text-[0.7rem] text-white/30"
                    style={{ transform: 'translateZ(10px)' }}
                  >
                    {key}
                  </dt>
                  <span
                    aria-hidden="true"
                    className="h-px flex-1 border-b border-dotted border-white/10"
                  />
                  <dd className="text-sm text-white/70" style={{ transform: 'translateZ(28px)' }}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>

            <a
              href={LINKEDIN}
              target="_blank"
              rel="noreferrer noopener"
              className="group mt-8 inline-flex items-baseline gap-2 font-mono text-[0.7rem] text-white/45 transition-colors duration-300 hover:text-accent"
              style={{ transform: 'translateZ(36px)' }}
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
          </div>
        </Tilt3D>
      </div>
    </Section>
  );
}
