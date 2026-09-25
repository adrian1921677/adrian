/**
 * Everything Momo says.
 *
 * Facts come from Adrian's CV (the previous site's About / Werdegang /
 * Werkstatt / Kontakt sections). Voice: Momo talks ABOUT Adrian in third
 * person, short punchy lines (≤ ~140 chars), at most one emoji per line.
 * Skill levels are playful "character stats" — adjust them freely.
 */
import type { Line, Topic } from './types';

export const EMAIL = 'adrian@abdullahu.de';
export const LINKEDIN = 'https://www.linkedin.com/in/adrian-abdullahu-136b04238';

/** Played once when the visitor walks in (after the camera swoop). */
export const INTRO: Line[] = [
  { kind: 'say', text: 'Hey, hallo! 👋 Ich bin Momo und wohne hier bei Adrian in Wuppertal.', mood: 'happy' },
  {
    kind: 'say',
    text: 'Adrian ist gerade unterwegs – irgendwo hakt bestimmt wieder ein Glasfaserkabel. Also führ ich dich rum!',
    mood: 'excited',
    gesture: 'jump',
  },
  {
    kind: 'say',
    text: 'Frag mich einfach was. Ich lauf hin und zeig’s dir direkt im Zimmer.',
    mood: 'happy',
  },
];

