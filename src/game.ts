import { all, byId, one, prefersReducedMotion, sleep } from './dom';
import { MAX_MULTIPLIER, roll } from './fair';
import { GROUP_NAME, fmt, fmtM, isLetter, letterOf, money, tier } from './format';
import { C, GROUP_COLOR, LAND, Rail, START } from './rail';
import type { Sound } from './sound';
import { START_BALANCE, loadState, saveState } from './state';
import type { Bet, GameState, Letter, Mode, Phase } from './types';

/** How long each part of a round lasts, in ms. */
const BET_WINDOW_MS = 5000;
const SLIDE_MS = 4000;
const RESULT_HOLD_MS = 2000;

/**
 * The round clock and the bet panel. Rounds run forever:
 * betting window, then the slide, then the result. A placed bet joins the next ball.
 */
export class Game {
  readonly state: GameState = loadState();
  readonly rail: Rail;

  private phase: Phase = 'betting';
  private mode: Mode = 'manual';
  private pick: Letter = 'B';
  /** Bet waiting for the next ball. */
  private queued: Bet | null = null;
  /** Bet riding on the ball that is rolling now. */
  private live: Bet | null = null;
  private autoLeft = 0;

  private readonly el = {
    bal: byId('bal'),
    bet: byId<HTMLInputElement>('bet'),
    rounds: byId<HTMLInputElement>('rounds'),
    err: byId('err'),
    play: byId<HTMLButtonElement>('play'),
    playMain: byId('playMain'),
    playSub: byId('playSub'),
    callout: byId('callout'),
    phaseLabel: byId('phaseLabel'),
    pbar: byId('pbar'),
    log: byId('log'),
    autoBox: byId('autoBox'),
    tabs: one('.tabs'),
    tabManual: byId('tabManual'),
    tabAuto: byId('tabAuto'),
  };

  constructor(private readonly sound: Sound) {
    this.rail = new Rail(byId<HTMLCanvasElement>('rail'), () => this.state.history, sound);
  }

  /** True while the tour or another overlay should swallow game shortcuts. */
  shortcutsBlocked: () => boolean = () => false;

  start(): void {
    this.wire();
    this.renderWallet();
    this.renderLog();
    this.rail.idle(this.state.last);
    addEventListener('resize', () => {
      if (this.phase !== 'sliding') this.rail.idle(this.state.last);
    });
    void document.fonts?.ready.then(() => {
      if (this.phase !== 'sliding') this.rail.draw();
    });
    void this.loop();
  }

  // ---------- round clock ----------

  private async loop(): Promise<void> {
    for (;;) {
      await this.bettingWindow();
      await this.slide();
    }
  }

  private async bettingWindow(): Promise<void> {
    this.phase = 'betting';
    if (this.autoLeft > 0 && !this.queued && !this.placeBet()) this.autoLeft = 0;
    this.setPlayLabel();
    const end = performance.now() + BET_WINDOW_MS;
    this.setPhaseBar('Place your bets', BET_WINDOW_MS, 'bet');
    this.el.callout.innerHTML = '<span class="sr-only">Bets open</span>';
    let lastSec = Infinity;
    // Big countdown dial over the rail (the canvas band below "Previous").
    const ov = byId('cdown');
    const num = byId('cdNum');
    const arc = byId('cdArc');
    const g = this.rail.geo();
    ov.style.top = `${g.hist}px`;
    ov.style.height = `${g.railH}px`;
    ov.hidden = false;
    ov.classList.remove('out');
    while (performance.now() < end) {
      const left = Math.max(0, (end - performance.now()) / 1000);
      const sec = Math.ceil(left);
      if (sec <= 3 && sec > 0 && sec < lastSec) this.sound.play('count');
      if (sec !== lastSec && sec > 0) {
        num.textContent = String(sec);
        num.classList.toggle('hot', sec <= 3);
        num.classList.remove('bump');
        void num.offsetWidth;
        num.classList.add('bump');
      }
      arc.style.strokeDashoffset = String(100 - (left / (BET_WINDOW_MS / 1000)) * 100);
      arc.classList.toggle('hot', sec <= 3);
      lastSec = sec;
      await sleep(50);
    }
    ov.classList.add('out');
    setTimeout(() => {
      if (ov.classList.contains('out')) ov.hidden = true;
    }, 250);
  }

