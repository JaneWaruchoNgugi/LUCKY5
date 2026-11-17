import type { Sound } from '../audio/sound';
import type { Rail } from '../canvas/rail';
import { LAND, START } from '../canvas/rail';
import { prefersReducedMotion, sleep } from '../lib/dom';
import { roll } from './fair';
import { letterOf, money } from './format';
import { START_BALANCE, loadState, saveState } from './state';
import { C } from './theme';
import type { Bet, BetEntry, GameState, Letter, Mode, Phase } from './types';

/** How long each part of a round lasts, in ms. */
export const BET_WINDOW_MS = 5000;
const SLIDE_MS = 4000;
const RESULT_HOLD_MS = 2000;

/** Outcome of a round the player had a bet on. */
export interface RoundResult {
  win: boolean;
  pick: Letter;
  ball: number;
  mult: number;
  bet: number;
  payout: number;
  /** Changes every round so the UI can replay its entrance animation. */
  id: number;
}

/** Everything the UI renders. A new object is created on every change. */
export interface Snapshot {
  balance: number;
  phase: Phase;
  mode: Mode;
  pick: Letter;
  /** Raw text of the bet input. */
  betText: string;
  rounds: number;
  queued: Bet | null;
  live: Bet | null;
  autoLeft: number;
  err: string;
  /** Seconds left in the betting window, or null outside it. */
  countdown: number | null;
  result: RoundResult | null;
  /** Screen-reader text for the current phase. */
  announce: string;
  bets: readonly BetEntry[];
}

/** Parse the bet input and validate it against the balance. */
export function readBet(text: string, balance: number): { bet: number; err: string } {
  const raw = parseFloat(text.replace(/,/g, ''));
  const bet = Number.isFinite(raw) ? Math.floor(raw * 100) / 100 : NaN;
  let err = '';
  if (!(bet >= 1)) err = 'The smallest bet is KES 1.';
  else if (bet > balance + 1e-9) err = 'That bet is more than your balance. Lower it or reset it in Settings.';
  return { bet, err };
}

/**
 * The round clock and betting rules, with no DOM code.
 * Rounds run forever: betting window, then the slide, then the result.
 * React subscribes with `subscribe` / `getSnapshot`; the canvas rail is attached once mounted.
 */
export class GameEngine {
  readonly state: GameState = loadState();
  private rail: Rail | null = null;
  private running = false;
  private resultId = 0;
  private listeners = new Set<() => void>();
  private snap: Snapshot;

  constructor(private readonly sound: Sound) {
    this.snap = {
      balance: this.state.balance,
      phase: 'betting',
      mode: 'manual',
      pick: 'B',
      betText: '10',
      rounds: 10,
      queued: null,
      live: null,
      autoLeft: 0,
      err: '',
      countdown: null,
      result: null,
      announce: '',
      bets: this.state.bets,
    };
  }