export const TOPICS: Topic[] = [
  {
    id: 'about',
    question: 'Wer ist Adrian eigentlich?',
    title: 'Über Adrian',
    icon: 'User',
    keywords: [
      'wer ist', 'ueber adrian', 'about', 'vorstellen', 'vorstellung', 'person', 'erzaehl', 'beschreib',
      'kennenlernen', 'alter', 'alt', 'wohnt', 'wuppertal', 'steckbrief', 'who is', 'wer steckt', 'sprache',
    ],
    reaction: 'Ooh, meine Lieblingsfrage! Komm mit, hier schläft der Chef.',
    lines: [
      {
        kind: 'say',
        text: 'Das ist Adrians Zimmer. Er kommt aus Wuppertal, Jahrgang 2002 – und er hat mich gebaut. 🥹',
        mood: 'happy',
        gesture: 'wave',
      },
      {
        kind: 'say',
        text: 'Tagsüber sucht er Störungen im Glasfasernetz der Telekom. Abends baut er Oberflächen fürs Web.',
        mood: 'proud',
      },
      {
        kind: 'say',
        text: 'Er sagt, das ist eigentlich derselbe Job: rausfinden, wo es hakt – und für wen.',
        mood: 'thinking',
        gesture: 'think',
      },
      {
        kind: 'card',
        text: 'Hier sein Steckbrief. Ja, ich hab ihn heimlich abgeschrieben.',
        mood: 'excited',
        card: {
          period: 'Steckbrief',
          title: 'Adrian Abdullahu',
          org: 'IT-Systemelektroniker · Wuppertal, NRW',
          bullets: [
            'Deutsche Telekom, Düsseldorf – Kupfer & Glasfaser',
            'Nebenbei: React · Next.js · TypeScript',
            'Sprachen: Deutsch & Englisch · Führerschein Klasse B',
          ],
        },
      },
    ],
  },
  {
    id: 'journey',
    question: 'Was hat Adrian gemacht?',
    title: 'Werdegang',
    icon: 'Route',
    keywords: [
      'gemacht', 'werdegang', 'lebenslauf', 'cv', 'karriere', 'erfahrung', 'beruf', 'job', 'arbeit',
      'arbeitet', 'stationen', 'praktikum', 'telekom', 'bayer', 'sodexo', 'pina', 'bausch', 'buehne',
      'licht', 'game design', 'experience', 'career',
    ],
    reaction: 'Werdegang? Ab in die Erinnerungs-Ecke – da steht jede Station rum!',
    lines: [
      {
        kind: 'say',
        text: 'Siehst du das Poster? Adrian nennt es seinen Traceroute. Acht Hops, null Packet Loss.',
        mood: 'proud',
        gesture: 'point',
      },
      {
        kind: 'card',
        text: 'Hop 1: Der Scheinwerfer da! Praktikum in der Bühnentechnik bei Pina Bausch.',
        mood: 'excited',
        card: {
          period: 'Jan – Feb 2018',
          title: 'Praktikant Bühnentechnik',
          org: 'Pina Bausch, Wuppertal',
          bullets: [
            'Lichtanlagen, Moving-Lights und Profilscheinwerfer aufgebaut und ausgerichtet',
            'Bühnenproben begleitet',
            'Seine Erkenntnis: Licht ist eine Entscheidung, kein Schalter.',
          ],
        },
      },
      {
        kind: 'card',
        text: 'Das Gamepad? Drei Tage Game Design. Kurz, aber mit langem Nachhall. 🎮',
        mood: 'happy',
        card: {
          period: 'Jan 2019',
          title: 'Praktikant Game Design',
          org: 'Bildungsgesellschaft GmbH, Wuppertal',
          bullets: [
            'Gameplay-Konzepte entwickelt',
            'Level-Layouts und Missionen konzipiert',
            'Game-Design-Dokumente erstellt',
          ],
        },
      },
      {
        kind: 'card',
        text: 'Der Karton? Logistik! Bei Sodexo hatte Adrian zum ersten Mal Verantwortung für ein Team.',
        mood: 'proud',
        gesture: 'jump',
        card: {
          period: 'Mär 2021 – Feb 2022',
          title: 'Stellv. Teamleiter',
          org: 'Sodexo · Transporte innerhalb der Bayer AG',
          bullets: [
            'Strecken geplant und Transporte terminiert',
            'Dinge, die pünktlich ankommen müssen – kamen pünktlich an',
          ],
        },
      },
      {
        kind: 'card',
        text: 'Dann ein Abstecher ins Labor. Kittel an, Prozesse verstehen, alles sauber dokumentieren.',
        mood: 'thinking',
        card: {
          period: 'Sep – Dez 2022',
          title: 'Praktikant',
          org: 'Bayer AG, Wuppertal',
          bullets: [
            'Einblicke in Labor- und Chemikantenprozesse',
            'Team bei technischen Aufgaben unterstützt',
            'Arbeitsschritte zur Prozessoptimierung dokumentiert',
          ],
        },
      },
      {
        kind: 'card',
        text: 'Boss-Level: Der Switch und das Rack! Seit 2023 hält Adrian bei der Telekom das Netz am Laufen.',
        mood: 'excited',
        gesture: 'celebrate',
        card: {
          period: 'seit Sep 2023',
          title: 'System Elektroniker',
          org: 'Deutsche Telekom AG, Düsseldorf',
          bullets: [
            'Installation und Wartung von IT-Systemen',
            'Fehlerdiagnose und Entstörung im Kupfer- und Glasfasernetz',
            'Systemkonfigurationen für bessere Netzleistung optimiert',
            'Anwendersupport und Schulungen',
          ],
        },
      },
      {
        kind: 'say',
        text: 'Bühnenlicht, Level-Design, Logistik, Labor, Glasfaser. Sieht nach Zickzack aus – war aber immer dieselbe Frage.',
        mood: 'thinking',
        gesture: 'think',
      },
    ],
  },
  {
    id: 'work',
    question: 'Was hat Adrian gebaut?',
    title: 'Werkstatt',
    icon: 'Briefcase',
    keywords: [
      'gebaut', 'projekt', 'projekte', 'werkstatt', 'portfolio', 'website', 'app', 'plattform', 'software',
      'mieter', 'adb', 'signal desk', 'signal', 'trading', 'download', 'programmier', 'entwickel', 'code',
      'nebenprojekt', 'referenz', 'work', 'projects',
    ],
    reaction: 'Projekte? Ab zum Schreibtisch – hier passiert’s nach Feierabend!',
    lines: [
      {
        kind: 'say',
        text: 'Hier sitzt Adrian abends mit Kaffee und baut eigene Plattformen. Von der Idee bis zum Deploy.',
        mood: 'happy',
      },
      {
        kind: 'card',
        text: 'Projekt 1: Mieter +Plus. Wohnungsmängel melden ohne Zettelwirtschaft!',
        mood: 'excited',
        card: {
          period: '2026 · Web & App',
          title: 'Mieter +Plus',
          org: 'mieterplus.abdullahu.de',
          bullets: [
            'Foto rein, Status live verfolgen, direkt mit der Verwaltung chatten',
            'Dashboard für Vermieter mit revisionssicherem Audit-Log',
            'Server in Frankfurt, Row-Level-Security, DSGVO von Anfang an',
          ],
        },
      },
      {
        kind: 'card',
        text: 'Projekt 2: Signal Desk – ein Desktop-Tool für Trader. Das hier ist ernsthaft nerdig. 🤓',
        mood: 'proud',
        gesture: 'jump',
        card: {
          period: '2026 · Windows',
          title: 'Signal Desk',
          org: 'Next.js · Electron · Supabase · LLM',
          bullets: [
            'Marktticks werden zu Kerzen, Muster werden automatisch erkannt',
            'Ein LLM prüft jedes Signal gegen die aktuelle Nachrichtenlage',
            'Platziert keine Trades – liefert Entscheidungshilfen',
          ],
        },
      },
      {
        kind: 'card',
        text: 'Projekt 3: der Auftritt von ADB Dienstleistungen. Immobilien, Winterdienst, Grünschnitt.',
        mood: 'happy',
        card: {
          period: '2025 · Website',
          title: 'ADB Dienstleistungen',
          org: 'www.abdullahu.de',
          bullets: [
            'Digitaler Auftritt für Immobilienhandel und Gebäudeservice in Wuppertal',
            'Kurze Wege: WhatsApp Business, Telefon, Mail',
          ],
        },
      },
      {
        kind: 'contact',
        text: 'Willst du reinschauen? Bitte schön:',
        mood: 'excited',
        links: [
          { label: 'Mieter +Plus', href: 'https://mieterplus.abdullahu.de/', icon: 'Globe' },
          { label: 'ADB Dienstleistungen', href: 'https://www.abdullahu.de/', icon: 'Globe' },
          {
            label: 'Signal Desk (Windows)',
            href: 'https://github.com/adrian1921677/adrian/releases/download/v0.1.0/SignalDesk-Setup-0.1.0.exe',
            icon: 'Download',
          },
        ],
      },
      {
        kind: 'card',
        text: 'Projekt 4: dieses Zimmer hier! Und mich. Adrian hat alles in Blender gebaut – per Python-Skript. 🥹',
        mood: 'proud',
        gesture: 'celebrate',
        card: {
          period: '2026 · 3D im Browser',
          title: 'Momos Zimmer',
          org: 'Blender · three.js · React Three Fiber',
          bullets: [
            'Jedes Möbelstück per Code modelliert, 378 Einzelteile zu 32 Meshes zusammengefasst',
            'Ich bestehe aus 23 Teilen – Mund, Augen, Antenne einzeln animiert',
            'Meine Stimme? Kein Audiofile, sondern live mit Web Audio erzeugt',
          ],
        },
      },
      {
        kind: 'gallery',
        text: 'Willst du hinter die Kulissen? Hier ein paar Blicke direkt aus Blender:',
        mood: 'excited',
        images: [
          { src: '/making-of/clay.jpg', caption: 'Clay-Render: nur Form, noch keine Farbe' },
          { src: '/making-of/wire.jpg', caption: 'Wireframe: jede Kante im Zimmer' },
          { src: '/making-of/parts.jpg', caption: 'Ich, in Einzelteilen. Keine Sorge, tut nicht weh.' },
          { src: '/making-of/final.jpg', caption: 'Fertig gerendert: hallo!' },
        ],
      },
      {
        kind: 'say',
        text: 'Psst: Immobilien +Plus liegt schon auf der Werkbank. Du hast es nicht von mir. 🤫',
        mood: 'shy',
      },
    ],
  },
  {
    id: 'skills',
    question: 'Was kann Adrian richtig gut?',
    title: 'Skills',
    icon: 'Sparkles',
    keywords: [
      'kann', 'skill', 'faehigkeit', 'staerke', 'stark', 'richtig gut', 'tool', 'kompetenz', 'talent',
      'koennen', 'drauf', 'superkraft', 'react', 'next', 'typescript', 'netzwerk', 'glasfaser', 'technik',
    ],
    reaction: 'Stats-Check! Ab zur Pinnwand mit den Trophäen.',
    lines: [
      {
        kind: 'say',
        text: 'Willkommen in Adrians Trophäen-Ecke. Hier hängt alles, was er richtig draufhat.',
        mood: 'happy',
      },
      {
        kind: 'skills',
        text: 'Charakter-Werte, Klasse: Netz-Magier. Ja, ich hab nachgemessen.',
        mood: 'proud',
        skills: [
          { name: 'Fehlerdiagnose & Entstörung', level: 90 },
          { name: 'Kupfer- & Glasfasernetz', level: 88 },
          { name: 'Systeminstallation & -wartung', level: 86 },
          { name: 'Hard- & Softwarekonfiguration', level: 84 },
        ],
      },
      {
        kind: 'skills',
        text: 'Und die Feierabend-Skills. Das letzte Item ist leider maximal gelevelt.',
        mood: 'excited',
        gesture: 'jump',
        skills: [
          { name: 'React & Next.js', level: 82 },
          { name: 'TypeScript', level: 80 },
          { name: 'Benutzersupport & Schulung', level: 85 },
          { name: 'Kaffee-Durchsatz', level: 99 },
        ],
      },
      {
        kind: 'say',
        text: 'Seine Combo-Attacke: Er denkt in Leitungen und baut in Komponenten. Und er kann echtes Handwerk!',
        mood: 'proud',
        gesture: 'celebrate',
      },
    ],
  },
  {
    id: 'education',
    question: 'Wo hat Adrian das gelernt?',
    title: 'Schule & Lernen',
    icon: 'GraduationCap',
    keywords: [
      'gelernt', 'lernen', 'ausbildung', 'schule', 'abschluss', 'bildung', 'studium', 'kurs',
      'berufskolleg', 'gesamtschule', 'realschul', 'hauptschul', 'education', 'wo hat',
    ],
    reaction: 'Ab ins Bücherregal – Adrians Wissensspeicher!',
    lines: [
      {
        kind: 'say',
        text: 'Dieses Regal ist quasi Adrians Gehirn. Nur ordentlicher. Meistens.',
        mood: 'happy',
      },
      {
        kind: 'card',
        text: 'Das Tutorial-Level: Hier fing alles an – inklusive der Frage, wie ein Computer innen aussieht.',
        mood: 'happy',
        card: {
          period: '2013 – 2019',
          title: 'Gesamtschule Barmen',
          org: 'Wuppertal · Hauptschulabschluss',
        },
      },
      {
        kind: 'card',
        text: 'Und dann? Nachgelegt! Weil der Plan größer war als der erste Abschluss.',
        mood: 'proud',
        gesture: 'jump',
        card: {
          period: '2019 – 2020',
          title: 'Berufskolleg am Haspel',
          org: 'Wuppertal · Realschulabschluss',
        },
      },
      {
        kind: 'say',
        text: 'React, Next.js und TypeScript hat er sich selbst beigebracht. Abends, mit sehr vielen Browser-Tabs. 📚',
        mood: 'thinking',
        gesture: 'think',
      },
      {
        kind: 'say',
        text: 'Sein Geheimnis? Jedes Projekt ist ein neues Tutorial. Er hört einfach nie auf.',
        mood: 'proud',
      },
    ],
  },
  {
    id: 'hobbies',
    question: 'Was macht Adrian in seiner Freizeit?',
    title: 'Freizeit',
    icon: 'Gamepad2',
    keywords: [
      'freizeit', 'hobby', 'hobbies', 'hobbys', 'zocken', 'zockt', 'gaming', 'konsole', 'fussball',
      'volleyball', 'sport', 'drohne', 'wochenende', 'feierabend', 'interessen', 'free time',
    ],
    reaction: 'Freizeit? Ab zum Sitzsack – das ist quasi Adrians zweites Büro!',
    lines: [
      {
        kind: 'say',
        text: 'Controller, Handheld, Sitzsack. Wenn Adrian nicht arbeitet, wird hier gezockt. Und zwar viel. 🎮',
        mood: 'excited',
      },
      {
        kind: 'say',
        text: 'Der Fußball da? Wird wirklich benutzt! Adrian spielt oft und gern – ich bin leider zu rund zum Mitspielen.',
        mood: 'happy',
        gesture: 'jump',
      },
      {
        kind: 'say',
        text: 'Und Volleyball! Baggern, pritschen, schmettern. Ich übe noch mit den Ohren.',
        mood: 'shy',
      },
      {
        kind: 'say',
        text: 'Die Drohne? Technik ist für Adrian nicht nur Job. Er muss alles aufschrauben und verstehen.',
        mood: 'thinking',
        gesture: 'think',
      },
      {
        kind: 'games',
        text: 'Apropos zocken: Ich hab ein paar Minispiele versteckt. Traust du dich?',
        mood: 'excited',
        gesture: 'celebrate',
      },
    ],
  },
  {
    id: 'contact',
    question: 'Wie erreiche ich Adrian?',
    title: 'Kontakt',
    icon: 'Mail',
    keywords: [
      'kontakt', 'erreich', 'mail', 'schreiben', 'anrufen', 'telefon', 'linkedin', 'nachricht',
      'contact', 'anfrage', 'zusammenarbeit', 'zusammenarbeiten', 'hire', 'einstellen', 'melden', 'hallo sagen',
    ],
    reaction: 'Post für Adrian? Ab zum Telefon!',
    lines: [
      {
        kind: 'say',
        text: 'Das ist die Adrian-Hotline. Okay, ein Retro-Telefon. Aber die Nachrichten kommen an!',
        mood: 'happy',
      },
      {
        kind: 'contact',
        text: 'Projekt, Frage oder schlechter Wortwitz über Semikolons – alles willkommen:',
        mood: 'excited',
        links: [
          { label: EMAIL, href: `mailto:${EMAIL}`, icon: 'Mail' },
          { label: 'LinkedIn', href: LINKEDIN, icon: 'Linkedin' },
        ],
      },
      {
        kind: 'say',
        text: 'Er antwortet meistens schneller als ein npm install. Außer es ist Freitagnachmittag.',
        mood: 'happy',
        gesture: 'wave',
      },
      {
        kind: 'say',
        text: 'Psst: Ich sag ihm, dass du da warst. Versprochen! 💌',
        mood: 'shy',
      },
    ],
  },
];