  private async slide(): Promise<void> {
    const s = this.state;
    this.phase = 'sliding';
    this.live = this.queued;
    this.queued = null;
    this.setPlayLabel();
    this.sound.play('go');

    const nonce = s.nonce;
    const res = await roll(s.server, s.client, nonce);
    s.nonce++;
    this.rail.build(res.seed, s.last, { mult: res.mult, ball: res.ball });
    const from = this.rail.offsetFor(START);
    const to = this.rail.offsetFor(LAND);
    this.rail.setMarker(C.brass);
    this.setPhaseBar('Rolling', 0, 'roll');
    const live = this.live;
    this.el.callout.innerHTML = '<span class="sr-only">Rolling</span>';
    await this.rail.slide(from, to, prefersReducedMotion() ? 150 : SLIDE_MS);
    await this.rail.settle(this.rail.offsetFor(LAND), prefersReducedMotion() ? 0 : 420);

    // Settle the round.
    this.phase = 'result';
    const L = letterOf(res.ball);
    let resultHtml = '';
    let win = false;
    this.sound.play('land');
    // Bingo-hall call: letter and number only.
    setTimeout(() => this.sound.call(`${L}, ${res.ball}.`), 250);
    if (live) {
      win = L === live.pick;
      const payout = win ? money(live.bet * res.mult) : 0;
      s.balance = money(s.balance + payout);
      s.bets.unshift({ nonce, mult: res.mult, ball: res.ball, pick: live.pick, bet: live.bet, win, profit: money(payout - live.bet) });
      s.bets = s.bets.slice(0, 30);
      this.sound.play(win ? (res.mult >= 12 ? 'bigwin' : 'win') : 'lose');
      const net = money(payout - live.bet);
      resultHtml = `<div class="rcard ${win ? 'win' : 'lose'}" role="status">
        <span class="rc-icon" aria-hidden="true">${win ? '✓' : '✕'}</span>
        <span class="rc-body">
          <span class="rc-title">${win ? 'You won' : 'You lost'}</span>
        </span>
        <span class="rc-vs" aria-label="You picked ${GROUP_NAME[live.pick]}, drawn ${L}-${res.ball}">
          <span class="vs-item"><small>You picked</small>${pickChip(live.pick)}</span>
          <span class="vs-arrow" aria-hidden="true">${win ? '=' : '≠'}</span>
          <span class="vs-item"><small>Drawn</small>${ballChip(res.ball, res.mult)}</span>
        </span>
        <span class="rc-amt">${win ? '+' : '−'}KES ${fmt(Math.abs(win ? net : live.bet))}</span>
      </div>`;
      this.flashWallet(win, win ? `+${fmt(payout)}` : '');
      this.flashStage(win);
      if (live.auto && this.autoLeft > 0) this.autoLeft--;
    }
    s.history.unshift({ nonce, mult: res.mult, ball: res.ball, you: !!live, win });
    s.history = s.history.slice(0, 30);
    s.last = { mult: res.mult, ball: res.ball, seed: res.seed };
    this.live = null;
    this.rail.markHit(LAND, live ? (win ? C.win : C.miss) : C.brass);
    this.el.callout.innerHTML = live
      ? resultHtml
      : `<span class="sr-only">Ball ${L}-${res.ball}, ${fmtM(res.mult)}×</span>`;
    this.renderWallet();
    this.renderLog();
    saveState(s);
    this.setPlayLabel();
    // Give a settled bet a little longer on screen so the outcome is easy to read.
    const hold = live ? RESULT_HOLD_MS + 1200 : RESULT_HOLD_MS;
    this.setPhaseBar('Ball called', hold, 'hold');
    await sleep(hold);
  }

  private setPhaseBar(label: string, ms: number, cls: string): void {
    this.el.phaseLabel.textContent = label;
    const bar = this.el.pbar;
    bar.style.transition = 'none';
    bar.style.width = ms ? '100%' : '0%';
    bar.className = cls;
    if (ms) {
      void bar.offsetWidth; // restart the transition
      bar.style.transition = `width ${ms}ms linear`;
      bar.style.width = '0%';
    }
  }

  // ---------- bets ----------

  private readBet(): { bet: number; err: string } {
    const raw = parseFloat(this.el.bet.value.replace(/,/g, ''));
    const bet = Number.isFinite(raw) ? Math.floor(raw * 100) / 100 : NaN;
    let err = '';
    if (!(bet >= 1)) err = 'The smallest bet is KES 1.';
    else if (bet > this.state.balance + 1e-9) err = 'That bet is more than your balance. Lower it or press Refill.';
    return { bet, err };
  }

  private placeBet(): boolean {
    const { bet, err } = this.readBet();
    this.el.err.textContent = err;
    if (err) return false;
    this.state.balance = money(this.state.balance - bet);
    this.queued = { bet, pick: this.pick, auto: this.autoLeft > 0 };
    this.sound.play('bet');
    this.renderWallet();
    saveState(this.state);
    return true;
  }

