// Nuclear weapons and sabotage. Nukes are devastating — and the whole world will remember.
import { NUKE_COST } from '../../data/units';
import { DIFFICULTY } from '../difficulty';
import { addOpinion, opinion, worldOpinion } from '../diplomacy/relations';
import { declareWar, joinWar } from '../diplomacy/war';
import { atWar, hasTech, isFriendly, log, markDirty, ownedProvinces, warBetween } from '../query';
import { rand } from '../rng';
import type { BuildingId, GameState } from '../state';

export function canBuildNuke(state: GameState, nation: number): string | null {
  const n = state.nations[nation];
  if (!hasTech(state, nation, 'nuclear_weapons')) return 'Requires Nuclear Weapons technology';
  if (n.nukeProgress >= 0) return 'A warhead is already being built';
  if (n.money < NUKE_COST.money) return `Need ${NUKE_COST.money} money`;
  if (n.stock.uranium < NUKE_COST.uranium) return `Need ${NUKE_COST.uranium} uranium`;
  return null;
}

export function startNuke(state: GameState, nation: number): string | null {
  const why = canBuildNuke(state, nation);
  if (why) return why;
  const n = state.nations[nation];
  n.money -= NUKE_COST.money;
  n.stock.uranium -= NUKE_COST.uranium;
  n.nukeProgress = 0;
  return null;
}

export function nukeProgramDay(state: GameState, nation: number): void {
  const n = state.nations[nation];
  if (n.nukeProgress < 0) return;
  n.nukeProgress += 1 / NUKE_COST.days;
  if (n.nukeProgress >= 1) {
    n.nukeProgress = -1;
    n.nukes++;
    log(state, `${n.name} has completed a nuclear warhead.`, n.isPlayer ? 'info' : 'diplo', [nation]);
    if (n.nukes === 1) worldOpinion(state, nation, -5, 'Nuclear arsenal', 0.002);
  }
}

export function canLaunchNuke(state: GameState, nation: number, province: number): string | null {
  const n = state.nations[nation];
  const p = state.provinces[province];
  if (n.nukes <= 0) return 'No warheads';
  if (!p || p.isSea) return 'Invalid target';
  if (!atWar(state, nation, p.owner) && !atWar(state, nation, p.controller)) return 'You can only strike a nation you are at war with';
  return null;
}

export interface NukeResult {
  intercepted: boolean;
  deaths: number;
}

