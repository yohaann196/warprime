import { ERAS, TECHS, TECH_BY_ID, techCost, TECHS_TO_ADVANCE_ERA, type TechDef } from '../data/techs';
import { log } from './query';
import { yearOf, type GameState, type Nation } from './state';
import { invalidateMods } from './modifiers';

export function eraYearOpen(state: GameState, era: number): boolean {
  return yearOf(state) >= ERAS[era].year - 8;
}

export function canResearch(state: GameState, n: Nation, t: TechDef): string | null {
  if (n.tech.researched.includes(t.id)) return 'Already researched';
  if (t.era > n.era) return `Requires the ${ERAS[t.era].name}`;
  if (!eraYearOpen(state, t.era)) return `Available from ${ERAS[t.era].year - 8}`;
  for (const r of t.requires ?? []) if (!n.tech.researched.includes(r)) return `Requires ${TECH_BY_ID[r].name}`;
  return null;
}

export function availableTechs(state: GameState, n: Nation): TechDef[] {
  return TECHS.filter((t) => canResearch(state, n, t) === null);
}

export function setResearch(state: GameState, n: Nation, id: string): string | null {
  const t = TECH_BY_ID[id];
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
  n.tech.progress += n.research;
  checkResearchDone(state, n);
}

export function checkResearchDone(state: GameState, n: Nation): void {
  const id = n.tech.current;
  if (!id) return;
  const t = TECH_BY_ID[id];
  if (n.tech.progress < techCost(t)) return;
  n.tech.researched.push(id);
  n.tech.current = null;
  n.tech.progress = 0;
  invalidateMods();
  if (n.isPlayer) log(state, `Researched ${t.name}.`, 'good', [n.id]);
  updateEra(state, n);
}

export function updateEra(state: GameState, n: Nation): void {
  while (n.era < ERAS.length - 1) {
    const done = n.tech.researched.filter((id) => TECH_BY_ID[id].era === n.era).length;
    if (done >= TECHS_TO_ADVANCE_ERA && eraYearOpen(state, n.era + 1)) {
      n.era++;
      invalidateMods();
      log(state, `${n.name} enters the ${ERAS[n.era].name}!`, n.isPlayer ? 'good' : 'info', [n.id]);
    } else break;
  }
}
