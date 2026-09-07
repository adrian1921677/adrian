import Section from '../Section';
import Reveal from '../Reveal';

type Project = {
  year: string;
  title: string;
  role: string;
  blurb: string;
  stack: string[];
  href: string;
  host: string;
  /** If set, project is a download — shows a download button instead of a site link. */
  downloadHref?: string;
  downloadLabel?: string;
};

const PROJECTS: Project[] = [
  {
    year: '2026',
    title: 'Signal Desk',
    role: 'Desktop-Tool · Windows',
    blurb:
      'Echtzeit-Signalhilfe für Trader: Marktticks werden zu Kerzen, technische Muster automatisch erkannt, und ein LLM prüft jedes Signal gegen die aktuelle Nachrichtenlage. Das Dashboard zeigt bestätigte Signale in dem Moment, in dem sie entstehen — inklusive Stop, Target und historischer Trefferquote. Signal Desk platziert keine Trades, es liefert Entscheidungshilfen.',
    stack: ['Next.js', 'Electron', 'Supabase', 'LLM', 'Binance'],
    href: '#',
    host: 'Windows .exe',
    downloadHref: '/downloads/SignalDesk-Setup-0.1.0.exe',
    downloadLabel: 'Download für Windows',
  },
  {
    year: '2026',
    title: 'Mieter +Plus',
    role: 'Plattform · Web & App',
    blurb:
      'Wohnungsmängel melden, ohne Zettelwirtschaft: Foto rein, Status live verfolgen, direkt mit der Verwaltung chatten. Vermieter bekommen ein Dashboard zum Priorisieren und Delegieren, dazu ein revisionssicheres Audit-Log. Server in Frankfurt, Row-Level-Security, DSGVO von Anfang an mitgedacht.',
    stack: ['Next.js', 'React', 'Row-Level-Security', 'iOS & Android'],
    href: 'https://mieterplus.abdullahu.de/',
    host: 'mieterplus.abdullahu.de',
  },
  {
    year: '2025',
    title: 'ADB Dienstleistungen',
    role: 'Unternehmensauftritt',
    blurb:
      'Der digitale Auftritt für Immobilienhandel und Gebäudeservice in Wuppertal — Maklerleistungen, Winterdienst, Grünschnitt, und die Bühne für die eigenen Plattformen. Kurze Wege zur Kontaktaufnahme: WhatsApp Business, Telefon, Mail.',
    stack: ['Next.js', 'Responsive', 'WhatsApp Business API'],
    href: 'https://www.abdullahu.de/',
    host: 'www.abdullahu.de',
  },
];

export default function Work() {
  return (
    <Section id="werkstatt" eyebrow="// ls -la ~/projekte" title="Werkstatt" index="03 / 05">
      <ol>
        {PROJECTS.map((project, index) => (
          <li key={project.title}>
            <Reveal>
              <div
                className="group relative block border-t border-white/10 pb-14 pt-8 transition-colors duration-500 hover:border-accent/40 sm:pb-16 sm:pt-10"
                style={{ perspective: '900px' }}
              >
                {/* Akzentlinie wächst beim Hovern über die Kante */}
                <span
                  aria-hidden="true"
                  className="absolute -top-px left-0 h-px w-0 bg-accent/70 transition-all duration-700 ease-out group-hover:w-full"
                />

                <div className="flex items-baseline justify-between gap-6 font-mono text-[0.7rem]">
                  <span className="text-white/30">{String(index + 1).padStart(2, '0')}</span>
                  <span className="text-white/30">{project.role}</span>
                  <span className="ml-auto text-accent/60">{project.year}</span>
                </div>

                <h3
                  className="serif mt-5 text-3xl leading-[0.95] text-white/70 transition-colors duration-500 group-hover:text-white sm:text-5xl"
                  style={{ transformStyle: 'preserve-3d' }}
                >
                  <span className="project-title inline-block">{project.title}</span>
                </h3>

                <div className="mt-7 grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
                  <p className="max-w-2xl text-base leading-relaxed text-white/45">
                    {project.blurb}
                  </p>

                  <div className="md:text-right">
                    <p className="font-mono text-[0.7rem] leading-relaxed text-white/30">
                      {project.stack.join(' · ')}
                    </p>

                    {project.downloadHref ? (
                      /* ── Download-Button ── */
                      <a
                        href={project.downloadHref}
                        download
                        className="mt-4 inline-flex items-center gap-2.5 rounded-md border border-accent/30 bg-accent/10 px-5 py-2.5 font-mono text-[0.75rem] text-accent transition-all duration-300 hover:border-accent/60 hover:bg-accent/20 hover:shadow-[0_0_20px_rgba(var(--color-accent-rgb,99,240,190),0.15)]"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="shrink-0"
                        >
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        {project.downloadLabel ?? 'Download'}
                      </a>
                    ) : (
                      /* ── Externer Website-Link ── */
                      <a
                        href={project.href}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-3 inline-flex items-center gap-2 font-mono text-[0.7rem] text-accent/60"
                      >
                        <span className="border-b border-accent/25 pb-0.5">{project.host}</span>
                        <span
                          aria-hidden="true"
                          className="transition-transform duration-500 group-hover:-translate-y-0.5 group-hover:translate-x-1"
                        >
                          ↗
                        </span>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </Reveal>
          </li>
        ))}
      </ol>

      <p className="border-t border-white/10 pt-6 font-mono text-[0.7rem] text-white/30">
        {'// Immobilien +Plus liegt noch auf der Werkbank.'}
      </p>
    </Section>
  );
}
