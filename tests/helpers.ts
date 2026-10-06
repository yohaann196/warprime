import { expect } from 'vitest';
import { newGame } from '../src/sim/worldgen';
import { choosePlayerNation, defaultSettings } from '../src/sim/setup';
import type { Difficulty, GameState } from '../src/sim/state';
import { markDirty } from '../src/sim/query';
import { invalidateMods } from '../src/sim/modifiers';

export function game(seed = 7, difficulty: Difficulty = 'realistic'): GameState {
  const { state } = newGame(defaultSettings(seed, difficulty));
  choosePlayerNation(state, { nation: 0, econSystem: 'mixed', goals: ['industry', 'trade'] });
  markDirty();
  invalidateMods();
  return state;
}

export function clone(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state));
}

/** A neighbour of nation `a` (shares a land border). */
export function landNeighbor(state: GameState, a: number): number {
  for (const p of state.provinces) {
    if (p.owner !== a) continue;
    for (const nb of p.neighbors) {
      const o = state.provinces[nb].owner;
      if (o >= 0 && o !== a && !state.provinces[nb].isSea) return o;
    }
  }
  return -1;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** World invariants that must hold after any number of days. */
export function invariants(s: GameState): void {
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
  // leaderboards: every nation has a record and the time at #1 adds up to the sampled time
  const lb = s.leaderboard;
  expect(lb.records.length).toBe(s.nations.length);
  expect(sum(lb.records.map((r) => r.daysAtTop))).toBe(lb.lastSampleDay);
  expect(lb.allTimeOrder.length).toBe(s.nations.length);
  if (lb.crown >= 0 && !s.nations[lb.crown].alive) expect(lb.records[lb.crown].diedDay).toBeGreaterThanOrEqual(lb.lastSampleDay);
  for (const n of s.nations) expect(n.history.length).toBeLessThanOrEqual(240);
  expect(s.notices.length).toBeLessThanOrEqual(40);
  // the only ending a running world can reach this early is the player's elimination
  if (s.gameOver) expect(s.gameOver.cause).toBe('eliminated');
}