/** Said after a topic's last line, before the question chips come back. */
export const FOLLOW_UPS: string[] = [
  'Und? Was willst du als Nächstes wissen?',
  'Noch mehr? Ich hab Zeit. Viel Zeit. Ich wohne ja hier.',
  'Frag ruhig weiter – ich werd nicht müde!',
  'Nächster Hop? Du entscheidest!',
  'Gibt’s noch was, das dich interessiert?',
];

/** Replaces the follow-up once every topic has been visited. */
export const ALL_DONE: Line[] = [
  {
    kind: 'say',
    text: 'Wow, du hast ALLES gesehen! Jetzt kennst du Adrian fast so gut wie ich. 🎉',
    mood: 'excited',
    gesture: 'celebrate',
  },
  {
    kind: 'say',
    text: 'Schreib ihm doch einfach mal! Oder frag mich nochmal was – ich bin ja eh hier.',
    mood: 'happy',
  },
];

/** Shown briefly when the visitor clicks Momo. */
export const POKE_LINES: string[] = [
  'Hihi, das kitzelt!',
  'Boing! 😆',
  'Hey, ich bin doch kein Button! …okay, ein bisschen schon.',
  'Nochmal? Na gut, einmal noch!',
  'Ich bin weicher, als ich aussehe, oder?',
  'Pieks zurück!',
];