  private cancelBet(): void {
    if (!this.queued) return;
    this.state.balance = money(this.state.balance + this.queued.bet);
    this.queued = null;
    this.sound.play('cancel');
    this.renderWallet();
    saveState(this.state);
  }

  private onPlay(): void {
    if (this.mode === 'auto') {
      if (this.autoLeft > 0) {
        this.autoLeft = 0;
        this.cancelBet();
      } else {
        this.autoLeft = Math.max(1, Math.min(1000, parseInt(this.el.rounds.value, 10) || 0));
        if (this.phase === 'betting' && !this.queued && !this.placeBet()) this.autoLeft = 0;
      }
    } else if (this.queued || this.live) {
      return; // locked until the round ends
    } else {
      this.placeBet();
    }
    this.setPlayLabel();
  }

  // ---------- rendering ----------

  /** Float the balance change next to the wallet and tint it green or red. */
  private flashWallet(win: boolean, text: string): void {
    const wallet = this.el.bal.closest('.wallet');
    if (!wallet) return;
    wallet.classList.remove('up', 'down');
    void (wallet as HTMLElement).offsetWidth;
    wallet.classList.add(win ? 'up' : 'down');
    if (!text) {
      setTimeout(() => wallet.classList.remove('up', 'down'), 2600);
      return;
    }
    const f = document.createElement('span');
    f.className = `wdelta ${win ? 'up' : 'down'}`;
    f.textContent = text;
    wallet.append(f);
    setTimeout(() => {
      f.remove();
      wallet.classList.remove('up', 'down');
    }, 2600);
  }

  /** Briefly edge the stage in green or red. */
  private flashStage(win: boolean): void {
    const st = byId('stage');
    st.classList.remove('won', 'lost');
    void st.offsetWidth;
    st.classList.add(win ? 'won' : 'lost');
    setTimeout(() => st.classList.remove('won', 'lost'), 3000);
  }

  private renderWallet(): void {
    this.el.bal.textContent = fmt(this.state.balance);
    this.refreshControls();
  }

  private renderLog(): void {
    this.rail.draw();
    const rows = this.state.bets.slice(0, 30);
    if (!rows.length) {
      this.el.log.innerHTML = '<div class="lg-empty">Your bets will show here after the first round.</div>';
      return;
    }
    this.el.log.innerHTML = rows
      .map((h) => {
        const p = h.profit;
        return `<div class="lg-row ${h.win ? 'win' : 'lose'}">
          <span class="lg-rd">#${h.nonce + 1}</span>
          <span class="lg-drawn">${ballChip(h.ball, h.mult)}</span>
          <span class="lg-pick"><small>Pick</small>${pickChip(h.pick)}</span>
          <span class="lg-bet"><small>Bet</small>KES ${fmt(h.bet)}</span>
          <span class="lg-res"><em>${h.win ? 'WIN' : 'LOSS'}</em>${p >= 0 ? '+' : '−'}KES ${fmt(Math.abs(p))}</span>
        </div>`;
      })
      .join('');
  }

