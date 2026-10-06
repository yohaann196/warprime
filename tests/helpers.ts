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
