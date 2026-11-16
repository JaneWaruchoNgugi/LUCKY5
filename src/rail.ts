import { decoy, mulberry32 } from './fair';
import { fmtM, letterOf, tier, type Tier } from './format';
import type { Sound } from './sound';
import type { Ball, HistoryEntry, LastBall, Letter } from './types';

/** Colours of the five groups. */
export const GROUP_COLOR: Record<Letter, string> = { B: '#2f7dff', I: '#ff4d5e', N: '#8a9896', G: '#22c070', O: '#ffa928' };
const TIER_COLOR: Record<Tier, string> = { t1: '#6f8f8a', t2: '#a9c4bd', t3: '#ffcf3d', t4: '#ff9f2e', t5: '#ff4fd2' };
export const C = {
  rail: '#071a1b',
  muted: '#8fb3ab',
  brass: '#ffcf3d',
  win: '#3ddc84',
  miss: '#ff6b5e',
  line: '#1e4a49',
} as const;

const N_BALLS = 64;
/** Index of the ball under the marker when a slide starts. */
export const START = 6;
/** Index of the ball the slide lands on. */
export const LAND = 56;

const mix = (hex: string, to: string, amt: number): string => {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - amt) + ((b >> s) & 255) * amt);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
};
const alpha = (hex: string, a: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const ease = (t: number): number => 1 - Math.pow(1 - t, 4.2);

interface Geometry {
  bw: number;
  gap: number;
  r: number;
  /** Height of the "Previous" band. */
  hist: number;
  railH: number;
}

/** Canvas renderer for the ball rail and the row of previous results. */
export class Rail {
  private readonly ctx: CanvasRenderingContext2D;
  private balls: Ball[] = [];
  private x = 0;
  private hit = -1;
  private hitColor: string = C.brass;
  private marker: string = C.brass;
  private W = 0;
  private H = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly history: () => readonly HistoryEntry[],
    private readonly sound: Sound,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
  }

  geo(): Geometry {
    const small = this.W < 560;
    return { bw: small ? 70 : 92, gap: small ? 10 : 14, r: small ? 31 : 40, hist: small ? 42 : 46, railH: small ? 132 : 158 };
  }

  private resize(): void {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    this.W = this.canvas.clientWidth;
    const g = this.geo();
    this.H = g.hist + g.railH;
    this.canvas.style.height = `${this.H}px`;
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Lay the rail out at rest, centred on the last result (or a fixed strip on first load). */
  idle(last: LastBall | null): void {
    this.resize();
    if (!this.balls.length) {
      this.build(last ? last.seed : 12345, last, null);
      this.x = this.offsetFor(START);
      this.hit = last ? START : -1;
    } else {
      this.x = this.offsetFor(this.hit >= 0 ? this.hit : START);
    }
    this.draw();
  }

  /** Fill the rail with decoys, keeping the previous result at START and the new one at LAND. */
  build(seed: number, center: Ball | null, land: Ball | null): void {
    const r = mulberry32(seed);
    this.balls = Array.from({ length: N_BALLS }, () => decoy(r));
    if (center) this.balls[START] = { ball: center.ball, mult: center.mult };
    if (land) this.balls[LAND] = land;
    this.hit = -1;
  }

  offsetFor(i: number, jitter = 0): number {
    const g = this.geo();
    return this.W / 2 - (i * (g.bw + g.gap) + g.bw / 2) - jitter * g.bw;
  }

  setMarker(color: string): void {
    this.marker = color;
  }

  /** Highlight the landed ball with a ring in the given colour. */
  markHit(index: number, color: string): void {
    this.hit = index;
    this.hitColor = color;
    this.marker = color;
    this.draw();
  }

  /** Animate the strip; ticks once per ball passing the marker. */
  slide(from: number, to: number, durationMs: number): Promise<void> {
    return new Promise((done) => {
      const t0 = performance.now();
      const pitch = this.geo().bw + this.geo().gap;
      let lastIdx = Math.floor((this.W / 2 - from) / pitch);
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / durationMs);
        this.x = from + (to - from) * ease(t);
        this.draw();
        const idx = Math.floor((this.W / 2 - this.x) / pitch);
        if (idx !== lastIdx) {
          lastIdx = idx;
          this.sound.play('tick');
        }
        if (t < 1) requestAnimationFrame(step);
        else done();
      };
      this.x = from;
      requestAnimationFrame(step);
    });
  }

  draw(): void {
    if (!this.W) return;
    const { ctx } = this;
    const g = this.geo();
    const pitch = g.bw + g.gap;
    ctx.clearRect(0, 0, this.W, this.H);
    this.drawHistory(g);

    const top = g.hist;
    const cy = top + g.r + 20;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, this.W, g.railH);
    ctx.clip();
    this.balls.forEach((b, i) => {
      const cx = this.x + i * pitch + g.bw / 2;
      if (cx < -g.bw || cx > this.W + g.bw) return;
      this.drawBall(b, cx, cy, g.r, i === this.hit);
    });

    // Fade the strip out at both edges.
    const fw = Math.min(140, this.W * 0.14);
    let fg = ctx.createLinearGradient(0, 0, fw, 0);
    fg.addColorStop(0, C.rail);
    fg.addColorStop(1, alpha(C.rail, 0));
    ctx.fillStyle = fg;
    ctx.fillRect(0, top, fw, g.railH);
    fg = ctx.createLinearGradient(this.W - fw, 0, this.W, 0);
    fg.addColorStop(0, alpha(C.rail, 0));
    fg.addColorStop(1, C.rail);
    ctx.fillStyle = fg;
    ctx.fillRect(this.W - fw, top, fw, g.railH);

    // Marker: a pointer at the top and a short line at the bottom.
    const mx = this.W / 2;
    ctx.fillStyle = this.marker;
    ctx.beginPath();
    ctx.moveTo(mx - 11, top);
    ctx.lineTo(mx + 11, top);
    ctx.lineTo(mx, top + 14);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.fillRect(mx - 1.5, top + g.railH - 14, 3, 14);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private pill(x: number, y: number, w: number, h: number): void {
    const { ctx } = this;
    const r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  private drawBall(b: Ball, cx: number, cy: number, r: number, hit: boolean): void {
    const { ctx } = this;
    const L = letterOf(b.ball);
    const c = GROUP_COLOR[L];
    ctx.save();
    ctx.translate(cx, cy);
    if (hit) {
      ctx.scale(1.12, 1.12);
      ctx.shadowColor = this.hitColor;
      ctx.shadowBlur = 26;
    } else {
      ctx.shadowColor = 'rgba(0,0,0,.45)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 5;
    }
    const grad = ctx.createRadialGradient(-r * 0.36, -r * 0.44, r * 0.05, 0, 0, r);
    grad.addColorStop(0, mix(c, '#ffffff', 0.65));
    grad.addColorStop(0.38, c);
    grad.addColorStop(1, mix(c, '#000000', 0.45));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    if (hit) {
      ctx.lineWidth = 4;
      ctx.strokeStyle = this.hitColor;
      ctx.beginPath();
      ctx.arc(0, 0, r + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#fbfbf6';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.64, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = c;
    ctx.font = `${Math.round(r * 0.3)}px Bungee, "Arial Black", sans-serif`;
    ctx.fillText(L, 0, -r * 0.27);
    ctx.fillStyle = '#152020';
    ctx.font = `${Math.round(r * 0.5)}px Bungee, "Arial Black", sans-serif`;
    ctx.fillText(String(b.ball), 0, r * 0.14);
    ctx.restore();

    // Multiplier tag under the ball.
    const tc = TIER_COLOR[tier(b.mult)];
    const txt = `${fmtM(b.mult)}×`;
    ctx.font = `700 ${r < 34 ? 12 : 14}px "JetBrains Mono", ui-monospace, monospace`;
    const tw = ctx.measureText(txt).width + 18;
    const th = r < 34 ? 21 : 24;
    const ty = cy + r * (hit ? 1.12 : 1) + 9;
    this.pill(cx - tw / 2, ty, tw, th);
    ctx.fillStyle = alpha(tc, hit ? 0.45 : 0.22);
    ctx.fill();
    ctx.strokeStyle = alpha(tc, 0.7);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = mix(tc, '#ffffff', 0.6);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, cx, ty + th / 2 + 1);
  }

  private drawHistory(g: Geometry): void {
    const { ctx } = this;
    const y = 12;
    const h = 24;
    ctx.font = '600 10px "DM Sans", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = C.muted;
    ctx.fillText('PREVIOUS', 16, y + h / 2);
    let x = 16 + ctx.measureText('PREVIOUS').width + 12;
    const history = this.history();
    if (!history.length) {
      ctx.fillStyle = alpha(C.muted, 0.7);
      ctx.font = '12px "DM Sans", system-ui, sans-serif';
      ctx.fillText('Results of past balls show here', x, y + h / 2);
    }
    ctx.font = '600 12px "JetBrains Mono", ui-monospace, monospace';
    history.forEach((hh, i) => {
      const txt = `${letterOf(hh.ball)} ${fmtM(hh.mult)}×`;
      const w = ctx.measureText(txt).width + 18;
      if (x + w > this.W - 12) return;
      const col = GROUP_COLOR[letterOf(hh.ball)];
      ctx.globalAlpha = i === 0 ? 1 : Math.max(0.5, 1 - i * 0.04);
      this.pill(x, y, w, h);
      ctx.fillStyle = alpha(col, i === 0 ? 0.9 : 0.6);
      ctx.fill();
      if (hh.you) {
        ctx.strokeStyle = hh.win ? C.win : C.miss;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.fillStyle = '#0b1414';
      ctx.textAlign = 'center';
      ctx.fillText(txt, x + w / 2, y + h / 2 + 1);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
      x += w + 6;
    });
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, g.hist - 0.5);
    ctx.lineTo(this.W, g.hist - 0.5);
    ctx.stroke();
  }
}
