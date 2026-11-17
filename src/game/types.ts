/** The five colour groups. B is 1–15, I 16–30, N 31–45, G 46–60, O 61–75. */
export type Letter = 'B' | 'I' | 'N' | 'G' | 'O';

/** A ball on the rail: its number (1–75) and the multiplier it carries. */
export interface Ball {
  ball: number;
  mult: number;
}

/** The outcome of one round, derived from the seed pair and nonce. */
export interface RollResult extends Ball {
  /** Seed for the decoy balls drawn around the result. */
  seed: number;
  /** Hex HMAC-SHA256 of the round. */
  hash: string;
}

/** One past round, whether or not the player bet on it. */
export interface HistoryEntry extends Ball {
  nonce: number;
  you: boolean;
  win: boolean;
}

/** One settled bet, for the round log. */
export interface BetEntry extends Ball {
  nonce: number;
  pick: Letter;
  bet: number;
  win: boolean;
  profit: number;
}

export interface LastBall extends Ball {
  seed: number;
}

export interface GameState {
  balance: number;
  server: string;
  client: string;
  nonce: number;
  history: HistoryEntry[];
  bets: BetEntry[];
  last: LastBall | null;
}

/** A bet waiting for (or riding on) a ball. */
export interface Bet {
  bet: number;
  pick: Letter;
  auto: boolean;
}

export type Phase = 'betting' | 'sliding' | 'result';
export type Mode = 'manual' | 'auto';
