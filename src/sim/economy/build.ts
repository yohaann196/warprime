// Construction of buildings and roads.
import { BUILDINGS, buildingCost } from '../../data/buildings';
import { mult } from '../modifiers';
import { hasTech, log, ownedProvinces } from '../query';
import type { BuildingId, GameState, Good, Nation, Province } from '../state';

export function maxConcurrentBuilds(n: Nation): number {
  return 2 + Math.floor(n.institutions.bureaucracy / 2) + Math.floor(n.institutions.industry / 3);
}

export function activeBuilds(state: GameState, n: Nation): number {
  return ownedProvinces(state, n.id).filter((pid) => state.provinces[pid].construction).length;
}

export function costOf(state: GameState, n: Nation, p: Province, b: BuildingId): number {
  const def = BUILDINGS[b];
  return Math.round(buildingCost(def, p.buildings[b] ?? 0) * mult(state, n.id, 'buildCost') * (1 + 0.4 * n.era));
}

/** Why a building cannot be built here, or null if it can. */
export function cannotBuild(state: GameState, n: Nation, p: Province, b: BuildingId): string | null {
  const def = BUILDINGS[b];
  if (p.owner !== n.id) return 'Not your province';
  if (p.controller !== n.id) return 'Province is occupied';
  if (p.construction) return 'Already constructing here';
  if ((p.buildings[b] ?? 0) >= def.maxLevel) return 'Maximum level reached';
  if (def.tech && !hasTech(state, n.id, def.tech)) return `Requires technology`;
  if (def.resource && (!p.resource || !def.resource.includes(p.resource))) return `Needs a ${def.resource.join('/')} deposit`;
  if (b === 'mine' && p.resource === 'uranium' && !hasTech(state, n.id, 'atomic_theory')) return 'Uranium needs Atomic Theory';
  if (def.terrain && !def.terrain.includes(p.terrain)) return `Wrong terrain (${p.terrain})`;
  if (def.coastal && !p.coastal) return 'Must be coastal';
  if (activeBuilds(state, n) >= maxConcurrentBuilds(n)) return `Construction slots full (${maxConcurrentBuilds(n)})`;
  const cost = costOf(state, n, p, b);
  if (n.money < cost) return `Need ${cost} money`;
  for (const [g, amt] of Object.entries(def.goods ?? {})) if (n.stock[g as Good] < (amt ?? 0)) return `Need ${amt} ${g}`;
  return null;
}

export function startBuilding(state: GameState, n: Nation, p: Province, b: BuildingId): string | null {
  const why = cannotBuild(state, n, p, b);
  if (why) return why;
  const def = BUILDINGS[b];
  n.money -= costOf(state, n, p, b);
  for (const [g, amt] of Object.entries(def.goods ?? {})) n.stock[g as Good] -= amt ?? 0;
  const level = p.buildings[b] ?? 0;
  p.construction = { building: b, progress: 0, total: Math.round(def.work * (1 + level * 0.3)) };
  return null;
}

export function cancelBuilding(n: Nation, p: Province): void {
  if (!p.construction || p.owner !== n.id) return;
  p.construction = null;
}

export function roadCost(p: Province, era = 0): number {
  return Math.round(120 * Math.pow(1.9, p.roads) * (p.terrain === 'mountains' ? 2 : p.terrain === 'hills' ? 1.4 : 1) * (1 + 0.4 * era));
}

export const MAX_ROADS = 4;

export function upgradeRoad(n: Nation, p: Province): string | null {
  if (p.owner !== n.id || p.controller !== n.id) return 'Not your province';
  if (p.roads >= MAX_ROADS) return 'Roads at maximum';
  const cost = roadCost(p, n.era);
  if (n.money < cost) return `Need ${cost} money`;
  n.money -= cost;
  p.roads++;
  return null;
}

/** Daily construction progress. */
export function constructionDay(state: GameState, n: Nation): void {
  const speed = 1 / Math.max(0.3, mult(state, n.id, 'buildCost')) ** 0.3;
  for (const pid of ownedProvinces(state, n.id)) {
    const p = state.provinces[pid];
    if (!p.construction || p.controller !== n.id) continue;
    p.construction.progress += speed;
    if (p.construction.progress >= p.construction.total) {
      const b = p.construction.building;
      p.buildings[b] = (p.buildings[b] ?? 0) + 1;
      p.construction = null;
      if (n.isPlayer) log(state, `${BUILDINGS[b].name} (lvl ${p.buildings[b]}) completed in ${p.name}.`, 'good', [n.id]);
    }
  }
}
