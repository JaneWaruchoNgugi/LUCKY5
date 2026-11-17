import type { Letter } from './types';
import type { Tier } from './format';

/** Colours of the five groups. */
export const GROUP_COLOR: Record<Letter, string> = { B: '#4a5cff', I: '#ff2d6f', N: '#8a9896', G: '#1fd16a', O: '#ff9418' };

/** Number range of each group. */
export const GROUP_RANGE: Record<Letter, string> = { B: '1–15', I: '16–30', N: '31–45', G: '46–60', O: '61–75' };

/** Multiplier colours, from common to rare. */
export const TIER_COLOR: Record<Tier, string> = { t1: '#6f8f8a', t2: '#a9c4bd', t3: '#ffcf3d', t4: '#ff9f2e', t5: '#ff4fd2' };

/** Shared palette for the canvas. */
export const C = {
  rail: '#071a1b',
  muted: '#8fb3ab',
  brass: '#ffcf3d',
  win: '#3ddc84',
  miss: '#ff6b5e',
  line: '#1e4a49',
} as const;
