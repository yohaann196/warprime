// Pins the Random World geometry and borders so refactors cannot silently change old (v1) saves,
// which rebuild their map from the seed on load.
import { describe, expect, it } from 'vitest';
import { generateMap } from '../src/sim/worldgen/geometry';
import { newGame } from '../src/sim/worldgen';
import { defaultSettings } from '../src/sim/setup';

function fnv(h: number, v: number): number {
  h ^= v & 0xffff;
  h = Math.imul(h, 16777619);
  h ^= (v >>> 16) & 0xffff;
  return Math.imul(h, 16777619) >>> 0;
}

function geometryHash(seed: number): number {
  const m = generateMap(seed);
  let h = 2166136261;
  for (let i = 0; i < m.geo.cellProvince.length; i++) h = fnv(h, m.geo.cellProvince[i]);
  for (const p of m.provinces) {
    h = fnv(h, p.isSea ? 1 : 0);
    h = fnv(h, p.area);
    h = fnv(h, Math.round(p.center[0] * 1000));
    h = fnv(h, Math.round(p.center[1] * 1000));
    for (const nb of p.neighbors) h = fnv(h, nb);
    h = fnv(h, ['ocean', 'plains', 'forest', 'hills', 'mountains', 'desert', 'tundra', 'jungle'].indexOf(p.terrain));
  }
  return h >>> 0;
}

function ownersHash(seed: number): number {
  const { state } = newGame({ ...defaultSettings(seed), mapId: 'random' } as never);
  let h = 2166136261;
  for (const p of state.provinces) h = fnv(h, p.owner + 1);
  for (const n of state.nations) h = fnv(h, n.capital);
  return h >>> 0;
}

const PINNED: Record<number, [number, number]> = {
  1: [1048170531, 2567093626],
  7: [553789841, 1128187680],
  1234: [1421051615, 3902935027],
  4242: [3718903024, 2410159730],
};

describe('random world is frozen', () => {
  for (const seed of Object.keys(PINNED).map(Number)) {
    it(`seed ${seed} geometry and borders are unchanged`, () => {
      expect([geometryHash(seed), ownersHash(seed)]).toEqual(PINNED[seed]);
    });
  }
});