export function launchNuke(state: GameState, nation: number, province: number, retaliation = false): NukeResult | string {
  const why = canLaunchNuke(state, nation, province);
  if (why) return why;
  const n = state.nations[nation];
  const p = state.provinces[province];
  const victim = p.owner;
  n.nukes--;

  const intercepted = hasTech(state, victim, 'missile_shield') && rand(state) < 0.6;
  let deaths = 0;
  if (!intercepted) {
    deaths = p.pop * 0.55;
    p.pop -= deaths;
    for (const b of Object.keys(p.buildings) as BuildingId[]) p.buildings[b] = Math.floor((p.buildings[b] ?? 0) / 2);
    p.devastation = 1;
    p.fallout = 3650;
    p.construction = null;
    for (const nb of p.neighbors) {
      const q = state.provinces[nb];
      if (q.isSea) continue;
      q.devastation = Math.min(1, q.devastation + 0.35);
      q.pop *= 0.93;
    }
    state.divisions = state.divisions.filter((d) => {
      if (d.province !== province) return true;
      d.strength *= 0.2;
      d.org = 0;
      return d.strength > 0.06;
    });
    markDirty();
  }

  // --- the price ---
  const scale = intercepted ? 0.5 : 1;
  n.trust = Math.max(0, n.trust - 50 * scale);
  n.stability = Math.max(0, n.stability - 15 * scale);
  n.happiness = Math.max(0, n.happiness - 10 * scale);
  n.warExhaustion = Math.min(100, n.warExhaustion + 10);
  worldOpinion(state, nation, -60 * scale, 'Used nuclear weapons', 0.006, [victim]);
  addOpinion(state, victim, nation, -100, 'Nuked our people', 0.002);
  log(
    state,
    intercepted
      ? `☢ ${n.name} launched a nuclear missile at ${p.name} — it was INTERCEPTED. The world is outraged.`
      : `☢ ${n.name} detonated a nuclear weapon over ${p.name}, killing ${Math.round(deaths)}k people. The world will not forget.`,
    'bad',
    [nation, victim],
  );

  if (retaliation) return { intercepted, deaths };

  // --- second strike ---
  const diff = DIFFICULTY[state.settings.difficulty];
  const responders = [victim, ...state.nations.filter((x) => x.alive && x.id !== victim && isFriendly(state, x.id, victim)).map((x) => x.id)];
  for (const r of responders) {
    const R = state.nations[r];
    if (R.isPlayer || R.nukes <= 0 || !atWar(state, r, nation)) continue;
    if (rand(state) < diff.aiRetaliation) {
      const targets = ownedProvinces(state, nation).sort((a, b) => state.provinces[b].pop - state.provinces[a].pop);
      if (targets.length) launchNuke(state, r, targets[0], true);
      break;
    }
  }

  // --- coalition ---
  const war = warBetween(state, nation, victim);
  for (const other of state.nations) {
    if (!other.alive || other.id === nation || other.id === victim || other.isPlayer) continue;
    if (atWar(state, other.id, nation) || isFriendly(state, other.id, nation)) continue;
    if (opinion(state, other.id, nation) > -50) continue;
    const chance = (0.15 + other.personality.aggression * 0.3) * diff.aiAggression;
    if (rand(state) < chance) {
      if (war && war.defenders.includes(victim)) joinWar(state, war, other.id, 'defenders');
      else if (war && war.attackers.includes(victim)) joinWar(state, war, other.id, 'attackers');
      else declareWar(state, other.id, nation);
      log(state, `${other.name} joins the coalition against ${n.name}'s nuclear aggression!`, 'war', [other.id, nation]);
    }
  }
  return { intercepted, deaths };
}

export const SABOTAGE_COST = 300;

export function canSabotage(state: GameState, nation: number, province: number): string | null {
  const n = state.nations[nation];
  const p = state.provinces[province];
  if (!p || p.isSea || p.owner < 0 || p.owner === nation) return 'Pick a foreign province';
  if (isFriendly(state, nation, p.owner)) return 'Cannot sabotage friends';
  if (n.sabotageCooldown > 0) return `Agents regrouping (${n.sabotageCooldown} days)`;
  const cost = SABOTAGE_COST * (1 + n.era * 0.5);
  if (n.money < cost) return `Need ${Math.round(cost)} money`;
  if (!Object.values(p.buildings).some((v) => (v ?? 0) > 0)) return 'Nothing worth sabotaging there';
  return null;
}

export function sabotage(state: GameState, nation: number, province: number): string {
  const why = canSabotage(state, nation, province);
  if (why) return why;
  const n = state.nations[nation];
  const p = state.provinces[province];
  n.money -= SABOTAGE_COST * (1 + n.era * 0.5);
  n.sabotageCooldown = 180;
  const success = rand(state) < 0.45 + n.institutions.diplomacy * 0.03;
  const caught = rand(state) < 0.4 - n.institutions.diplomacy * 0.02;
  let result = 'Our agents failed.';
  if (success) {
    const built = (Object.keys(p.buildings) as BuildingId[]).filter((b) => (p.buildings[b] ?? 0) > 0);
    const b = built[Math.floor(rand(state) * built.length)];
    p.buildings[b] = (p.buildings[b] ?? 1) - 1;
    p.devastation = Math.min(1, p.devastation + 0.15);
    result = `Sabotage succeeded: a ${b.replace('_', ' ')} in ${p.name} was destroyed.`;
  }
  if (caught) {
    addOpinion(state, p.owner, nation, -30, 'Caught sabotaging us', 0.02);
    n.trust = Math.max(0, n.trust - 5);
    result += ' Our agents were caught!';
    log(state, `${state.nations[p.owner].name} caught ${n.name} agents sabotaging ${p.name}.`, 'diplo', [nation, p.owner]);
  }
  return result;
}

