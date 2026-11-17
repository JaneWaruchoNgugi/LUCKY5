import { randHex } from './fair';
import type { GameState } from './types';

const KEY = 'luckyfive.v2';
export const START_BALANCE = 10_000;

export function freshState(): GameState {
  return { balance: START_BALANCE, server: randHex(32), client: randHex(8), nonce: 0, history: [], bets: [], last: null };
}

export function loadState(): GameState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<GameState> | null;
    if (s && typeof s.balance === 'number' && typeof s.server === 'string' && typeof s.client === 'string') {
      return { ...freshState(), ...s, history: s.history ?? [], bets: s.bets ?? [] };
    }
  } catch {
    /* storage blocked or corrupt: start fresh */
  }
  return freshState();
}

export function saveState(s: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage blocked */
  }
}
