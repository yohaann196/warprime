import { describe, expect, it } from 'vitest';
import { climateDay } from '../src/sim/climate';
import { defaultSettings } from '../src/sim/setup';
import { newGame } from '../src/sim/worldgen';

describe('climate', () => {
  it('exists in the random world, emits from industry and is scrubbed by clean energy', () => {
    const { state } = newGame(defaultSettings(4));
    expect(state.climate).toEqual({ damage: 0 });
    const n = state.nations[0];
    const p = state.provinces[n.capital];
    p.buildings.steel_mill = 100;
    climateDay(state);
    const before = n.emissions!;
    expect(before).toBeGreaterThan(0);
    expect(state.climate!.damage).toBeGreaterThan(0);
    p.buildings.green_plant = 5;
    climateDay(state);
    expect(n.abated).toBeGreaterThan(0);
    expect(n.abated).toBeLessThanOrEqual(n.emissions!);
  });

  it('is absent in the Avatar world and scores without a climate category', () => {
    const { state } = newGame(defaultSettings(4, 'realistic', 'avatar'));
    expect(state.climate).toBeUndefined();
    climateDay(state);
    expect(state.nations[0].prosperityParts.climate).toBeUndefined();
  });
});
