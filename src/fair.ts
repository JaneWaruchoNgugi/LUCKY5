import type { Ball, RollResult } from './types';

const enc = new TextEncoder();

export const toHex = (bytes: ArrayBuffer | Uint8Array): string =>
  Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), (x) => x.toString(16).padStart(2, '0')).join('');

export const randHex = (byteCount: number): string => toHex(crypto.getRandomValues(new Uint8Array(byteCount)));

export async function sha256Hex(s: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

async function hmac(key: string, msg: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}

/**
 * Multiplier carried by a ball, with its probability.
 * Average is 4.94x; with a 1 in 5 colour match the game returns 98.8%.
 */
export const MULTIPLIER_TABLE: ReadonlyArray<readonly [mult: number, chance: number]> = [
  [1.55, 0.4],
  [3.2, 0.25],
  [5, 0.15],
  [8, 0.1],
  [12, 0.06],
  [25, 0.03],
  [50, 0.01],
];

export const MAX_MULTIPLIER = Math.max(...MULTIPLIER_TABLE.map(([m]) => m));

/** Map a uniform number u in [0, 1) to a multiplier from the table. */
export function multFor(u: number): number {
  let acc = 0;
  for (const [m, p] of MULTIPLIER_TABLE) {
    acc += p;
    if (u < acc) return m;
  }
  return MAX_MULTIPLIER;
}

/**
 * Result of a round: HMAC-SHA256(serverSeed, "clientSeed:nonce").
 * Bytes 0–3 pick the multiplier, bytes 4–5 the ball number, bytes 6–9 seed the decoy balls.
 */
export async function roll(server: string, client: string, nonce: number): Promise<RollResult> {
  const h = await hmac(server, `${client}:${nonce}`);
  const b = (i: number): number => h[i] ?? 0;
  const u = (b(0) * 16777216 + b(1) * 65536 + b(2) * 256 + b(3)) / 4294967296;
  const ball = ((b(4) << 8) | b(5)) % 75 + 1;
  const seed = ((b(6) << 24) | (b(7) << 16) | (b(8) << 8) | b(9)) >>> 0;
  return { mult: multFor(u), ball, seed, hash: toHex(h) };
}

/** Small deterministic PRNG, so the strip of balls around a result is reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A filler ball for the rail. */
export const decoy = (r: () => number): Ball => {
  const mult = multFor(r());
  return { mult, ball: Math.floor(r() * 75) + 1 };
};
