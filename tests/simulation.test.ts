import { describe, expect, it } from 'vitest';
import { advanceDay } from '../src/sim/tick';
import { clone, game, invariants } from './helpers';
import type { Difficulty } from '../src/sim/state';

describe('headless simulation', () => {
  for (const diff of ['beginner', 'realistic', 'demonic'] as Difficulty[]) {
    it(`runs 12 years on ${diff} without breaking invariants`, () => {
      const s = game(21, diff);
      for (let y = 0; y < 12 && !s.gameOver; y++) {
        for (let d = 0; d < 365; d++) advanceDay(s);
        invariants(s);
      }
      expect(s.day).toBeGreaterThan(365 * 5);
      expect(s.leaderboard.reigns.length).toBeGreaterThan(0);
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
