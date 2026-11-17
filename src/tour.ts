import { byId, prefersReducedMotion } from './dom';

export interface TourStep {
  /** Element to spotlight. */
  target: () => Element | null;
  /** Optional adjustment of the spotlight rectangle (for parts of a canvas). */
  area?: (r: Rect) => Rect;
  title: string;
  text: string;
}

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const SEEN_KEY = 'luckyfive.toured';

/** Step-by-step "How to play" overlay that spotlights parts of the page. */
export class Tour {
  private at = 0;
  private readonly root = byId('tour');
  private readonly hole = byId('tourHole');
  private readonly card = byId('tourCard');
  private readonly next = byId<HTMLButtonElement>('tourNext');
  private readonly back = byId<HTMLButtonElement>('tourBack');

  constructor(
    private readonly steps: readonly TourStep[],
    private readonly onStep: () => void = () => {},
  ) {
    this.next.addEventListener('click', () => {
      this.onStep();
      if (this.at < this.steps.length - 1) this.show(this.at + 1);
      else this.end();
    });
    this.back.addEventListener('click', () => {
      this.onStep();
      if (this.at > 0) this.show(this.at - 1);
    });
    byId('tourSkip').addEventListener('click', () => this.end());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.end();
    });
    addEventListener('resize', () => this.isOpen && this.place());
    addEventListener('scroll', () => this.isOpen && this.place(), { passive: true });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /** True if this browser has finished or skipped the tour before. */
  static seen(): boolean {
    try {
      return localStorage.getItem(SEEN_KEY) === '1';
    } catch {
      return false;
    }
  }

  start(): void {
    this.root.hidden = false;
    this.show(0);
  }

  end(): void {
    this.root.hidden = true;
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* storage blocked */
    }
    byId('soundBtn').focus({ preventScroll: true });
  }

  private show(i: number): void {
    const step = this.steps[i];
    if (!step) return;
    this.at = i;
    byId('tourStep').textContent = `Step ${i + 1} of ${this.steps.length}`;
    byId('tourTitle').textContent = step.title;
    byId('tourText').textContent = step.text;
    this.back.hidden = i === 0;
    this.next.textContent = i === this.steps.length - 1 ? 'Start playing' : 'Next';
    const el = step.target();
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.top < 70 || r.bottom > innerHeight - 220) {
        const reduced = prefersReducedMotion();
        el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
        setTimeout(() => this.place(), reduced ? 0 : 350);
      }
    }
    this.place();
    this.next.focus({ preventScroll: true });
  }

  private place(): void {
    const step = this.steps[this.at];
    const el = step?.target();
    if (!step || !el) return;
    const b = el.getBoundingClientRect();
    let r: Rect = { top: b.top, left: b.left, width: b.width, height: b.height };
    if (step.area) r = step.area(r);
    const pad = 6;
    Object.assign(this.hole.style, {
      top: `${r.top - pad}px`,
      left: `${r.left - pad}px`,
      width: `${r.width + pad * 2}px`,
      height: `${r.height + pad * 2}px`,
    });
    const cw = this.card.offsetWidth;
    const ch = this.card.offsetHeight;
    let top = r.top + r.height + 16;
    if (top + ch > innerHeight - 12) top = Math.max(12, r.top - ch - 16);
    if (top + ch > innerHeight - 12) top = innerHeight - ch - 12;
    const left = Math.min(innerWidth - cw - 16, Math.max(16, r.left + r.width / 2 - cw / 2));
    this.card.style.top = `${top}px`;
    this.card.style.left = `${left}px`;
  }
}
