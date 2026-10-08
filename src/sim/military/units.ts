import { UNITS } from '../../data/units';
import { mult } from '../modifiers';
import { hasTech, markDirty } from '../query';
import type { Division, GameState, Good, Nation, UnitType } from '../state';

export function unitCost(state: GameState, n: Nation, type: UnitType): number {
  return Math.round(UNITS[type].cost * mult(state, n.id, 'unitCost') * Math.pow(1.4, n.era));
}

/** Army size limit: keeps wars readable and stops runaway troop piles. Grows with land and era. */
export function armyCap(state: GameState, n: Nation): number {
  const land = state.provinces.reduce((c, p) => c + (p.owner === n.id ? 1 : 0), 0);
  return Math.min(40, 6 + Math.round(land * 1.2) + n.era * 2);
}

export const MAX_TRAINING = 4; // divisions one nation can train at the same time

export function canRecruit(state: GameState, n: Nation, type: UnitType, province: number): string | null {
  const u = UNITS[type];
  const p = state.provinces[province];
  if (!p || p.owner !== n.id || p.controller !== n.id) return 'Must recruit in your own province';
  if (!p.isCapital && !(p.buildings.barracks ?? 0)) return 'Needs Barracks (or the capital)';
  if (u.tech && !hasTech(state, n.id, u.tech)) return 'Requires technology';
  let total = 0;
  let training = 0;
  for (const d of state.divisions) {
    if (d.owner !== n.id) continue;
    total++;
    if (d.training > 0) training++;
  }
  if (total >= armyCap(state, n)) return `Army limit reached (${armyCap(state, n)} divisions)`;
  if (training >= MAX_TRAINING) return `Only ${MAX_TRAINING} divisions can train at once`;
  if (n.manpower < u.manpower) return `Need ${u.manpower}k manpower`;
  const cost = unitCost(state, n, type);
  if (n.money < cost) return `Need ${cost} money`;
  for (const [g, amt] of Object.entries(u.goods)) if (n.stock[g as Good] < (amt ?? 0)) return `Need ${amt} ${g}`;
  return null;
}

export function recruit(state: GameState, n: Nation, type: UnitType, province: number): Division | string {
  const why = canRecruit(state, n, type, province);
  if (why) return why;
  const u = UNITS[type];
  const p = state.provinces[province];
  n.money -= unitCost(state, n, type);
  n.manpower -= u.manpower;
  for (const [g, amt] of Object.entries(u.goods)) n.stock[g as Good] -= amt ?? 0;
  const d: Division = {
    id: state.nextId++,
    owner: n.id,
    type,
    province,
    strength: 1,
    org: 0.6,
    xp: 0,
    path: [],
    moveProgress: 0,
    training: Math.round(u.training / (1 + 0.25 * (p.buildings.barracks ?? 0))),
    stance: 'hold',
  };
  state.divisions.push(d);
  markDirty();
  return d;
}

export function disband(state: GameState, n: Nation, divisionId: number): void {
  const i = state.divisions.findIndex((d) => d.id === divisionId && d.owner === n.id);
  if (i < 0) return;
  const d = state.divisions[i];
  n.manpower += UNITS[d.type].manpower * d.strength * 0.8;
  state.divisions.splice(i, 1);
  markDirty();
}

export function militaryStrength(state: GameState, nation: number): number {
  let s = 0;
  const n = state.nations[nation];
  for (const d of state.divisions) {
    if (d.owner !== nation) continue;
    const u = UNITS[d.type];
    s += (u.attack + u.defense) * d.strength * (0.5 + 0.5 * d.org) * (1 + 0.25 * n.era);
  }
  return s * mult(state, nation, 'attack');
}
