/**
 * Soft lounge loop synthesised with Web Audio: warm pads, a round bass,
 * a light shuffle and a sparse marimba-like arpeggio. No audio files.
 *
 * Progression (one bar each, 96 BPM): Am9 – Fmaj7 – Cmaj7 – G6.
 */

const BPM = 96;
const BEAT = 60 / BPM;
const STEP = BEAT / 2; // eighth notes
const STEPS_PER_BAR = 8;

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/** [bass root, pad voicing, arpeggio notes] as MIDI numbers. */
const BARS: ReadonlyArray<readonly [number, readonly number[], readonly number[]]> = [
  [45, [57, 60, 64, 67, 71], [69, 72, 76, 79, 83]], // Am9
  [41, [57, 60, 64, 65], [69, 72, 76, 77, 81]], // Fmaj7
  [48, [55, 59, 64, 67], [67, 71, 72, 76, 79]], // Cmaj7
  [43, [55, 59, 62, 64], [67, 71, 74, 76, 79]], // G6
];

/** Fixed arpeggio rhythm (1 = play) and note picks so the loop feels composed, not random. */
const ARP_HITS = [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0];
const ARP_NOTES = [0, 0, 2, 1, 0, 3, 0, 2, 4, 0, 0, 2, 0, 1, 3, 0];

export class Music {
  private readonly bus: GainNode;
  private readonly tone: BiquadFilterNode;
  private timer = 0;
  private step = 0;
  private next = 0;
  private playing = false;
  private noise: AudioBuffer | null = null;

  constructor(
    private readonly ac: AudioContext,
    out: AudioNode,
  ) {
    this.tone = ac.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 2600;
    this.bus = ac.createGain();
    this.bus.gain.value = 0;
    this.tone.connect(this.bus);
    this.bus.connect(out);
  }

  /** Overall music level relative to the sound effects (kept low on purpose). */
  private static readonly LEVEL = 0.32;

  get isPlaying(): boolean {
    return this.playing;
  }

  start(): void {
    if (this.playing) return;
    this.playing = true;
    const t = this.ac.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setValueAtTime(this.bus.gain.value, t);
    this.bus.gain.linearRampToValueAtTime(Music.LEVEL, t + 2.5);
    this.next = t + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 40);
  }

  stop(): void {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this.timer);
    const t = this.ac.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setValueAtTime(this.bus.gain.value, t);
    this.bus.gain.linearRampToValueAtTime(0, t + 0.6);
  }

  /** Dip the music briefly, e.g. while the caller speaks. */
  duck(seconds = 1.6): void {
    if (!this.playing) return;
    const t = this.ac.currentTime;
    const g = this.bus.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(Music.LEVEL * 0.35, t + 0.12);
    g.setValueAtTime(Music.LEVEL * 0.35, t + seconds);
    g.linearRampToValueAtTime(Music.LEVEL, t + seconds + 0.8);
  }

  private schedule(): void {
    const now = this.ac.currentTime;
    // After the tab was in the background, skip ahead instead of firing a burst of notes.
    if (this.next < now - 0.2) this.next = now + 0.05;
    while (this.next < now + 0.2) {
      this.playStep(this.step, this.next);
      this.next += STEP * (this.step % 2 === 0 ? 1.08 : 0.92); // gentle swing
      this.step = (this.step + 1) % (STEPS_PER_BAR * BARS.length);
    }
  }

  private playStep(step: number, t: number): void {
    const bar = BARS[Math.floor(step / STEPS_PER_BAR)];
    if (!bar) return;
    const [root, pad, arp] = bar;
    const s = step % STEPS_PER_BAR;
    const s16 = step % 16;

    if (s === 0) this.pad(pad, t, BEAT * 4);
    // Bass: root on 1, a fifth on the "and" of 2, root again on 3.
    if (s === 0) this.bass(midi(root), t, BEAT * 1.3);
    if (s === 3) this.bass(midi(root + 7), t, BEAT * 0.5, 0.5);
    if (s === 4) this.bass(midi(root), t, BEAT * 1.2, 0.8);
    // Soft kick on 1 and 3, brushed hat on the off-beats.
    if (s === 0 || s === 4) this.kick(t);
    if (s % 2 === 1) this.hat(t, s === 7 ? 0.05 : 0.03);
    // Arpeggio.
    if (ARP_HITS[s16]) {
      const n = arp[ARP_NOTES[s16] ?? 0];
      if (n !== undefined) this.pluck(midi(n), t);
    }
  }

  private env(g: GainNode, t: number, peak: number, attack: number, dur: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  private pad(notes: readonly number[], t: number, dur: number): void {
    for (const n of notes) {
      for (const detune of [-6, 6]) {
        const o = this.ac.createOscillator();
        const g = this.ac.createGain();
        o.type = 'triangle';
        o.frequency.value = midi(n);
        o.detune.value = detune;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.018, t + 0.7);
        g.gain.setValueAtTime(0.018, t + dur - 0.5);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.4);
        o.connect(g);
        g.connect(this.tone);
        o.start(t);
        o.stop(t + dur + 0.5);
      }
    }
  }

  private bass(f: number, t: number, dur: number, level = 1): void {
    const o = this.ac.createOscillator();
    const g = this.ac.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    this.env(g, t, 0.16 * level, 0.02, dur);
    o.connect(g);
    g.connect(this.tone);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private kick(t: number): void {
    const o = this.ac.createOscillator();
    const g = this.ac.createGain();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    this.env(g, t, 0.16, 0.005, 0.22);
    o.connect(g);
    g.connect(this.tone);
    o.start(t);
    o.stop(t + 0.25);
  }

  private hat(t: number, level: number): void {
    if (!this.noise) {
      const len = Math.floor(this.ac.sampleRate * 0.2);
      this.noise = this.ac.createBuffer(1, len, this.ac.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = this.ac.createBufferSource();
    src.buffer = this.noise;
    const hp = this.ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const g = this.ac.createGain();
    this.env(g, t, level, 0.003, 0.07);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.bus); // skip the lowpass so it stays airy
    src.start(t);
    src.stop(t + 0.1);
  }

  private pluck(f: number, t: number): void {
    // Marimba-ish: sine fundamental plus a quick-fading fourth harmonic.
    for (const [mult, lvl, dur] of [[1, 0.05, 0.45], [4, 0.012, 0.08]] as const) {
      const o = this.ac.createOscillator();
      const g = this.ac.createGain();
      o.type = 'sine';
      o.frequency.value = f * mult;
      this.env(g, t, lvl, 0.004, dur);
      o.connect(g);
      g.connect(this.tone);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }
}
