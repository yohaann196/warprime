import { describe, expect, it } from 'vitest';
import { advanceDay } from '../src/sim/tick';
import { clone, game } from './helpers';
import type { Difficulty, GameState } from '../src/sim/state';

function invariants(s: GameState) {
  for (const n of s.nations) {
    expect(Number.isFinite(n.money)).toBe(true);
    expect(Number.isFinite(n.prosperity)).toBe(true);
  }
  for (const p of s.provinces) {
    if (p.isSea) continue;
    expect(Number.isFinite(p.pop)).toBe(true);
    if (p.owner >= 0) expect(s.nations[p.owner].alive).toBe(true);
  }
  for (const d of s.divisions) {
    expect(s.nations[d.owner].alive).toBe(true);
    expect(d.strength).toBeGreaterThan(0);
  }
}

describe('headless simulation', () => {
  for (const diff of ['beginner', 'realistic', 'demonic'] as Difficulty[]) {
    it(`runs 12 years on ${diff} without breaking invariants`, () => {
      const s = game(21, diff);
      for (let y = 0; y < 12 && !s.gameOver; y++) {
        for (let d = 0; d < 365; d++) advanceDay(s);
        invariants(s);
      }
      expect(s.day).toBeGreaterThan(365 * 5);
    }, 120_000);
  }

  it('is deterministic: a saved game replays identically', () => {
    const s = game(9);
    for (let d = 0; d < 400; d++) advanceDay(s);
    const a = clone(s);
    const b = clone(s);
    for (let d = 0; d < 200; d++) advanceDay(a);
    for (let d = 0; d < 200; d++) advanceDay(b);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  }, 120_000);
});
