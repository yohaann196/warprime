import { describe, expect, it } from 'vitest';
import { applyCommand } from '../src/sim/commands';
import { findPath } from '../src/sim/military/pathfinding';
import { combatDay } from '../src/sim/military/combat';
import { declareWar, transferProvince } from '../src/sim/diplomacy/war';
import { markDirty } from '../src/sim/query';
import { advanceDay } from '../src/sim/tick';
import { clone, game, landNeighbor } from './helpers';
import type { GameState } from '../src/sim/state';

describe('pathfinding', () => {
  it('cannot march into a neutral country but can once at war', () => {
    const s = game();
    const enemy = landNeighbor(s, s.player);
    expect(enemy).toBeGreaterThanOrEqual(0);
    const target = s.nations[enemy].capital;
    expect(findPath(s, s.player, s.nations[s.player].capital, target)).toBeNull();
    declareWar(s, s.player, enemy);
    const path = findPath(s, s.player, s.nations[s.player].capital, target);
    expect(path).not.toBeNull();
    expect(path![path!.length - 1]).toBe(target);
  });

  it('only embarks onto the sea from a port', () => {
    const s = game();
    const coastal = s.provinces.find((p) => p.owner === s.player && p.coastal)!;
    if (!coastal) return;
    const sea = coastal.neighbors.find((nb) => s.provinces[nb].isSea)!;
    coastal.buildings.port = 0;
    expect(findPath(s, s.player, coastal.id, sea)).toBeNull();
    coastal.buildings.port = 1;
    expect(findPath(s, s.player, coastal.id, sea)).toEqual([sea]);
  });
});

function battleSetup(s: GameState, enemy: number): number {
  const front = s.provinces.find((p) => p.owner === enemy && p.neighbors.some((nb) => s.provinces[nb].owner === s.player))!;
  s.divisions = [];
  for (let i = 0; i < 3; i++)
    s.divisions.push({ id: 1000 + i, owner: s.player, type: 'infantry', province: front.id, strength: 1, org: 1, xp: 0, path: [], moveProgress: 0, training: 0, stance: 'hold' });
  for (let i = 0; i < 2; i++)
    s.divisions.push({ id: 2000 + i, owner: enemy, type: 'infantry', province: front.id, strength: 1, org: 1, xp: 0, path: [], moveProgress: 0, training: 0, stance: 'hold' });
  markDirty();
  return front.id;
}

describe('combat', () => {
  it('nation size gives no bonus in battle', () => {
    const base = game(3);
    const enemy = landNeighbor(base, base.player);
    declareWar(base, base.player, enemy);
    battleSetup(base, enemy);
    const a = clone(base);
    const b = clone(base);
    // shrink the enemy in b by handing away provinces far from the front
    const theirs = b.provinces.filter((p) => p.owner === enemy && !p.isCapital && !b.divisions.some((d) => d.province === p.id));
    const third = b.nations.find((n) => n.id !== enemy && n.id !== b.player)!.id;
    markDirty();
    for (const p of theirs.slice(0, Math.floor(theirs.length / 2))) transferProvince(b, p.id, third);
    for (const s of [a, b]) {
      markDirty();
      for (let i = 0; i < 4; i++) {
        markDirty();
        combatDay(s);
      }
    }
    const str = (s: GameState) => s.divisions.map((d) => d.strength.toFixed(6)).join(',');
    expect(str(a)).toEqual(str(b));
  });

  it('battle clicks boost your side', () => {
    const base = game(3);
    const enemy = landNeighbor(base, base.player);
    declareWar(base, base.player, enemy);
    const front = battleSetup(base, enemy);
    const plain = clone(base);
    const clicked = clone(base);
    for (let i = 0; i < 15; i++) applyCommand(clicked, clicked.player, { type: 'battleClick', province: front });
    markDirty();
    combatDay(plain);
    markDirty();
    combatDay(clicked);
    const enemyStr = (s: GameState) => s.divisions.filter((d) => d.owner === enemy).reduce((t, d) => t + d.strength, 0);
    expect(enemyStr(clicked)).toBeLessThan(enemyStr(plain));
  });

  it('recruits, moves and occupies enemy land', () => {
    const s = game(5);
    const enemy = landNeighbor(s, s.player);
    const n = s.nations[s.player];
    n.money = 50000;
    n.manpower = 500;
    n.stock.munitions = 1000;
    declareWar(s, s.player, enemy);
    // remove enemy armies to test occupation in isolation
    s.divisions = s.divisions.filter((d) => d.owner !== enemy);
    markDirty();
    const target = s.provinces.find((p) => p.owner === enemy && p.neighbors.some((nb) => s.provinces[nb].owner === s.player))!;
    const ids = s.divisions.filter((d) => d.owner === s.player).map((d) => d.id);
    const r = applyCommand(s, s.player, { type: 'move', divisions: ids, target: target.id });
    expect(r.ok).toBe(true);
    for (let i = 0; i < 200 && target.controller !== s.player; i++) advanceDay(s);
    expect(target.controller).toBe(s.player);
  });
});
