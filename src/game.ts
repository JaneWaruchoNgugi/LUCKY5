import { all, byId, one, prefersReducedMotion, sleep } from './dom';
import { MAX_MULTIPLIER, roll } from './fair';
import { GROUP_NAME, fmt, fmtM, isLetter, letterOf, money } from './format';
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
    const lo = this.lastOutcome;
    this.lastOutcome = null;
    this.el.callout.innerHTML =
      (lo ? `<span class="last-pill ${lo.win ? 'win' : 'lose'}">Last bet: ${lo.win ? 'Won' : 'Lost'} ${lo.text}</span>` : '') +
      '<span class="hint" id="cd"></span>';
    const cd = byId('cd');
    let lastSec = Infinity;
    while (performance.now() < end) {
      const left = Math.max(0, (end - performance.now()) / 1000);
      const sec = Math.ceil(left);
      if (sec <= 3 && sec > 0 && sec < lastSec) this.sound.play('count');
      lastSec = sec;
      const q = this.queued;
      cd.textContent =
        `Bets open · next ball in ${left.toFixed(1)}s` +
        (q ? ` · you're in for KES ${fmt(q.bet)} on ${q.pick} (${GROUP_NAME[q.pick]})` : '');
      await sleep(100);
    }
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
    this.el.callout.innerHTML = `<span class="hint">${
      live ? `Rolling · your KES ${fmt(live.bet)} on ${live.pick} (${GROUP_NAME[live.pick]})` : 'Rolling · no bet from you this round'
    }</span>`;
    await this.rail.slide(from, to, prefersReducedMotion() ? 150 : SLIDE_MS);
    await this.rail.settle(this.rail.offsetFor(LAND), prefersReducedMotion() ? 0 : 420);

    // Settle the round.
    this.phase = 'result';
    const L = letterOf(res.ball);
    let resultHtml = '<span class="hint">No bet this round</span>';
    let win = false;
    this.sound.play('land');
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
          <span class="rc-sub">Your KES ${fmt(live.bet)} on ${live.pick} (${GROUP_NAME[live.pick]}) · ball was ${L}-${res.ball}${win ? ` · ${fmtM(res.mult)}× pays KES ${fmt(payout)}` : ''}</span>
        </span>
        <span class="rc-amt">${win ? '+' : '−'}KES ${fmt(Math.abs(win ? net : live.bet))}</span>
      </div>`;
      this.lastOutcome = { win, text: win ? `+KES ${fmt(net)}` : `−KES ${fmt(live.bet)}` };
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
      : `<span class="big" style="color:${GROUP_COLOR[L]}">${L}-${res.ball} · ${fmtM(res.mult)}×</span>` + resultHtml;
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
    } else if (this.queued) {
      this.cancelBet();
    } else {
      this.placeBet();
    }
    this.setPlayLabel();
  }

  // ---------- rendering ----------

  private lastOutcome: { win: boolean; text: string } | null = null;

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
    this.el.log.replaceChildren(
      ...this.state.bets.slice(0, 30).map((h) => {
        const tr = document.createElement('tr');
        const p = h.profit;
        tr.innerHTML =
          `<td>${h.nonce}</td><td>${letterOf(h.ball)}-${h.ball}</td><td>${fmtM(h.mult)}×</td>` +
          `<td>${h.pick} · ${GROUP_NAME[h.pick]}</td><td>${fmt(h.bet)}</td>` +
          `<td class="${p >= 0 ? 'w' : 'l'}">${p >= 0 ? '+' : '−'}${fmt(Math.abs(p))}</td>`;
        return tr;
      }),
    );
  }

  private refreshControls(): void {
    const { bet } = this.readBet();
    all<HTMLButtonElement>('[data-a]').forEach((b) => b.classList.toggle('on', Number(b.dataset.a) === bet));
    all<HTMLButtonElement>('[data-r]').forEach((b) => b.classList.toggle('on', b.dataset.r === this.el.rounds.value));
    all<HTMLButtonElement>('[data-p]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.p === this.pick)));
    this.setPlayLabel();
  }

  private setPlayLabel(): void {
    const { play, playMain, playSub } = this.el;
    const { bet } = this.readBet();
    const sub = bet > 0 ? `${this.pick} · win up to KES ${fmt(bet * MAX_MULTIPLIER)}` : 'Set a bet';
    const when = this.phase === 'betting' ? 'this ball' : 'the next ball';
    play.classList.remove('stop', 'queued');
    if (this.mode === 'auto') {
      if (this.autoLeft > 0) {
        playMain.textContent = 'Stop auto';
        playSub.textContent = `${this.autoLeft} round${this.autoLeft === 1 ? '' : 's'} left`;
        play.classList.add('stop');
      } else {
        playMain.textContent = 'Start auto';
        playSub.textContent = `${sub} · ${parseInt(this.el.rounds.value, 10) || 0} rounds`;
      }
    } else if (this.queued) {
      playMain.textContent = 'Cancel bet';
      playSub.textContent = `KES ${fmt(this.queued.bet)} on ${this.queued.pick} · ${when}`;
      play.classList.add('queued');
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
