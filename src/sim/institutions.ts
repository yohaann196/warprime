import { ECON_SWITCH_COOLDOWN, ECON_SYSTEMS, ECON_TRANSITION_DAYS } from '../data/econSystems';
import { INSTITUTIONS_DEF, institutionCost, MAX_INSTITUTION_LEVEL } from '../data/institutions';
import { invalidateMods, mult } from './modifiers';
import { log } from './query';
import type { EconSystemId, GameState, Institution, Nation } from './state';

export const DEV_DAYS = 160; // base days per development point

export function devDay(state: GameState, n: Nation): void {
  n.devProgress += (mult(state, n.id, 'devPoints') * (0.6 + n.stability / 125)) / DEV_DAYS;
  if (n.devProgress >= 1) {
    n.devProgress -= 1;
    n.devPoints++;
  }
}

export function raiseInstitution(state: GameState, n: Nation, inst: Institution): string | null {
  const lvl = n.institutions[inst];
  if (lvl >= MAX_INSTITUTION_LEVEL) return 'Already at maximum level';
  const cost = institutionCost(lvl);
  if (n.devPoints < cost) return `Need ${cost} development points`;
  n.devPoints -= cost;
  n.institutions[inst] = lvl + 1;
  invalidateMods();
  if (n.isPlayer) log(state, `Reform enacted: ${INSTITUTIONS_DEF[inst].reforms[lvl]} (${INSTITUTIONS_DEF[inst].name} ${lvl + 1}).`, 'good', [n.id]);
  return null;
}

export function switchEconSystem(state: GameState, n: Nation, sys: EconSystemId): string | null {
  if (!ECON_SYSTEMS[sys]) return 'Unknown system';
  if (n.econSystem === sys) return 'Already in place';
  if (n.econSwitchCooldown > 0) return `Can switch again in ${Math.ceil(n.econSwitchCooldown / 365)} years`;
  const cost = econSwitchCost(n);
  if (n.money < cost) return `Need ${cost} money`;
  n.money -= cost;
  n.econSystem = sys;
  n.econSwitchCooldown = ECON_SWITCH_COOLDOWN;
  n.transition = ECON_TRANSITION_DAYS;
  invalidateMods();
  log(state, `${n.name} adopts a ${ECON_SYSTEMS[sys].name}.`, n.isPlayer ? 'good' : 'info', [n.id]);
  return null;
}

export function econSwitchCost(n: Nation): number {
  return Math.round(400 + n.income * 120);
}
