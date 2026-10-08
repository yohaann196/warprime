import { describe, expect, it } from 'vitest';
import { TECHS, erasFor, techsFor } from '../src/data/techs';
import { defaultSettings } from '../src/sim/setup';
import { canResearch, eraYearOpen } from '../src/sim/tech';
import { generateMap } from '../src/sim/worldgen/geometry';
import { newGame } from '../src/sim/worldgen';
import { avatarDay } from '../src/sim/avatar';
import { mult } from '../src/sim/modifiers';
import { MAX_TRAINING, recruit } from '../src/sim/military/units';

describe('world modes', () => {
  it('preserves the random fictional world as the default', () => {
    const settings = defaultSettings(82);
    expect(settings).toMatchObject({ mapId: 'random', nationCount: 18, startYear: 1900, endYear: 3000 });
    expect(newGame(settings).state.nations).toHaveLength(18);
    expect(techsFor('random')).toEqual(TECHS);
  });

  it('creates the five named Avatar nations with distinct regional capitals', () => {
    const settings = defaultSettings(82, 'realistic', 'avatar');
    expect(settings).toMatchObject({ mapId: 'avatar', nationCount: 5, startYear: 100, endYear: 180 });
    const { state, map } = newGame(settings);
    expect(state.nations.map((nation) => nation.name)).toEqual(['Fire Nation', 'Earth Kingdom', 'Northern Water Tribe', 'Southern Water Tribe', 'Air Nomads']);
    expect(state.nations.map((nation) => nation.color)).toEqual(['#c84c39', '#5b9b54', '#4b88c2', '#70b9cf', '#e8b84a']);
    expect(new Set(state.nations.map((nation) => nation.capital)).size).toBe(5);
    expect(state.nations.every((nation) => state.provinces[nation.capital].owner === nation.id)).toBe(true);
    expect(generateMap(82, 'avatar').provinces.map((province) => province.area)).toEqual(map.provinces.map((province) => province.area));
  });

  it('uses Avatar eras and flavorful, mode-specific research without nukes', () => {
    const avatar = defaultSettings(1, 'realistic', 'avatar');
    const { state } = newGame(avatar);
    const era = erasFor('avatar');
    expect(era.map((item) => item.name)).toEqual([
      'Hundred Year War',
      'Postwar Reconstruction',
      'Metalbending Age',
      'Republic City',
      'The Korra Era',
    ]);
    expect(eraYearOpen(state, 1)).toBe(false);
    expect(eraYearOpen({ ...state, day: 4 * 365 }, 1)).toBe(true);
    expect(techsFor('avatar').find((tech) => tech.id === 'mechanization')?.name).toBe('Fire Nation Industrialization');
    expect(techsFor('random').find((tech) => tech.id === 'mechanization')?.name).toBe('Mechanization');
    expect(techsFor('avatar').some((tech) => tech.id === 'nuclear_weapons')).toBe(false);
    expect(canResearch(state, state.nations[0], TECHS.find((tech) => tech.id === 'nuclear_weapons')!)).toBeTruthy();
  });

  it('lets Korra-era research reach its late-game capstone before the Avatar world ends', () => {
    const settings = defaultSettings(9, 'realistic', 'avatar');
    const { state } = newGame(settings);
    const nation = state.nations[0];
    const capstone = techsFor('avatar').find((tech) => tech.id === 'singularity_project')!;
    nation.era = 4;
    nation.tech.researched.push('ai_research', 'fusion_power');
    state.day = (158 - settings.startYear) * 365;

    expect(canResearch(state, nation, capstone)).toBeNull();
    expect(settings.endYear).toBeGreaterThan(erasFor('avatar')[4].year);
  });

  it('gives each tribe a perk, the Air Nomads fast armies, and a roaming Avatar', () => {
    const { state } = newGame(defaultSettings(5, 'realistic', 'avatar'));
    expect(state.provinces[state.nations[4].capital].name).toBe('Western Air Temple');
    expect(mult(state, 4, 'moveSpeed')).toBeCloseTo(1.6);
    expect(mult(state, 0, 'moveSpeed')).toBe(1);
    avatarDay(state);
    expect(state.avatar!.nation).toBeGreaterThanOrEqual(0);
    const first = state.avatar!.nation;
    state.day = state.avatar!.nextDay;
    avatarDay(state);
    expect(state.avatar!.nation).not.toBe(first);
  });

  it('caps army size and training queue', () => {
    const { state } = newGame(defaultSettings(3, 'realistic', 'random'));
    const n = state.nations[0];
    n.money = 1e6;
    n.manpower = 1e6;
    let made = 0;
    while (typeof recruit(state, n, 'infantry', n.capital) !== 'string' && made < 100) made++;
    expect(made).toBe(MAX_TRAINING);
  });
});
