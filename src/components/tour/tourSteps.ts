/** One step of the How to play tour. */
export interface TourStep {
  /** CSS selector of the element to spotlight. */
  target: string;
  /** Optional trim of the spotlight, for parts of the canvas. `band` is the Previous row height. */
  area?: (r: Rect, band: number) => Rect;
  title: string;
  text: string;
}

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    target: '#rail',
    area: (r, band) => ({ ...r, top: r.top + band, height: r.height - band }),
    title: 'Balls roll on their own',
    text: 'Every few seconds a numbered ball slides in and stops under the yellow marker. Each ball carries a multiplier, shown under it.',
  },
  {
    target: '#rail',
    area: (r, band) => ({ ...r, height: band }),
    title: 'Previous balls',
    text: 'The last results sit along the top, in their group colour. Balls you bet on get a green outline for a win and red for a loss.',
  },
  {
    target: '.f-bet',
    title: 'Set your bet',
    text: 'Type an amount in KES, use − and + to adjust it, or tap a quick amount.',
  },
  {
    target: '.picks',
    title: 'Pick a colour group',
    text: 'B is blue (1–15), I red (16–30), N grey (31–45), G green (46–60) and O orange (61–75). Each has a 1 in 5 chance.',
  },
  {
    target: '#play',
    title: 'Place your bet',
    text: 'Your bet joins the next ball. If that ball is your colour, you win your bet × its multiplier. The button stays locked until that ball has landed.',
  },
  {
    target: '.tabs',
    title: 'Manual or Auto',
    text: 'Auto places the same bet for 10, 25, 50 or 100 rounds in a row. Press Stop auto at any time.',
  },
  {
    target: '#soundBtn',
    title: 'Settings',
    text: 'The gear opens settings: replay this tour, reset your demo balance, turn sound, music and the caller voice on or off, set the volume and choose which sounds you hear.',
  },
];

const SEEN_KEY = 'luckyfive.toured';

/** True if this browser has finished or skipped the tour before. */
export function tourSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markTourSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* storage blocked */
  }
}
