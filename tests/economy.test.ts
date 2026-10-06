import { describe, expect, it } from 'vitest';
import { applyCommand } from '../src/sim/commands';
import { advanceDay } from '../src/sim/tick';
import { heatEfficiency } from '../src/sim/clicks';
import { game } from './helpers';

describe('clicking', () => {
  it('work clicks give money and suffer diminishing returns when spammed', () => {
    const s = game();
    const n = s.nations[s.player];
    const before = n.money;
    const r1 = applyCommand(s, s.player, { type: 'workClick', province: n.capital });
    expect(r1.ok).toBe(true);
    expect(n.money).toBeGreaterThan(before);
    for (let i = 0; i < 60; i++) applyCommand(s, s.player, { type: 'workClick', province: n.capital });
    expect(heatEfficiency(n)).toBeLessThan(0.6);
    // heat cools as days pass
    for (let i = 0; i < 40; i++) advanceDay(s);
    expect(heatEfficiency(n)).toBeGreaterThan(0.95);
  });

  it('cannot work foreign provinces', () => {
    const s = game();
    const foreign = s.provinces.find((p) => !p.isSea && p.owner !== s.player)!;
    expect(applyCommand(s, s.player, { type: 'workClick', province: foreign.id }).ok).toBe(false);
  });

  it('click upgrades raise click power', () => {
    const s = game();
    const n = s.nations[s.player];
    n.money = 10000;
    const p0 = n.clicks.power;
    expect(applyCommand(s, s.player, { type: 'buyClickUpgrade' }).ok).toBe(true);
    expect(n.clicks.power).toBeGreaterThan(p0);
  });
});

describe('construction', () => {
  it('builds a farm over time and clicks speed it up', () => {
    const s = game();
    const n = s.nations[s.player];
    n.money = 5000;
    const p = s.provinces.find((q) => q.owner === s.player && ['plains', 'forest', 'hills', 'jungle'].includes(q.terrain))!;
    const lvl = p.buildings.farm ?? 0;
    const r = applyCommand(s, s.player, { type: 'build', province: p.id, building: 'farm' });
    expect(r.ok).toBe(true);
    expect(n.money).toBeLessThan(5000);
    const total = p.construction!.total;
    applyCommand(s, s.player, { type: 'buildClick', province: p.id });
    expect(p.construction!.progress).toBeGreaterThan(0);
    for (let i = 0; i < total + 5; i++) advanceDay(s);
    expect(p.buildings.farm).toBe(lvl + 1);
    expect(p.construction).toBeNull();
  });

  it('refuses buildings that need a technology or resource', () => {
    const s = game();
    const p = s.provinces.find((q) => q.owner === s.player)!;
    s.nations[s.player].money = 99999;
    expect(applyCommand(s, s.player, { type: 'build', province: p.id, building: 'vehicle_plant' }).ok).toBe(false);
    const noOil = s.provinces.find((q) => q.owner === s.player && q.resource !== 'oil')!;
    expect(applyCommand(s, s.player, { type: 'build', province: noOil.id, building: 'oil_well' }).ok).toBe(false);
  });
});

describe('economy', () => {
  it('stays finite and produces positive GDP over a few years', () => {
    const s = game(11);
    for (let i = 0; i < 365 * 3; i++) advanceDay(s);
    for (const n of s.nations) {
      if (!n.alive) continue;
      expect(Number.isFinite(n.money)).toBe(true);
      expect(Number.isFinite(n.gdp)).toBe(true);
      expect(n.gdp).toBeGreaterThanOrEqual(0);
      for (const v of Object.values(n.stock)) expect(v).toBeGreaterThanOrEqual(0);
    }
    const alive = s.nations.filter((n) => n.alive);
    expect(alive.filter((n) => n.gdp > 0).length).toBeGreaterThan(alive.length * 0.7);
    for (const v of Object.values(s.prices)) expect(v).toBeGreaterThan(0);
  });

  it('economic systems change modifiers and switching has a cost', () => {
    const s = game();
    const n = s.nations[s.player];
    n.money = 100000;
    expect(applyCommand(s, s.player, { type: 'switchEcon', system: 'planned' }).ok).toBe(true);
    expect(n.econSystem).toBe('planned');
    expect(n.transition).toBeGreaterThan(0);
    // cooldown prevents flip-flopping
    expect(applyCommand(s, s.player, { type: 'switchEcon', system: 'free_market' }).ok).toBe(false);
  });
});
