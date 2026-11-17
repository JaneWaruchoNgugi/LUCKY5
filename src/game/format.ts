import type { Letter } from './types';

export const LETTERS: readonly Letter[] = ['B', 'I', 'N', 'G', 'O'];

export const GROUP_NAME: Record<Letter, string> = {
  B: 'Blue',
  I: 'Red',
  N: 'Grey',
  G: 'Green',
  O: 'Orange',
};

export const isLetter = (s: string): s is Letter => (LETTERS as readonly string[]).includes(s);

/** Group letter for a ball number 1–75. */
export function letterOf(n: number): Letter {
  const i = Math.min(4, Math.max(0, Math.floor((n - 1) / 15)));
  return LETTERS[i] as Letter;
}

/** Number with fixed decimals and thousands separators, e.g. 10,000.00. */
export const fmt = (v: number, decimals = 2): string =>
  v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** Multiplier without trailing zeros: 1.55, 3.2, 5. */
export function fmtM(m: number): string {
  const cents = Math.round(m * 100);
  return fmt(m, cents % 10 ? 2 : cents % 100 ? 1 : 0);
}

/** Round to whole cents. */
export const money = (v: number): number => Math.round(v * 100) / 100;

export type Tier = 't1' | 't2' | 't3' | 't4' | 't5';

/** Visual tier of a multiplier tag. */
export const tier = (m: number): Tier => (m < 2 ? 't1' : m < 5 ? 't2' : m < 10 ? 't3' : m < 20 ? 't4' : 't5');
