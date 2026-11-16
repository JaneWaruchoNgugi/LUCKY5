import { describe, expect, it } from 'vitest';
import { MULTIPLIER_TABLE, multFor, mulberry32, roll } from '../src/fair';
import { fmtM, letterOf } from '../src/format';

describe('multiplier table', () => {
  it('probabilities add up to 1', () => {
    const total = MULTIPLIER_TABLE.reduce((s, [, p]) => s + p, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('returns about 98.8% to players with a 1 in 5 colour match', () => {
    const avg = MULTIPLIER_TABLE.reduce((s, [m, p]) => s + m * p, 0);
    expect(avg / 5).toBeCloseTo(0.988, 3);
  });

  it('maps the edges of [0, 1) to the smallest and largest multipliers', () => {
    expect(multFor(0)).toBe(1.55);
    expect(multFor(0.999999)).toBe(50);
  });
});

describe('roll', () => {
  it('is deterministic for the same seed pair and nonce', async () => {
    const a = await roll('server-seed', 'client-seed', 7);
    const b = await roll('server-seed', 'client-seed', 7);
    expect(a).toEqual(b);
  });

  it('changes with the nonce', async () => {
    const a = await roll('server-seed', 'client-seed', 1);
    const b = await roll('server-seed', 'client-seed', 2);
    expect(a.hash).not.toBe(b.hash);
  });

  it('gives a ball from 1 to 75 and a multiplier from the table', async () => {
    const mults = new Set(MULTIPLIER_TABLE.map(([m]) => m));
    for (let n = 0; n < 200; n++) {
      const r = await roll('s', 'c', n);
      expect(r.ball).toBeGreaterThanOrEqual(1);
      expect(r.ball).toBeLessThanOrEqual(75);
      expect(mults.has(r.mult)).toBe(true);
    }
  });

  it('spreads results roughly evenly across the five groups', async () => {
    const counts: Record<string, number> = { B: 0, I: 0, N: 0, G: 0, O: 0 };
    const n = 5000;
    for (let i = 0; i < n; i++) {
      const g = letterOf((await roll('spread-test', 'c', i)).ball);
      counts[g] = (counts[g] ?? 0) + 1;
    }
    for (const c of Object.values(counts)) {
      expect(c / n).toBeGreaterThan(0.17);
      expect(c / n).toBeLessThan(0.23);
    }
  });
});

describe('helpers', () => {
  it('maps ball numbers to groups', () => {
    expect([1, 15, 16, 30, 31, 45, 46, 60, 61, 75].map(letterOf).join('')).toBe('BBIINNGGOO');
  });

  it('formats multipliers without trailing zeros', () => {
    expect([1.55, 3.2, 5, 50].map(fmtM)).toEqual(['1.55', '3.2', '5', '50']);
  });

  it('mulberry32 is repeatable', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
