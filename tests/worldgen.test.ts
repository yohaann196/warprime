import { describe, expect, it } from 'vitest';
import { newGame } from '../src/sim/worldgen';
import { defaultSettings } from '../src/sim/setup';

describe('worldgen', () => {
  it('is deterministic for a seed', () => {
    const a = newGame(defaultSettings(1234)).state;
    const b = newGame(defaultSettings(1234)).state;
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it('differs between seeds', () => {
    const a = newGame(defaultSettings(1)).state;
    const b = newGame(defaultSettings(2)).state;
    expect(JSON.stringify(a.provinces.map((p) => p.owner))).not.toEqual(JSON.stringify(b.provinces.map((p) => p.owner)));
  });

  it('produces a playable world', () => {
    for (const seed of [1, 7, 42, 999, 31337]) {
      const { state } = newGame(defaultSettings(seed));
      const land = state.provinces.filter((p) => !p.isSea);
      expect(land.length).toBeGreaterThan(150);
      expect(state.nations.length).toBeGreaterThanOrEqual(12);
      for (const n of state.nations) expect(state.provinces[n.capital].owner).toBe(n.id);
      expect(land.every((p) => p.owner >= 0)).toBe(true);
      for (const p of state.provinces) for (const nb of p.neighbors) expect(state.provinces[nb].neighbors).toContain(p.id);
    }
  });
});
