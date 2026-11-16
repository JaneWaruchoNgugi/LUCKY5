/** Game sounds, synthesised with the Web Audio API (no audio files). */

export type SoundName = 'tick' | 'count' | 'go' | 'land' | 'bet' | 'cancel' | 'click' | 'win' | 'bigwin' | 'lose';

export interface SoundConfig {
  on: boolean;
  /** 0–1 */
  vol: number;
  ticks: boolean;
  count: boolean;
  result: boolean;
  ui: boolean;
}

const DEFAULTS: SoundConfig = { on: true, vol: 0.6, ticks: true, count: true, result: true, ui: true };

type AudioCtor = typeof AudioContext;

export class Sound {
  readonly cfg: SoundConfig;
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;

  constructor(private readonly storageKey = 'luckyfive.sound') {
    this.cfg = { ...DEFAULTS };
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as Partial<SoundConfig> | null;
      if (saved) Object.assign(this.cfg, saved);
    } catch {
      /* storage blocked: keep defaults */
    }
    // Browsers only allow audio after the viewer interacts with the page.
    addEventListener('pointerdown', () => this.ensure(), { once: true });
    addEventListener('keydown', () => this.ensure(), { once: true });
  }

  /** Create or resume the audio context. Safe to call often. */
  ensure(): void {
    try {
      if (!this.ac) {
        const Ctor: AudioCtor | undefined =
          window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
        if (!Ctor) return;
        this.ac = new Ctor();
        this.master = this.ac.createGain();
        this.master.connect(this.ac.destination);
      }
      if (this.ac.state === 'suspended') void this.ac.resume();
      this.applyVolume();
    } catch {
      /* audio unavailable */
    }
  }

  play(name: SoundName): void {
    if (!this.cfg.on) return;
    this.ensure();
    try {
      this.sounds[name]();
    } catch {
      /* ignore audio errors */
    }
  }

  save(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.cfg));
    } catch {
      /* storage blocked */
    }
    this.applyVolume();
  }

  private applyVolume(): void {
    if (this.master) this.master.gain.value = this.cfg.on ? this.cfg.vol : 0;
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.25, when = 0, glideTo = 0): void {
    const { ac, master } = this;
    if (!ac || !master || !this.cfg.on || this.cfg.vol === 0) return;
    const t = ac.currentTime + when;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  private readonly sounds: Record<SoundName, () => void> = {
    tick: () => { if (this.cfg.ticks) this.tone(2200, 0.025, 'square', 0.05); },
    count: () => { if (this.cfg.count) this.tone(880, 0.07, 'sine', 0.18); },
    go: () => {
      if (!this.cfg.count) return;
      this.tone(1175, 0.12, 'sine', 0.2);
      this.tone(1568, 0.16, 'sine', 0.14, 0.05);
    },
    land: () => { if (this.cfg.ticks) this.tone(320, 0.18, 'triangle', 0.28, 0, 180); },
    bet: () => {
      if (!this.cfg.ui) return;
      this.tone(660, 0.07, 'triangle', 0.2);
      this.tone(990, 0.09, 'triangle', 0.16, 0.05);
    },
    cancel: () => { if (this.cfg.ui) this.tone(520, 0.12, 'triangle', 0.16, 0, 300); },
    click: () => { if (this.cfg.ui) this.tone(1400, 0.03, 'sine', 0.1); },
    win: () => {
      if (!this.cfg.result) return;
      [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.22, i * 0.085));
    },
    bigwin: () => {
      if (!this.cfg.result) return;
      [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this.tone(f, 0.26, 'triangle', 0.22, i * 0.075));
      this.tone(2093, 0.6, 'sine', 0.12, 0.48);
    },
    lose: () => {
      if (!this.cfg.result) return;
      this.tone(300, 0.22, 'sawtooth', 0.07, 0, 150);
      this.tone(200, 0.3, 'triangle', 0.14, 0.1, 110);
    },
  };
}
