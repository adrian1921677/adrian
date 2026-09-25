# adrian — Momos Zimmer

Adrians Portfolio als kleines 3D-Zimmer. Momo wohnt darin, murmelt in
Sprechblasen und läuft zu den Möbeln, während er Adrians Werdegang erzählt.

React 18 · TypeScript · Vite · Tailwind · three.js / React Three Fiber · Framer Motion.
Das Zimmer und Momo sind in Blender gebaut.

```bash
npm install
npm run dev
```

## Wo was steckt

| Was | Wo |
| --- | --- |
| Alles, was Momo sagt (Lebenslauf, Projekte, Skills, Kontakt, Witze) | `src/data/content.ts` |
| Namen der Objekte im 3D-Modell, die der Code braucht | `src/data/nodes.ts` |
| Ablauf des Gesprächs (Intro, Themen, Laufen, Pieksen) | `src/dialogue/director.ts` |
| Momos Murmel-Stimme (Web Audio, keine Dateien) | `src/audio/babble.ts` |
| 3D: Laufen, Blinzeln, Mund, Kamera, Licht | `src/scene/` |
| Sprechblase, Fragen, Eingabefeld, Lebenslauf als Text, Neon-Schriftzug | `src/ui/` |
| Spielekiste: Keepy-Uppy, Entstörung!, Zimmer-Memory (Rekorde im localStorage) | `src/games/` |
| Making-of-Bilder (Clay, Wireframe, Momo in Einzelteilen) | `public/making-of/`, erzeugt mit `blender/making_of.py` |

Neues Thema? In `content.ts` eintragen. Braucht es eigene Möbel, kommt es in
`TOPIC_IDS` / `TOPIC_NODES` in `nodes.ts` und bekommt im Blender-File ein
`Hotspot_…`-Empty plus einen `Spot_…`-Punkt am Boden.

## Das Zimmer bearbeiten

`blender/momo_room_source.blend` ist die bearbeitbare Quelle. Alle Möbel sind
dort noch einzelne Objekte. Nach Änderungen exportieren:

```bash
blender -b blender/momo_room_source.blend -P blender/export_room.py
```

Das Skript fasst die Möbel pro Hotspot zusammen (weniger Draw-Calls), exportiert
nach `public/models/room.glb` und bricht ab, falls ein Objekt fehlt, das die
Website braucht. `Char_*`-Teile, `Desk_Screen` und alle Empties bleiben
einzeln, weil der Code sie per Name animiert. Momos Teile haben keine
Rotation und keine Skalierung. Die Form steckt im Mesh, damit der Code
direkt skalieren und drehen kann.

## Barrierefreiheit

- Oben rechts gibt es den ganzen Lebenslauf als normalen Text (für eilige Recruiter und Screenreader).
- Jede Zeile von Momo landet zusätzlich in einer `aria-live`-Region.
- Bedienung per Tastatur: Leertaste/Enter = weiter, 1–6 = Frage wählen, Esc = schließen.
- Bei `prefers-reduced-motion` schweben die Blasen nicht und der Text tippt schneller.