/** Fifth poke. */
export const POKE_SPECIAL = 'Fünfmal gepiekst! Hiermit bist du offiziell Momo-Kitzel-Profi. 🏆';

/** Said once if the visitor idles in front of the question chips. */
export const IDLE_HINTS: string[] = [
  'Psst… du kannst übrigens auch direkt auf Sachen im Zimmer klicken!',
  'Tipp: Klick mal auf den Schreibtisch oder den Scheinwerfer. Oder auf mich!',
];

// ---- Small talk (free-text input) ----

export const GREETING_REPLIES: string[] = [
  'Hallo zurück! 👋 Schön, dass du da bist!',
  'Hey hey! Was möchtest du über Adrian wissen?',
  'Moin! Frag mich ruhig alles.',
];

export const NAME_REPLY: Line = {
  kind: 'say',
  text: 'Ich bin Momo! Adrians Mitbewohner, Zimmer-Guide und das offiziell süßeste Mesh im Raum.',
  mood: 'proud',
};

export const THANKS_REPLY: Line = { kind: 'say', text: 'Gern geschehen! 💜', mood: 'happy' };

export const JOKES: { setup: string; punchline: string }[] = [
  {
    setup: 'Was macht Adrian, wenn das Glasfaserkabel reißt?',
    punchline: 'Er bleibt auf der Leitung – bis es wieder leuchtet. 💡',
  },
  {
    setup: 'Warum deployt Adrian nie freitags?',
    punchline: 'Weil „deploy --friday“ bei ihm nur eine Antwort kennt: Abgebrochen. Gern geschehen.',
  },
  {
    setup: 'Wie kommt man aus vim raus?',
    punchline: 'Gar nicht. Deshalb wohne ich ja hier. 🙈',
  },
  {
    setup: 'Was sagt ein Paket zum Router?',
    punchline: '„Ohne dich wär ich total verloren.“ 🥹',
  },
];

export const UNKNOWN_REPLY: Line = {
  kind: 'say',
  text: 'Hmm, da bin ich überfragt… frag mich lieber eins davon:',
  mood: 'thinking',
};

/** When the visitor leaves a topic early via "Andere Frage". */
export const SWITCH_LINES: string[] = [
  'Klar! Worüber willst du stattdessen quatschen?',
  'Kein Problem – was interessiert dich mehr?',
];
