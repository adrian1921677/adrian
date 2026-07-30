import Section from '../Section';
import Reveal from '../Reveal';

type Kind = 'schule' | 'praktikum' | 'job' | 'eigen';

type Station = {
  span: string;
  role: string;
  place: string;
  kind: Kind;
  note: string;
  bullets: string[];
};

const KIND_LABEL: Record<Kind, string> = {
  schule: 'schule',
  praktikum: 'praktikum',
  job: 'anstellung',
  eigen: 'eigenes',
};

/**
 * Eine Farbe, vier Intensitäten statt vier Farbtönen — dadurch wird die
 * Leiste zur Steigerung: je näher an heute, desto heller der Knoten.
 */
const KIND_LIGHT: Record<Kind, number> = {
  schule: 0.28,
  praktikum: 0.5,
  job: 0.75,
  eigen: 1,
};

const STATIONS: Station[] = [
  {
    span: '2013 — 2019',
    role: 'Gesamtschule Barmen',
    place: 'Wuppertal',
    kind: 'schule',
    note: 'Hauptschulabschluss',
    bullets: ['Wo alles anfing. Inklusive der ersten Frage, wie ein Computer innen aussieht.'],
  },
  {
    span: 'Jan — Feb 2018',
    role: 'Praktikant Bühnentechnik',
    place: 'Pina Bausch, Wuppertal',
    kind: 'praktikum',
    note: 'Licht',
    bullets: [
      'Aufbau, Verkabelung und Ausrichtung von Lichtanlagen, Moving-Lights und Profilscheinwerfern',
      'Begleitung von Bühnenproben',
      'Hier habe ich gelernt: Licht ist eine Entscheidung, kein Schalter.',
    ],
  },
  {
    span: 'Jan 2019',
    role: 'Praktikant Game Design',
    place: 'Bildungsgesellschaft GmbH, Wuppertal',
    kind: 'praktikum',
    note: 'Drei Tage, langer Nachhall',
    bullets: [
      'Entwicklung und Ausarbeitung von Gameplay-Konzepten',
      'Konzeption von Level-Layouts und Missionen',
      'Erstellung und Pflege von Game-Design-Dokumenten',
    ],
  },
  {
    span: '2019 — 2020',
    role: 'Berufskolleg am Haspel',
    place: 'Wuppertal',
    kind: 'schule',
    note: 'Realschulabschluss',
    bullets: ['Nachgelegt, weil der Plan größer war als der erste Abschluss.'],
  },
  {
    span: 'Mrz 2021 — Feb 2022',
    role: 'Stellv. Teamleiter',
    place: 'Sodexo',
    kind: 'job',
    note: 'Logistik',
    bullets: [
      'Planung der Strecken und Terminierung der Transporte',
      'Transporte innerhalb der Bayer AG',
      'Erste Verantwortung für ein Team — und für Dinge, die pünktlich ankommen müssen.',
    ],
  },
  {
    span: 'Sep — Dez 2022',
    role: 'Praktikant',
    place: 'Bayer AG, Wuppertal',
    kind: 'praktikum',
    note: 'Labor',
    bullets: [
      'Einblicke in Labor- und Chemikantenprozesse',
      'Unterstützung des Teams bei technischen Aufgaben',
      'Dokumentation von Arbeitsschritten zur Prozessoptimierung',
    ],
  },
  {
    span: 'seit Sep 2023',
    role: 'System Elektroniker',
    place: 'Deutsche Telekom AG, Düsseldorf',
    kind: 'job',
    note: 'Kupfer & Glas',
    bullets: [
      'Installation und Wartung von IT-Systemen für stabile Betriebsabläufe',
      'Fehlerdiagnose und Entstörung im Kupfer- und Glasfasernetz',
      'Optimierung von Systemkonfigurationen für bessere Netzleistung',
      'Anwendersupport und Schulungen',
    ],
  },
  {
    span: 'nebenher',
    role: 'Eigene Plattformen',
    place: 'Mieter +Plus · ADB Dienstleistungen',
    kind: 'eigen',
    note: 'Feierabendprojekt mit echten Nutzern',
    bullets: [
      'Von der Idee bis zum Deploy: Konzept, Oberfläche, Datenmodell, Betrieb',
      'Ein Netz bauen und Software bauen stellt dieselbe Frage: Wo hakt es, und für wen?',
    ],
  },
];

export default function Journey() {
  return (
    <Section id="werdegang" eyebrow="// traceroute adrian" title="Werdegang" index="02 / 05">
      <p className="-mt-6 mb-16 max-w-xl text-base leading-relaxed text-white/45">
        Bühnenlicht, Level-Design, Transportplanung, Labor, Glasfaser. Sieht nach Zickzack aus, war
        aber immer dieselbe Frage.
      </p>

      <div className="relative">
        {/* Die Leitung. Sitzt exakt auf der Spaltenkante des Rasters. */}
        <div
          aria-hidden="true"
          className="absolute bottom-6 left-12 top-2 w-px bg-gradient-to-b from-organic/40 via-organic/20 to-transparent"
        >
          <span className="signal-pulse" />
        </div>

        <ol>
          {STATIONS.map((station, index) => (
            <li
              key={station.role + station.span}
              className="group relative grid grid-cols-[3rem_1fr] gap-x-8 pb-14 last:pb-0"
            >
              {/* Hop-Nummer, rechtsbündig zur Leitung */}
              <div className="pt-px text-right font-mono text-[0.7rem] leading-5 text-white/30 transition-colors duration-300 group-hover:text-accent">
                {String(index + 1).padStart(2, '0')}
              </div>

              {/* Knoten auf der Leitung */}
              <span
                aria-hidden="true"
                className="absolute left-12 top-1.5 h-2 w-2 -translate-x-1/2 rotate-45 bg-accent transition-transform duration-300 group-hover:scale-150"
                style={{ opacity: KIND_LIGHT[station.kind] }}
              />

              <Reveal delay={index * 40}>
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-[0.7rem]">
                  <span className="text-accent/60">{station.span}</span>
                  <span className="text-white/45">{KIND_LABEL[station.kind]}</span>
                  <span className="text-white/30">{station.note}</span>
                </div>

                <h3 className="serif mt-2 text-xl leading-tight text-white/70 transition-colors duration-300 group-hover:text-white sm:text-2xl">
                  {station.role}
                </h3>
                <p className="mt-0.5 text-sm text-white/45">{station.place}</p>

                <ul className="mt-4 max-w-xl space-y-1.5">
                  {station.bullets.map((bullet) => (
                    <li
                      key={bullet}
                      className="pl-4 text-sm leading-relaxed text-white/45 before:-ml-4 before:inline-block before:w-4 before:text-white/30 before:content-['↳']"
                    >
                      {bullet}
                    </li>
                  ))}
                </ul>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>

      <p className="mt-12 pl-20 font-mono text-[0.7rem] text-white/30">
        {'// 8 hops, 0 packet loss'}
      </p>
    </Section>
  );
}
