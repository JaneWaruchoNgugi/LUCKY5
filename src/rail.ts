import { prefersReducedMotion } from './dom';
import { decoy, mulberry32 } from './fair';
import { fmtM, letterOf, tier, type Tier } from './format';
import type { Sound } from './sound';
import type { Ball, HistoryEntry, LastBall, Letter } from './types';

/** Colours of the five groups. */
export const GROUP_COLOR: Record<Letter, string> = { B: '#4a5cff', I: '#ff2d6f', N: '#8a9896', G: '#1fd16a', O: '#ff9418' };
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
/** CSS-style cubic-bezier easing (x1, y1, x2, y2), solved with Newton steps plus bisection. */
const bezier = (x1: number, y1: number, x2: number, y2: number) => {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sy = (u: number) => ((ay * u + by) * u + cy) * u;
  const dx = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  return (t: number): number => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let u = t;
    for (let i = 0; i < 6; i++) {
      const e = sx(u) - t;
      const d = dx(u);
      if (Math.abs(e) < 1e-6) return sy(u);
      if (Math.abs(d) < 1e-6) break;
      u -= e / d;
    }
    let lo = 0, hi = 1;
    u = t;
    for (let i = 0; i < 30; i++) {
      const e = sx(u) - t;
      if (Math.abs(e) < 1e-6) break;
      if (e > 0) hi = u;
      else lo = u;
      u = (lo + hi) / 2;
    }
    return sy(u);
  };
};
/** Starts from rest, picks up speed, then coasts down to a stop like a rolling ball. */
const ease = bezier(0.3, 0.05, 0.08, 1);
/** Gentle overshoot used when the landed ball settles into the centre window. */
const easeBack = (t: number): number => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
const HIT_SCALE = 1.1;

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
  /** Where the strip will come to rest; the ball faces are upright there. */
  private restX = 0;
  private hit = -1;
  private hitColor: string = C.brass;
  /** Reveal effect for the landed ball (spotlight, bounce, sparks). */
  private revealAt = 0;
  private fxRaf = 0;
  private sparks: { a: number; v: number; s: number; c: string }[] = [];
  /** Strip speed in px per frame, for motion trails. */
  private speed = 0;
  private dir = 0;
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
    if (this.W >= 900) return { bw: 112, gap: 18, r: 48, hist: 52, railH: 214 };
    const small = this.W < 560;
    return { bw: small ? 70 : 92, gap: small ? 10 : 14, r: small ? 31 : 40, hist: small ? 42 : 46, railH: small ? 150 : 178 };
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
      this.x = this.restX = this.offsetFor(START);
      this.hit = last ? START : -1;
    } else {
      this.x = this.restX = this.offsetFor(this.hit >= 0 ? this.hit : START);
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
    this.speed = 0;
    this.startReveal();
  }

  private startReveal(): void {
    this.stopFx();
    const b = this.balls[this.hit];
    const col = b ? GROUP_COLOR[letterOf(b.ball)] : C.brass;
    this.sparks = Array.from({ length: 22 }, (_, i) => ({
      a: (i / 22) * Math.PI * 2 + Math.random() * 0.3,
      v: 0.7 + Math.random() * 0.6,
      s: 1.5 + Math.random() * 2.2,
      c: i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? col : this.hitColor,
    }));
    this.revealAt = performance.now();
    if (prefersReducedMotion()) {
      this.revealAt -= 5000;
      this.draw();
      return;
    }
    const loop = () => {
      this.draw();
      if (performance.now() - this.revealAt < 4200) this.fxRaf = requestAnimationFrame(loop);
    };
    this.fxRaf = requestAnimationFrame(loop);
  }

  private stopFx(): void {
    cancelAnimationFrame(this.fxRaf);
    this.fxRaf = 0;
  }

  /** 0→1 progress of the reveal; 1 when idle. */
  private revealP(): number {
    if (this.hit < 0 || !this.revealAt) return 1;
    return Math.min(1, (performance.now() - this.revealAt) / 650);
  }

  /** Scale of the landed ball: a quick pop past full size, then a squash back to rest. */
  private hitScale(): number {
    const p = this.revealP();
    if (p >= 1) return HIT_SCALE;
    const pop = Math.sin(p * Math.PI) * 0.16 * (1 - p * 0.4);
    return HIT_SCALE + pop;
  }

  /** Animate the strip; ticks once per ball passing the marker. */
  slide(from: number, to: number, durationMs: number): Promise<void> {
    this.stopFx();
    this.revealAt = 0;
    return new Promise((done) => {
      const pitch = this.geo().bw + this.geo().gap;
      // Wind-up: the strip leans back a little before it launches.
      const wind = durationMs > 1000 ? 280 : 0;
      const back = -Math.sign(to - from) * pitch * 0.32;
      const t0 = performance.now() + wind;
      const tw = performance.now();
      let lastIdx = Math.floor((this.W / 2 - from) / pitch);
      let prev = from;
      this.dir = Math.sign(to - from);
      const step = (now: number) => {
        if (now < t0) {
          const w = (now - tw) / wind;
          this.x = from + back * Math.sin(w * Math.PI * 0.5);
          this.speed = 0;
          this.draw();
          requestAnimationFrame(step);
          return;
        }
        const t = Math.min(1, (now - t0) / durationMs);
        // Release from the wind-up position into the main glide.
        const start = from + back * Math.max(0, 1 - t * 6);
        this.x = start + (to - start) * ease(t);
        this.speed = Math.abs(this.x - prev);
        prev = this.x;
        this.draw();
        const idx = Math.floor((this.W / 2 - this.x) / pitch);
        if (idx !== lastIdx) {
          lastIdx = idx;
          this.sound.play('tick');
        }
        if (t < 1) requestAnimationFrame(step);
        else {
          this.speed = 0;
          done();
        }
      };
      this.x = from;
      this.restX = to;
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
    const cy = this.ballY(g);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, this.W, g.railH);
    ctx.clip();
    const p = this.revealP();
    const revealing = this.hit >= 0 && this.revealAt > 0;
    if (revealing) this.drawRays(g, cy, p);
    this.drawSlot(g, top);
    this.balls.forEach((b, i) => {
      const cx = this.x + i * pitch + g.bw / 2;
      if (cx < -g.bw || cx > this.W + g.bw) return;
      const isHit = i === this.hit;
      // Neighbours step back so the drawn ball owns the stage.
      ctx.globalAlpha = revealing && !isHit ? 1 - 0.55 * p : 1;
      if (this.speed > 4) this.drawTrail(b, cx, cy, g.r);
      this.drawBall(b, cx, cy, g.r, isHit, (this.x - this.restX) / g.r);
      ctx.globalAlpha = 1;
    });
    if (revealing) this.drawSparks(g, cy);

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

    ctx.restore();
    this.drawPointers(g, top);
  }

  /** Rotating light rays in the drawn ball's colour. */
  private drawRays(g: Geometry, cy: number, p: number): void {
    const b = this.balls[this.hit];
    if (!b) return;
    const { ctx } = this;
    const col = GROUP_COLOR[letterOf(b.ball)];
    const cx = this.W / 2;
    const R = g.railH * 1.1;
    const t = (performance.now() - this.revealAt) / 1000;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.35);
    const rays = 12;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2;
      const grad = ctx.createRadialGradient(0, 0, g.r * 0.6, 0, 0, R);
      grad.addColorStop(0, alpha(col, 0.32 * p));
      grad.addColorStop(1, alpha(col, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R, a - 0.09, a + 0.09);
      ctx.closePath();
      ctx.fill();
    }
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, g.r * 2.4);
    glow.addColorStop(0, alpha(col, 0.35 * p));
    glow.addColorStop(1, alpha(col, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, g.r * 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Burst of sparks when the ball lands. */
  private drawSparks(g: Geometry, cy: number): void {
    const t = (performance.now() - this.revealAt) / 900;
    if (t >= 1) return;
    const { ctx } = this;
    const cx = this.W / 2;
    const ease = 1 - Math.pow(1 - t, 3);
    for (const s of this.sparks) {
      const d = g.r * (1.05 + ease * 1.5 * s.v);
      ctx.globalAlpha = (1 - t) * 0.95;
      ctx.fillStyle = s.c;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(s.a) * d, cy + Math.sin(s.a) * d, s.s * (1 - t * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Speed streak behind a ball while the strip is moving fast. */
  private drawTrail(b: Ball, cx: number, cy: number, r: number): void {
    const { ctx } = this;
    const len = Math.min(r * 2.6, this.speed * 5);
    const side = -this.dir; // trail points back where the ball came from
    const col = GROUP_COLOR[letterOf(b.ball)];
    const x2 = cx + side * len;
    const grad = ctx.createLinearGradient(cx, 0, x2, 0);
    grad.addColorStop(0, alpha(col, 0.45));
    grad.addColorStop(1, alpha(col, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx + (side * len) / 2, cy, len / 2 + r * 0.4, r * 0.82, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private ballY(g: Geometry): number {
    return g.hist + g.r + 28;
  }

  /** The centre window: wide and tall enough for the enlarged landed ball, its ring and its tag. */
  private slotBox(g: Geometry): { x: number; y: number; w: number; h: number } {
    const cy = this.ballY(g);
    const hitR = g.r * HIT_SCALE + 5;
    const tagH = g.r < 34 ? 21 : 24;
    const w = Math.max(g.bw + g.gap * 0.6, hitR * 2 + 18);
    const y = cy - hitR - 9;
    const bottom = cy + g.r * HIT_SCALE + 9 + tagH + 9;
    return { x: this.W / 2 - w / 2, y, w, h: bottom - y };
  }

  /** After the slide, ease the landed ball exactly into the centre of the window. */
  settle(to: number, durationMs = 420): Promise<void> {
    const from = this.x;
    if (Math.abs(to - from) < 0.5 || durationMs <= 0) {
      this.x = to;
      this.draw();
      return Promise.resolve();
    }
    return new Promise((done) => {
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / durationMs);
        this.x = from + (to - from) * easeBack(t);
        this.draw();
        if (t < 1) requestAnimationFrame(step);
        else done();
      };
      requestAnimationFrame(step);
    });
  }

  /** Glass window behind the centre slot, tinted with the marker colour. */
  private drawSlot(g: Geometry, top: number): void {
    const { ctx } = this;
    void top;
    const { x, y, w, h } = this.slotBox(g);
    const r = 22;
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };
    ctx.save();
    // soft outer glow
    ctx.shadowColor = alpha(this.marker, 0.45);
    ctx.shadowBlur = 24;
    path();
    const fill = ctx.createLinearGradient(0, y, 0, y + h);
    fill.addColorStop(0, alpha(this.marker, 0.24));
    fill.addColorStop(0.45, alpha(this.marker, 0.06));
    fill.addColorStop(1, alpha(this.marker, 0.18));
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    // edge
    const edge = ctx.createLinearGradient(0, y, 0, y + h);
    edge.addColorStop(0, alpha(this.marker, 0.5));
    edge.addColorStop(0.5, alpha(this.marker, 0.18));
    edge.addColorStop(1, alpha(this.marker, 0.5));
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1;
    ctx.stroke();
    // bright corner brackets frame the window
    const L = Math.min(18, w * 0.2);
    ctx.strokeStyle = this.marker;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.shadowColor = this.marker;
    ctx.shadowBlur = 10;
    const corner = (cx: number, cy: number, sx: 1 | -1, sy: 1 | -1) => {
      ctx.beginPath();
      ctx.moveTo(cx, cy + sy * (r * 0.35 + L));
      ctx.lineTo(cx, cy + sy * r * 0.35);
      ctx.quadraticCurveTo(cx, cy, cx + sx * r * 0.35, cy);
      ctx.lineTo(cx + sx * (r * 0.35 + L), cy);
      ctx.stroke();
    };
    corner(x, y, 1, 1);
    corner(x + w, y, -1, 1);
    corner(x, y + h, 1, -1);
    corner(x + w, y + h, -1, -1);
    ctx.shadowColor = 'transparent';
    // light streak down the middle of the glass
    const streak = ctx.createLinearGradient(x, 0, x + w, 0);
    streak.addColorStop(0, 'rgba(255,255,255,0)');
    streak.addColorStop(0.5, 'rgba(255,255,255,0.05)');
    streak.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = streak;
    path();
    ctx.fill();
    ctx.restore();
  }

  /** Glowing pointers above and below the centre slot. */
  private drawPointers(g: Geometry, top: number): void {
    const { ctx } = this;
    const mx = this.W / 2;
    const pointer = (tipY: number, dir: 1 | -1) => {
      const w = g.r < 34 ? 13 : 17;
      const h = g.r < 34 ? 15 : 19;
      const baseY = tipY - dir * h;
      ctx.save();
      ctx.shadowColor = this.marker;
      ctx.shadowBlur = 14;
      const grad = ctx.createLinearGradient(0, baseY, 0, tipY);
      grad.addColorStop(0, mix(this.marker, '#ffffff', 0.55));
      grad.addColorStop(1, this.marker);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(mx - w, baseY);
      ctx.lineTo(mx + w, baseY);
      ctx.quadraticCurveTo(mx + w * 0.25, baseY + dir * h * 0.55, mx + 2.5, tipY - dir * 2);
      ctx.quadraticCurveTo(mx, tipY + dir * 1.5, mx - 2.5, tipY - dir * 2);
      ctx.quadraticCurveTo(mx - w * 0.25, baseY + dir * h * 0.55, mx - w, baseY);
      ctx.closePath();
      ctx.fill();
      ctx.shadowColor = 'transparent';
      // small shine on the pointer
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.ellipse(mx - w * 0.35, baseY + dir * 3.5, 4, 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    void top;
    const box = this.slotBox(g);
    pointer(box.y + 7, 1);
    pointer(box.y + box.h - 7, -1);
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

  private drawBall(b: Ball, cx: number, cy: number, r: number, hit: boolean, spin = 0): void {
    const { ctx } = this;
    const L = letterOf(b.ball);
    const c = GROUP_COLOR[L];
    ctx.save();
    ctx.translate(cx, cy);
    if (hit) {
      const hs = this.hitScale();
      ctx.scale(hs, hs);
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
    // The face turns as the ball rolls; shading and gloss stay put so it reads as a sphere.
    ctx.rotate(spin);
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

    // Multiplier tag under the ball: dark glass capsule, number in its tier colour.
    const tr = tier(b.mult);
    const tc = TIER_COLOR[tr];
    const big = tr === 't3' || tr === 't4' || tr === 't5';
    const num = fmtM(b.mult);
    const small = r < 34;
    const fNum = `700 ${small ? 12 : 14}px "JetBrains Mono", ui-monospace, monospace`;
    const fX = `700 ${small ? 9 : 10}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.font = fNum;
    const nw = ctx.measureText(num).width;
    ctx.font = fX;
    const xw = ctx.measureText('×').width;
    const tw = nw + xw + 1 + (small ? 20 : 24);
    const th = small ? 21 : 24;
    const tx = cx - tw / 2;
    const ty = cy + r * (hit ? HIT_SCALE : 1) + 9;
    ctx.save();
    if (hit && this.revealAt) {
      // Pop the landed multiplier tag along with the ball.
      const k = 1 + (this.hitScale() - HIT_SCALE) * 1.4;
      ctx.translate(cx, ty + th / 2);
      ctx.scale(k, k);
      ctx.translate(-cx, -(ty + th / 2));
    }
    ctx.save();
    this.pill(tx, ty, tw, th);
    if (hit) {
      const fill = ctx.createLinearGradient(0, ty, 0, ty + th);
      fill.addColorStop(0, mix(tc, '#ffffff', 0.35));
      fill.addColorStop(1, tc);
      ctx.fillStyle = fill;
      ctx.shadowColor = tc;
      ctx.shadowBlur = 16;
    } else {
      const fill = ctx.createLinearGradient(0, ty, 0, ty + th);
      fill.addColorStop(0, 'rgba(30,52,52,.92)');
      fill.addColorStop(1, 'rgba(6,16,16,.92)');
      ctx.fillStyle = fill;
      if (big) {
        ctx.shadowColor = alpha(tc, 0.7);
        ctx.shadowBlur = 10;
      }
    }
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1;
    ctx.strokeStyle = hit ? alpha('#ffffff', 0.55) : alpha(tc, big ? 0.85 : 0.45);
    ctx.stroke();
    // Top sheen.
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    ctx.fillRect(tx, ty, tw, th / 2);
    ctx.restore();
    const ink = hit ? '#0b1414' : big ? tc : mix(tc, '#ffffff', 0.45);
    const sx = cx - (nw + 1 + xw) / 2;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ink;
    ctx.font = fNum;
    ctx.fillText(num, sx, ty + th / 2 + 1);
    ctx.globalAlpha *= 0.75;
    ctx.font = fX;
    ctx.fillText('×', sx + nw + 1, ty + th / 2 + 1.5);
    ctx.restore();
  }

  private drawHistory(g: Geometry): void {
    const { ctx } = this;
    const h = 28;
    const y = Math.round((g.hist - h) / 2);
    const mid = y + h / 2;
    ctx.font = '700 10px "DM Sans", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = C.muted;
    ctx.fillText('PREVIOUS', 16, mid);
    let x = 16 + ctx.measureText('PREVIOUS').width + 12;
    const history = this.history();
    if (!history.length) {
      ctx.fillStyle = alpha(C.muted, 0.7);
      ctx.font = '12px "DM Sans", system-ui, sans-serif';
      ctx.fillText('Results of past balls show here', x, mid);
    }
    const br = 10.5;
    history.forEach((hh, i) => {
      const L = letterOf(hh.ball);
      const col = GROUP_COLOR[L];
      const tc = TIER_COLOR[tier(hh.mult)];
      const txt = `${fmtM(hh.mult)}×`;
      ctx.font = '700 12px "JetBrains Mono", ui-monospace, monospace';
      const w = 4 + br * 2 + 6 + ctx.measureText(txt).width + 10;
      if (x + w > this.W - 12) return;
      ctx.globalAlpha = i === 0 ? 1 : Math.max(0.45, 1 - i * 0.05);

      // Capsule: dark glass tinted with the group colour.
      this.pill(x, y, w, h);
      const bg = ctx.createLinearGradient(x, 0, x + w, 0);
      bg.addColorStop(0, alpha(col, i === 0 ? 0.42 : 0.26));
      bg.addColorStop(1, 'rgba(8,16,16,.55)');
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.lineWidth = hh.you ? 2 : 1;
      ctx.strokeStyle = hh.you ? (hh.win ? C.win : C.miss) : alpha(col, i === 0 ? 0.85 : 0.4);
      if (i === 0 && !hh.you) {
        ctx.shadowColor = col;
        ctx.shadowBlur = 10;
      }
      ctx.stroke();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;

      // Mini glossy ball with the number.
      const cx = x + 4 + br;
      const grad = ctx.createRadialGradient(cx - br * 0.35, mid - br * 0.45, br * 0.1, cx, mid, br);
      grad.addColorStop(0, mix(col, '#ffffff', 0.6));
      grad.addColorStop(0.45, col);
      grad.addColorStop(1, mix(col, '#000000', 0.45));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, mid, br, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fbfbf6';
      ctx.beginPath();
      ctx.arc(cx, mid, br * 0.66, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#152020';
      ctx.textAlign = 'center';
      ctx.font = `700 ${hh.ball > 9 ? 8.5 : 9.5}px "JetBrains Mono", ui-monospace, monospace`;
      ctx.fillText(String(hh.ball), cx, mid + 0.5);

      // Multiplier in its tier colour.
      ctx.textAlign = 'left';
      ctx.font = '700 12px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillStyle = tc;
      ctx.fillText(txt, cx + br + 6, mid + 1);
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
