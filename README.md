# adrian — kleine kreative Ecke

Persönliches Portfolio von Adrian Abdullahu. React + Vite + TypeScript + Tailwind CSS v4.

```bash
npm install
npm run dev
```

## Was hier drinsteckt

- **Zerfallender Schriftzug** — der Name im Hero zersetzt sich über ~42 Sekunden in
  Einzelbuchstaben. Fährt der Zeiger darüber, ziehen sich die Buchstaben an
  Wurzeln wieder zusammen. Licht fällt von oben ein, mit dem Zerfall sinkt die
  Deckkraft. Siehe `src/components/DecayingName.tsx`.
- **Spotlight-Reveal** — ein Radialverlauf wird pro Frame auf ein Canvas gezeichnet,
  als Data-URL exportiert und als CSS-Maske über den Showreel gelegt. Das Canvas
  läuft bewusst weit unter Viewport-Auflösung, damit `toDataURL()` billig bleibt.
- **Waldrauschen** — 90-Sekunden-Schleife, aus einer langen Aufnahme verlustfrei auf
  MPEG-Frame-Grenzen geschnitten. Zwei Durchläufe überlappen sich um vier Sekunden,
  dadurch ist die Schnittkante nicht hörbar (`src/audio/engine.ts`).
- **Gedämpftes Scrollen** — das Dokument scrollt normal, der Inhalt hängt verzögert
  hinterher und schert sich leicht mit der Geschwindigkeit.
- **Ranke als Navigation** — links am Rand, füllt sich mit dem Scrollfortschritt,
  der aktive Abschnitt treibt Blätter.
- **3D ohne Bibliothek** — Neigung zum Zeiger, ein drehbarer Würfel aus sechs `div`s
  und reiner CSS-Perspektive.

## Gestaltungssystem

Zwei Farben neben Weiß, definiert in `src/index.css`:

| Token | Wert | Wofür |
| --- | --- | --- |
| `accent` | `#e8d5a6` | der einzige UI-Akzent: Zahlen, Links, Hervorhebungen |
| `organic` | `#a8c08d` | alles Gewachsene: Ranke, Wurzeln, Leitung, Würfelkanten |

Weiß gibt es in vier Stufen — `white`, `white/70`, `white/45`, `white/30` — Linien
liegen bei `white/10`. Monospace hat genau eine Größe (`0.7rem`).

## Barrierefreiheit

Bei `prefers-reduced-motion: reduce` sind gedämpftes Scrollen, 3D-Neigung,
Signalimpuls und die Einblendungen abgeschaltet. Die Seite bleibt vollständig
bedienbar.

## Schriften

`Inter` und `Instrument Serif` kommen von Google Fonts. `Helvetica Neue Roman` ist
lizenzpflichtig und deshalb nicht enthalten — siehe `public/fonts/README.md`. Ohne
die Dateien greift automatisch der Fallback-Stack.
