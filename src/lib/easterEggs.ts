import { EMAIL } from '../constants';

const KONAMI = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
];

function toast(text: string) {
  const existing = document.getElementById('egg-toast');
  existing?.remove();

  const el = document.createElement('div');
  el.id = 'egg-toast';
  el.textContent = text;
  el.className = 'egg-toast';
  document.body.appendChild(el);

  window.setTimeout(() => el.classList.add('egg-toast--out'), 2600);
  window.setTimeout(() => el.remove(), 3200);
}

/** Gruß an alle, die die Konsole aufmachen. */
function greetDevelopers() {
  const heading = 'color:#e8d5a6;font:600 15px/1.5 monospace';
  const body = 'color:#8b8b8b;font:12px/1.6 monospace';

  console.log('%c  adrian — kleine kreative ecke  ', heading);
  console.log(
    `%cDu hast die Konsole aufgemacht. Respekt, das machen die wenigsten.

  Gebaut mit React, Vite, TypeScript und Tailwind.
  Der Wald ist eine 90-Sekunden-Schleife, verlustfrei geschnitten und
  überblendet — deshalb hörst du den Übergang nicht.
  Der Name oben zerfällt von allein. Fahr drüber, dann wächst er zurück.

  Wenn du bis hier gelesen hast, schreib mir ruhig: ${EMAIL}

  PS: ↑ ↑ ↓ ↓ ← → ← → B A`,
    body,
  );
}

/** Konami-Code blendet die Kistenränder ein — der Klassiker. */
function watchKonami() {
  let index = 0;

  const onKeyDown = (event: KeyboardEvent) => {
    const expected = KONAMI[index];
    const pressed = event.key.length === 1 ? event.key.toLowerCase() : event.key;

    if (pressed !== expected) {
      // Fehlversuch: nur zurücksetzen, aber einen Neustart zulassen.
      index = pressed === KONAMI[0] ? 1 : 0;
      return;
    }

    index += 1;
    if (index < KONAMI.length) return;

    index = 0;
    const on = document.documentElement.classList.toggle('konami');
    toast(on ? '🎮 Debug-Modus: alle Kisten sichtbar' : '🙈 Kisten wieder versteckt');
  };

  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}

export function initEasterEggs() {
  greetDevelopers();
  return watchKonami();
}
