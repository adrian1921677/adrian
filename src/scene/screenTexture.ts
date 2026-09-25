import { CanvasTexture, SRGBColorSpace } from 'three';

const W = 512;
const H = 320;
const FPS = 8;
const BG = '#15102a';
const BAR = '#1d1638';
const DIM = '#8f84c9';
const LINE_NO = '#4d4380';
const PASTELS = ['#ff9ecf', '#c3a6ff', '#8fd3ff', '#9ff0c4', '#ffd59e', '#ffb3a7'];
const FONT = 'Kanit, sans-serif';

const TITLE_Y = 96;
const TITLE_MAX_W = 456;
const CODE_TOP = 176;
const CODE_STEP = 22;
const CODE_ROWS = 5;
const CODE_X = 48;
const TYPE_SPEED = 110; // px per second
const LINE_PAUSE = 0.22; // s after each line

interface CodeLine {
  indent: number;
  tokens: { w: number; color: string }[];
  width: number;
  /** Typing starts at this time within the cycle. */
  start: number;
}

function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fixed pseudo-random "program" of token bars. */
function makeProgram(): { lines: CodeLine[]; cycle: number } {
  const rand = mulberry32(7);
  const lines: CodeLine[] = [];
  let indent = 0;
  let time = 0;
  for (let i = 0; i < 26; i++) {
    const empty = i > 0 && rand() < 0.12;
    const tokens: CodeLine['tokens'] = [];
    let width = 0;
    if (!empty) {
      const count = 1 + Math.floor(rand() * 4);
      for (let k = 0; k < count; k++) {
        const w = 14 + Math.floor(rand() * 58);
        if (CODE_X + indent * 16 + width + w > W - 40) break;
        tokens.push({ w, color: PASTELS[Math.floor(rand() * PASTELS.length)] });
        width += w + 7;
      }
    }
    lines.push({ indent, tokens, width, start: time });
    time += width / TYPE_SPEED + LINE_PAUSE;
    const r = rand();
    if (r < 0.3 && indent < 3) indent++;
    else if (r > 0.72 && indent > 0) indent--;
  }
  return { lines, cycle: time + 1.2 };
}

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const r = Math.min(h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

/** The desk monitor: a tiny animated editor with the current screen title. */
export class ScreenTexture {
  readonly texture: CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly program = makeProgram();
  private readonly titleFill: CanvasGradient | string;
  private fontReady = false;
  private disposed = false;
  private lastDraw = -Infinity;
  private title: string | null = null;
  private titleLines: string[] = [];
  private titleSize = 64;

  constructor(anisotropy = 1) {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext('2d');
    this.texture = new CanvasTexture(canvas);
    this.texture.flipY = false;
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = Math.min(anisotropy, 8);

    const grad = this.ctx?.createLinearGradient(0, TITLE_Y - 40, 0, TITLE_Y + 40);
    if (grad) {
      grad.addColorStop(0, '#ffe1f1');
      grad.addColorStop(1, '#c9b8ff');
    }
    this.titleFill = grad ?? '#ffffff';

    // Kanit must be loaded before the first text draw (canvas won't trigger the download).
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (fonts) {
      Promise.all([fonts.load(`800 64px ${FONT}`), fonts.load(`400 13px ${FONT}`)])
        .then(() => fonts.ready)
        .catch(() => undefined)
        .then(() => {
          this.fontReady = true;
          this.title = null; // re-measure with the real font
          this.lastDraw = -Infinity;
        });
    } else {
      this.fontReady = true;
    }
  }

  /** Call every frame; redraws at most FPS times per second. */
  update(time: number, title: string): void {
    if (this.disposed || !this.ctx || time - this.lastDraw < 1 / FPS) return;
    this.lastDraw = time;
    this.draw(this.ctx, time, title);
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.disposed = true;
    this.texture.dispose();
  }

  private layoutTitle(ctx: CanvasRenderingContext2D, title: string): void {
    this.title = title;
    const text = title.trim();
    let size = 72;
    for (; size >= 34; size -= 4) {
      ctx.font = `800 ${size}px ${FONT}`;
      if (ctx.measureText(text).width <= TITLE_MAX_W) {
        this.titleLines = [text];
        this.titleSize = size;
        return;
      }
    }
    // Too long for one line: wrap into two at a word boundary.
    const words = text.split(/\s+/);
    let best = [text];
    let bestW = Infinity;
    ctx.font = `800 40px ${FONT}`;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' ');
      const b = words.slice(i).join(' ');
      const w = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
      if (w < bestW) {
        bestW = w;
        best = [a, b];
      }
    }
    this.titleLines = best;
    this.titleSize = Math.max(22, Math.min(40, Math.floor((40 * TITLE_MAX_W) / Math.max(bestW, 1))));
  }

  private draw(ctx: CanvasRenderingContext2D, time: number, title: string): void {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    // Window chrome.
    ctx.fillStyle = BAR;
    ctx.fillRect(0, 0, W, 28);
    ctx.fillRect(0, H - 22, W, 22);
    const dots = ['#ff7a90', '#ffd36b', '#7ee0a1'];
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = dots[i];
      ctx.beginPath();
      ctx.arc(18 + i * 16, 14, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#7ee0a1';
    ctx.beginPath();
    ctx.arc(18, H - 11, 4, 0, Math.PI * 2);
    ctx.fill();

    if (this.fontReady) {
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.font = `400 13px ${FONT}`;
      ctx.fillStyle = DIM;
      ctx.fillText('momo.tsx', 72, 15);
      ctx.fillText('Momo ist online', 30, H - 10);

      if (title !== this.title) this.layoutTitle(ctx, title);
      ctx.font = `800 ${this.titleSize}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = this.titleFill;
      ctx.shadowColor = 'rgba(201, 184, 255, 0.55)';
      ctx.shadowBlur = 18;
      const lh = this.titleSize * 1.05;
      const y0 = TITLE_Y - ((this.titleLines.length - 1) * lh) / 2;
      for (let i = 0; i < this.titleLines.length; i++) ctx.fillText(this.titleLines[i], W / 2, y0 + i * lh);
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
    }

    ctx.fillStyle = '#2a2150';
    ctx.fillRect(20, 156, W - 40, 1);

    this.drawCode(ctx, time);
  }

  private drawCode(ctx: CanvasRenderingContext2D, time: number): void {
    const { lines, cycle } = this.program;
    const t = time % cycle;
    let cur = 0;
    while (cur < lines.length - 1 && lines[cur + 1].start <= t) cur++;
    const typed = Math.min(lines[cur].width, (t - lines[cur].start) * TYPE_SPEED);
    const first = Math.max(0, cur - (CODE_ROWS - 1));

    ctx.textAlign = 'right';
    ctx.font = `400 12px ${FONT}`;
    let cursorX = CODE_X;
    let cursorY = CODE_TOP;
    for (let i = first; i <= cur; i++) {
      const line = lines[i];
      const y = CODE_TOP + (i - first) * CODE_STEP;
      if (this.fontReady) {
        ctx.fillStyle = LINE_NO;
        ctx.fillText(String(i + 1), 34, y + 1);
      }
      const limit = i === cur ? typed : line.width;
      let x = CODE_X + line.indent * 16;
      let used = 0;
      for (const tok of line.tokens) {
        if (used >= limit) break;
        const w = Math.min(tok.w, limit - used);
        ctx.fillStyle = tok.color;
        if (w > 1) pill(ctx, x, y - 4.5, w, 9);
        x += tok.w + 7;
        used += tok.w + 7;
      }
      if (i === cur) {
        cursorX = CODE_X + line.indent * 16 + Math.min(typed, line.width) + 2;
        cursorY = y;
      }
    }
    if (time % 1 < 0.55) {
      ctx.fillStyle = '#f4efff';
      ctx.fillRect(cursorX, cursorY - 7.5, 2.5, 15);
    }
  }
}
