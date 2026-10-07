import { erasFor, techsFor, TECH_BY_ID, techCost, TECHS_TO_ADVANCE_ERA, type TechDef } from '../data/techs';
import { log } from './query';
import { yearOf, type GameState, type Nation } from './state';
import { invalidateMods } from './modifiers';

export function eraYearOpen(state: GameState, era: number): boolean {
  const year = erasFor(state.settings.mapId)[era]?.year;
  return year !== undefined && yearOf(state) >= year - 8;
}

export function techFor(state: GameState, id: string): TechDef | undefined {
  return techsFor(state.settings.mapId).find((tech) => tech.id === id);
}

export function canResearch(state: GameState, n: Nation, t: TechDef): string | null {
  const worldTech = techFor(state, t.id);
  if (!worldTech) return 'Not available in this world';
  t = worldTech;
  if (n.tech.researched.includes(t.id)) return 'Already researched';
  const eras = erasFor(state.settings.mapId);
  if (t.era > n.era) return `Requires the ${eras[t.era].name}`;
  if (!eraYearOpen(state, t.era)) return `Available from ${eras[t.era].year - 8}`;
  if (t.minYear && yearOf(state) < t.minYear) return `Available from ${t.minYear}`;
  for (const r of t.requires ?? []) if (!n.tech.researched.includes(r)) return `Requires ${techFor(state, r)?.name ?? TECH_BY_ID[r]?.name ?? r}`;
  return null;
}

export function availableTechs(state: GameState, n: Nation): TechDef[] {
  return techsFor(state.settings.mapId).filter((t) => canResearch(state, n, t) === null);
}

export function setResearch(state: GameState, n: Nation, id: string): string | null {
  const t = techFor(state, id);
  if (!t) return 'Unknown technology';
  const why = canResearch(state, n, t);
  if (why) return why;
  if (n.tech.current !== id) {
    n.tech.current = id;
    n.tech.progress = 0;
  }
  return null;
}

export function researchDay(state: GameState, n: Nation): void {
  if (!n.tech.current) return;
  const t = techFor(state, n.tech.current);
  if (!t) return;
  const cap = t.minDays ? techCost(t) / t.minDays : Infinity;
  n.tech.progress += Math.min(n.research, cap);
  checkResearchDone(state, n);
}

export function checkResearchDone(state: GameState, n: Nation): void {
  const id = n.tech.current;
  if (!id) return;
  const t = techFor(state, id);
  if (!t || n.tech.progress < techCost(t)) return;
  n.tech.researched.push(id);
  n.tech.current = null;
  n.tech.progress = 0;
  invalidateMods();
  if (n.isPlayer) log(state, `Researched ${t.name}.`, 'good', [n.id]);
  updateEra(state, n);
}

export function updateEra(state: GameState, n: Nation): void {
  const eras = erasFor(state.settings.mapId);
  while (n.era < eras.length - 1) {
    const done = n.tech.researched.filter((id) => (techFor(state, id)?.era ?? -1) === n.era).length;
    if (done >= TECHS_TO_ADVANCE_ERA && eraYearOpen(state, n.era + 1)) {
      n.era++;
      invalidateMods();
      log(state, `${n.name} enters the ${eras[n.era].name}!`, n.isPlayer ? 'good' : 'info', [n.id]);
    } else break;
  }
}
