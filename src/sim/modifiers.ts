import { ECON_SYSTEMS } from '../data/econSystems';
import { DOCTRINES, doctrineKey, INSTITUTIONS_DEF } from '../data/institutions';
import type { ModKey, Mods } from '../data/modifiers';
import { TECH_BY_ID, techsFor } from '../data/techs';
import { DIFFICULTY } from './difficulty';
import { INSTITUTIONS, type GameState } from './state';

export interface ModSource {
  source: string;
  mods: Mods;
}

/** Every source of modifiers for a nation, for tooltips and for the summed totals. */
export function modSources(state: GameState, nationId: number): ModSource[] {
  const n = state.nations[nationId];
  const out: ModSource[] = [];
  out.push({ source: `Economic system: ${ECON_SYSTEMS[n.econSystem].name}`, mods: ECON_SYSTEMS[n.econSystem].mods });
  if (n.transition > 0) out.push({ source: 'Economic transition', mods: { stability: -15, tax: -0.1, factory: -0.1 } });

  for (const inst of INSTITUTIONS) {
    const lvl = n.institutions[inst];
    if (!lvl) continue;
    const def = INSTITUTIONS_DEF[inst];
    const goalMult = n.goals.includes(inst) ? 1.5 : 1;
    const m: Mods = {};
    for (const k of Object.keys(def.perLevel) as ModKey[]) m[k] = def.perLevel[k]! * lvl * goalMult;
    out.push({ source: `${def.name} institution (lvl ${lvl})`, mods: m });
  }
  const doc = DOCTRINES[doctrineKey(n.goals[0], n.goals[1])];
  if (doc) out.push({ source: `Doctrine: ${doc.name}`, mods: doc.mods });

  const techMods: Mods = {};
  for (const id of n.tech.researched) {
    const t = techsFor(state.settings.mapId).find((tech) => tech.id === id) ?? TECH_BY_ID[id];
    if (!t?.mods) continue;
    for (const k of Object.keys(t.mods) as ModKey[]) techMods[k] = (techMods[k] ?? 0) + t.mods[k]!;
  }
  if (Object.keys(techMods).length) out.push({ source: 'Technology', mods: techMods });

  const diff = DIFFICULTY[state.settings.difficulty];
  if (n.isPlayer) {
    const m: Mods = {};
    if (diff.playerClick) m.clickPower = diff.playerClick;
    if (diff.playerResearch) m.research = diff.playerResearch;
    if (Object.keys(m).length) out.push({ source: `Difficulty: ${diff.name}`, mods: m });
  } else if (diff.aiEconomy) {
    const v = diff.aiEconomy;
    out.push({ source: `Difficulty: ${diff.name}`, mods: { factory: v, raw: v, food: v * 0.5, services: v, research: v } });
  }

  if (n.warExhaustion > 0) out.push({ source: 'War exhaustion', mods: { stability: -n.warExhaustion * 0.25, happiness: -n.warExhaustion * 0.2 } });
  if (n.debt > 0) {
    const ratio = n.debt / Math.max(50, n.income * 180);
    out.push({ source: 'National debt', mods: { stability: -Math.min(20, ratio * 10) } });
  }

  for (const t of n.tempMods) out.push({ source: t.reason, mods: { [t.key]: t.value } as Mods });
  return out;
}

const cache = new Map<number, { state: GameState; day: number; stamp: number; mods: Mods }>();
let stamp = 0;

export function invalidateMods(): void {
  stamp++;
}

export function allMods(state: GameState, nationId: number): Mods {
  const c = cache.get(nationId);
  if (c && c.state === state && c.day === state.day && c.stamp === stamp) return c.mods;
  const sum: Mods = {};
  for (const s of modSources(state, nationId))
    for (const k of Object.keys(s.mods) as ModKey[]) sum[k] = (sum[k] ?? 0) + s.mods[k]!;
  cache.set(nationId, { state, day: state.day, stamp, mods: sum });
  return sum;
}

/** Summed modifier value (fraction for multiplicative keys, points for additive keys). */
export function mod(state: GameState, nationId: number, key: ModKey): number {
  return allMods(state, nationId)[key] ?? 0;
}

/** 1 + modifier, floored so penalties can never zero things out. */
export function mult(state: GameState, nationId: number, key: ModKey): number {
  return Math.max(0.1, 1 + mod(state, nationId, key));
}

export function breakdown(state: GameState, nationId: number, key: ModKey): { source: string; value: number }[] {
  return modSources(state, nationId)
    .filter((s) => s.mods[key] !== undefined && s.mods[key] !== 0)
    .map((s) => ({ source: s.source, value: s.mods[key]! }));
}
