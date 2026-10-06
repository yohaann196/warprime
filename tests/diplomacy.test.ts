import { describe, expect, it } from 'vitest';
import { applyCommand } from '../src/sim/commands';
import { opinion } from '../src/sim/diplomacy/relations';
import { declareWar, makePeace } from '../src/sim/diplomacy/war';
import { applyTreaty } from '../src/sim/diplomacy/pacts';
import { launchNuke } from '../src/sim/military/nukes';
import { findPact, markDirty } from '../src/sim/query';
import { computeProsperity, ranking } from '../src/sim/prosperity';
import { game, landNeighbor } from './helpers';

describe('alliances and betrayal', () => {
  it('declaring war on an ally is a betrayal the world remembers', () => {
    const s = game();
    const ally = landNeighbor(s, s.player);
    applyTreaty(s, s.player, ally, [{ k: 'alliance' }]);
    expect(findPact(s, 'alliance', s.player, ally)).toBeTruthy();
    const trust0 = s.nations[s.player].trust;
    const bystander = s.nations.find((n) => n.id !== s.player && n.id !== ally)!.id;
    const op0 = opinion(s, bystander, s.player);
    const r = applyCommand(s, s.player, { type: 'declareWar', target: ally });
    expect(r.ok).toBe(true);
    expect(findPact(s, 'alliance', s.player, ally)).toBeFalsy();
    expect(s.nations[s.player].trust).toBeLessThanOrEqual(trust0 - 30);
    expect(opinion(s, bystander, s.player)).toBeLessThan(op0 - 10);
    expect(opinion(s, ally, s.player)).toBeLessThan(-50);
  });

  it('a peaceful alliance exit costs much less than betrayal', () => {
    const s = game();
    const ally = landNeighbor(s, s.player);
    applyTreaty(s, s.player, ally, [{ k: 'alliance' }]);
    const pact = findPact(s, 'alliance', s.player, ally)!;
    const trust0 = s.nations[s.player].trust;
    applyCommand(s, s.player, { type: 'breakPact', pact: pact.id });
    expect(s.nations[s.player].trust).toBeGreaterThan(trust0 - 10);
  });
});

describe('peace', () => {
  it('ceding occupied provinces transfers ownership and leaves a truce', () => {
    const s = game();
    const enemy = landNeighbor(s, s.player);
    const war = declareWar(s, s.player, enemy);
    if (typeof war === 'string') throw new Error(war);
    const prov = s.provinces.find((p) => p.owner === enemy && !p.isCapital)!;
    prov.controller = s.player;
    markDirty();
    makePeace(s, war, 'attackers', { cede: [prov.id], money: 0, puppet: false, annex: false });
    expect(prov.owner).toBe(s.player);
    expect(s.wars.length).toBe(0);
    expect(findPact(s, 'truce', s.player, enemy)).toBeTruthy();
  });
});

describe('nukes', () => {
  it('devastate the target and crash the launcher\'s standing with everyone', () => {
    const s = game();
    const enemy = landNeighbor(s, s.player);
    declareWar(s, s.player, enemy);
    s.nations[s.player].nukes = 1;
    const target = s.nations[enemy].capital;
    const pop0 = s.provinces[target].pop;
    const bystanders = s.nations.filter((n) => n.id !== s.player && n.id !== enemy).map((n) => n.id);
    const before = bystanders.map((b) => opinion(s, b, s.player));
    const r = launchNuke(s, s.player, target);
    expect(typeof r).not.toBe('string');
    expect(s.provinces[target].pop).toBeLessThan(pop0 * 0.6);
    expect(s.provinces[target].fallout).toBeGreaterThan(0);
    bystanders.forEach((b, i) => expect(opinion(s, b, s.player)).toBeLessThanOrEqual(before[i] - 40));
    expect(s.nations[s.player].trust).toBeLessThan(30);
  });

  it('cannot be launched at a nation you are at peace with', () => {
    const s = game();
    const other = landNeighbor(s, s.player);
    s.nations[s.player].nukes = 1;
    expect(applyCommand(s, s.player, { type: 'launchNuke', province: s.nations[other].capital }).ok).toBe(false);
  });
});

describe('treaties', () => {
  it('AI rejects lopsided demands and accepts gifts', () => {
    const s = game();
    const other = landNeighbor(s, s.player);
    s.nations[s.player].money = 100000;
    s.nations[other].money = 100000;
    const greedy = applyCommand(s, s.player, { type: 'proposeTreaty', target: other, clauses: [{ k: 'ask_money', amount: 50000 }] });
    expect(greedy.ok).toBe(false);
    const gift = applyCommand(s, s.player, { type: 'proposeTreaty', target: other, clauses: [{ k: 'give_money', amount: 5000 }] });
    expect(gift.ok).toBe(true);
  });
});

describe('prosperity', () => {
  it('ranks every living nation with a bounded score', () => {
    const s = game();
    computeProsperity(s);
    const r = ranking(s);
    expect(r.length).toBe(s.nations.filter((n) => n.alive).length);
    for (let i = 1; i < r.length; i++) expect(r[i - 1].prosperity).toBeGreaterThanOrEqual(r[i].prosperity);
    for (const x of r) {
      expect(x.prosperity).toBeGreaterThan(0);
      expect(x.prosperity).toBeLessThanOrEqual(100);
    }
  });
});

describe('aggressive expansion', () => {
  it('taking land worsens everyone else\'s opinion of the conqueror', () => {
    const s = game();
    const enemy = landNeighbor(s, s.player);
    const war = declareWar(s, s.player, enemy);
    if (typeof war === 'string') throw new Error(war);
    const provs = s.provinces.filter((p) => p.owner === enemy && !p.isCapital).slice(0, 3);
    for (const p of provs) p.controller = s.player;
    markDirty();
    const bystander = s.nations.find((n) => n.id !== s.player && n.id !== enemy && !war.attackers.includes(n.id) && !war.defenders.includes(n.id))!.id;
    const before = opinion(s, bystander, s.player);
    makePeace(s, war, 'attackers', { cede: provs.map((p) => p.id), money: 0, puppet: false, annex: false });
    expect(opinion(s, bystander, s.player)).toBeLessThan(before - 5);
  });
});