  private refreshControls(): void {
    const { bet } = this.readBet();
    all<HTMLButtonElement>('[data-a]').forEach((b) => b.classList.toggle('on', Number(b.dataset.a) === bet));
    all<HTMLButtonElement>('[data-r]').forEach((b) => b.classList.toggle('on', b.dataset.r === this.el.rounds.value));
    all<HTMLButtonElement>('[data-p]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.p === this.pick)));
    this.setPlayLabel();
  }

  /** Show the player's pick on the rail while their bet is waiting or rolling. */
  private renderYourPick(): void {
    const el = document.getElementById('yourPick');
    if (!el) return;
    const b = this.live ?? this.queued;
    if (!b) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.style.top = `${this.rail.geo().hist + 10}px`;
    el.style.setProperty('--c', GROUP_COLOR[b.pick]);
    el.innerHTML = `<small>Your pick</small><b>${b.pick}</b><span>${GROUP_NAME[b.pick]} · KES ${fmt(b.bet)}</span>`;
  }

  private setPlayLabel(): void {
    this.renderYourPick();
    const { play, playMain, playSub } = this.el;
    const { bet } = this.readBet();
    const sub = bet > 0 ? `${this.pick} · win up to KES ${fmt(bet * MAX_MULTIPLIER)}` : 'Set a bet';
    const when = this.phase === 'betting' ? 'this ball' : 'the next ball';
    play.classList.remove('stop', 'queued', 'placed');
    play.disabled = false;
    if (this.mode === 'auto') {
      if (this.autoLeft > 0) {
        playMain.textContent = 'Stop auto';
        playSub.textContent = `${this.autoLeft} round${this.autoLeft === 1 ? '' : 's'} left`;
        play.classList.add('stop');
      } else {
        playMain.textContent = 'Start auto';
        playSub.textContent = `${sub} · ${parseInt(this.el.rounds.value, 10) || 0} rounds`;
      }
    } else if (this.queued || this.live) {
      // A bet is in: lock the button until its round has a result.
      const b = (this.queued ?? this.live)!;
      playMain.textContent = this.live ? 'Rolling…' : 'Bet placed';
      playSub.textContent = `KES ${fmt(b.bet)} on ${b.pick} · ${this.live ? 'good luck' : when}`;
      play.classList.add('placed');
      play.disabled = true;
    } else {
      playMain.textContent = 'Place bet';
      playSub.textContent = sub;
    }
    const locked = this.autoLeft > 0 || !!this.queued || !!this.live;
    all<HTMLButtonElement>('.tabs button').forEach((b) => {
      b.disabled = locked && b.getAttribute('aria-selected') !== 'true';
    });
  }

  // ---------- controls ----------

  private setBet(v: number): void {
    const n = Math.max(1, Math.floor(v * 100) / 100);
    this.el.bet.value = Number.isInteger(n) ? String(n) : n.toFixed(2);
    this.refreshControls();
  }

  private stepBet(dir: 1 | -1): void {
    const v = parseFloat(this.el.bet.value) || 0;
    const st = v < 100 ? 10 : v < 1000 ? 50 : 100;
    this.setBet(Math.max(1, Math.round((v + dir * st) / st) * st));
  }

  private setMode(m: Mode): void {
    if (this.autoLeft || this.queued || this.live) return;
    this.mode = m;
    this.el.tabManual.setAttribute('aria-selected', String(m === 'manual'));
    this.el.tabAuto.setAttribute('aria-selected', String(m === 'auto'));
    this.el.autoBox.hidden = m !== 'auto';
    this.el.tabs.dataset.mode = m;
    this.setPlayLabel();
  }

  private setPick(p: Letter): void {
    this.pick = p;
    this.refreshControls();
  }

  private wire(): void {
    const click = () => this.sound.play('click');
    this.el.play.addEventListener('click', () => this.onPlay());
    byId('bDown').addEventListener('click', () => this.stepBet(-1));
    byId('bUp').addEventListener('click', () => this.stepBet(1));
    this.el.bet.addEventListener('input', () => this.refreshControls());
    all<HTMLButtonElement>('[data-a]').forEach((b) => b.addEventListener('click', () => this.setBet(Number(b.dataset.a))));
    all<HTMLButtonElement>('[data-p]').forEach((b) =>
      b.addEventListener('click', () => {
        const p = b.dataset.p ?? '';
        if (isLetter(p)) this.setPick(p);
      }),
    );
    all<HTMLButtonElement>('[data-r]').forEach((b) =>
      b.addEventListener('click', () => {
        if (this.autoLeft) return;
        this.el.rounds.value = b.dataset.r ?? '10';
        this.refreshControls();
      }),
    );
    this.el.tabManual.addEventListener('click', () => this.setMode('manual'));
    this.el.tabAuto.addEventListener('click', () => this.setMode('auto'));
    all('[data-a], [data-p], [data-r], #bUp, #bDown, .tabs button').forEach((b) => b.addEventListener('click', click));
    byId('refill').addEventListener('click', () => {
      this.state.balance = money(START_BALANCE);
      this.el.err.textContent = '';
      this.renderWallet();
      saveState(this.state);
    });

    // Keyboard: B I N G O pick a group, Space places or cancels a bet in Manual.
    document.addEventListener('keydown', (e) => {
      const t = e.target as Element;
      if (t.closest('input, textarea') || this.shortcutsBlocked()) return;
      const k = e.key.toUpperCase();
      if (isLetter(k)) {
        this.setPick(k);
        return;
      }
      if (e.code !== 'Space' || t.closest('button, summary')) return;
      e.preventDefault();
      if (this.mode === 'manual') this.onPlay();
    });
  }
}

/** The player's choice: a colour group, drawn as a flat outlined tag (never a ball). */
function pickChip(L: Letter): string {
  return `<span class="pick-chip" style="--c:${GROUP_COLOR[L]}"><i>${L}</i>${GROUP_NAME[L]}</span>`;
}

/** A drawn ball: glossy ball with its number, plus the multiplier it carried. */
function ballChip(ball: number, mult: number): string {
  const L = letterOf(ball);
  return `<span class="ball-chip" style="--c:${GROUP_COLOR[L]}"><b>${ball}</b><span class="bc-l">${L}-${ball}</span><span class="m-${tier(mult)}">${fmtM(mult)}×</span></span>`;
}