  // ---------- store ----------

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): Snapshot => this.snap;

  private set(patch: Partial<Snapshot>): void {
    this.snap = { ...this.snap, ...patch };
    for (const fn of this.listeners) fn();
  }

  /** History for the canvas "Previous" row. */
  history = () => this.state.history;

  // ---------- lifecycle ----------

  attachRail(rail: Rail): void {
    this.rail = rail;
    rail.idle(this.state.last);
    if (!this.running) {
      this.running = true;
      void this.loop();
    }
  }

  /** Rail layout: the "Previous" band height and the rail height, for overlays. */
  railGeo(): { hist: number; railH: number } {
    return this.rail ? this.rail.geo() : { hist: 42, railH: 150 };
  }

  /** Redraw the rail at rest, e.g. once web fonts have loaded. */
  redraw(): void {
    if (this.rail && this.snap.phase !== 'sliding') this.rail.draw();
  }

  /** Re-layout the rail at rest (on resize). */
  relayout(): void {
    if (this.rail && this.snap.phase !== 'sliding') this.rail.idle(this.state.last);
  }

  private async loop(): Promise<void> {
    for (;;) {
      await this.bettingWindow();
      await this.slide();
    }
  }

  private async bettingWindow(): Promise<void> {
    this.set({ phase: 'betting', result: null, announce: 'Bets open' });
    if (this.snap.autoLeft > 0 && !this.snap.queued && !this.placeBet()) this.set({ autoLeft: 0 });
    const end = performance.now() + BET_WINDOW_MS;
    let lastSec = Infinity;
    while (performance.now() < end) {
      const left = Math.max(0, (end - performance.now()) / 1000);
      const sec = Math.ceil(left);
      if (sec <= 3 && sec > 0 && sec < lastSec) this.sound.play('count');
      lastSec = sec;
      this.set({ countdown: left });
      await sleep(50);
    }
    this.set({ countdown: null });
  }

  private async slide(): Promise<void> {
    const rail = this.rail;
    if (!rail) return;
    const s = this.state;
    const live = this.snap.queued;
    this.set({ phase: 'sliding', live, queued: null, announce: 'Rolling' });
    this.sound.play('go');

    const nonce = s.nonce;
    const res = await roll(s.server, s.client, nonce);
    s.nonce++;
    rail.build(res.seed, s.last, { mult: res.mult, ball: res.ball });
    rail.setMarker(C.brass);
    await rail.slide(rail.offsetFor(START), rail.offsetFor(LAND), prefersReducedMotion() ? 150 : SLIDE_MS);
    await rail.settle(rail.offsetFor(LAND), prefersReducedMotion() ? 0 : 420);

    // Settle the round.
    const L = letterOf(res.ball);
    let win = false;
    let result: RoundResult | null = null;
    let autoLeft = this.snap.autoLeft;
    this.sound.play('land');
    setTimeout(() => this.sound.call(`${L}, ${res.ball}.`), 250);
    if (live) {
      win = L === live.pick;
      const payout = win ? money(live.bet * res.mult) : 0;
      s.balance = money(s.balance + payout);
      s.bets = [
        { nonce, mult: res.mult, ball: res.ball, pick: live.pick, bet: live.bet, win, profit: money(payout - live.bet) },
        ...s.bets,
      ].slice(0, 30);
      this.sound.play(win ? (res.mult >= 12 ? 'bigwin' : 'win') : 'lose');
      result = { win, pick: live.pick, ball: res.ball, mult: res.mult, bet: live.bet, payout, id: ++this.resultId };
      if (live.auto && autoLeft > 0) autoLeft--;
    }
    s.history = [{ nonce, mult: res.mult, ball: res.ball, you: !!live, win }, ...s.history].slice(0, 30);
    s.last = { mult: res.mult, ball: res.ball, seed: res.seed };
    rail.markHit(LAND, live ? (win ? C.win : C.miss) : C.brass);
    saveState(s);
    this.set({
      phase: 'result',
      live: null,
      result,
      autoLeft,
      balance: s.balance,
      bets: s.bets,
      announce: `Ball ${L}-${res.ball}`,
    });
    // Give a settled bet a little longer on screen so the outcome is easy to read.
    await sleep(live ? RESULT_HOLD_MS + 1200 : RESULT_HOLD_MS);
  }

  // ---------- bets ----------

  private placeBet(): boolean {
    const { bet, err } = readBet(this.snap.betText, this.state.balance);
    this.set({ err });
    if (err) return false;
    this.state.balance = money(this.state.balance - bet);
    saveState(this.state);
    this.set({ balance: this.state.balance, queued: { bet, pick: this.snap.pick, auto: this.snap.autoLeft > 0 } });
    this.sound.play('bet');
    return true;
  }

  private cancelBet(): void {
    const q = this.snap.queued;
    if (!q) return;
    this.state.balance = money(this.state.balance + q.bet);
    saveState(this.state);
    this.set({ balance: this.state.balance, queued: null });
    this.sound.play('cancel');
  }

  /** The main button: place a manual bet, or start / stop auto. */
  play(): void {
    const { mode, autoLeft, queued, live, phase, rounds } = this.snap;
    if (mode === 'auto') {
      if (autoLeft > 0) {
        this.set({ autoLeft: 0 });
        this.cancelBet();
      } else {
        this.set({ autoLeft: Math.max(1, Math.min(1000, rounds)) });
        if (phase === 'betting' && !queued && !this.placeBet()) this.set({ autoLeft: 0 });
      }
    } else if (!queued && !live) {
      this.placeBet();
    }
  }

  /** True while a bet or auto run stops the player switching tabs or rounds. */
  get locked(): boolean {
    return this.snap.autoLeft > 0 || !!this.snap.queued || !!this.snap.live;
  }

  // ---------- controls ----------

  setBetText(text: string): void {
    this.set({ betText: text });
  }

  setBet(v: number): void {
    const n = Math.max(1, Math.floor(v * 100) / 100);
    this.set({ betText: Number.isInteger(n) ? String(n) : n.toFixed(2) });
  }

  stepBet(dir: 1 | -1): void {
    const v = parseFloat(this.snap.betText) || 0;
    const st = v < 100 ? 10 : v < 1000 ? 50 : 100;
    this.setBet(Math.max(1, Math.round((v + dir * st) / st) * st));
  }

  setPick(p: Letter): void {
    this.set({ pick: p });
  }

  setMode(m: Mode): void {
    if (this.locked) return;
    this.set({ mode: m });
  }

  setRounds(n: number): void {
    if (this.snap.autoLeft) return;
    this.set({ rounds: n });
  }

  refill(): void {
    this.state.balance = money(START_BALANCE);
    saveState(this.state);
    this.set({ balance: this.state.balance, err: '' });
  }
}
