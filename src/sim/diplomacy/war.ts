// Declaring, joining and ending wars; war score; peace deals; capitulation and annexation.
import { mod } from '../modifiers';
import {
  alliesOf,
  atWar,
  enemiesIn,
  findPact,
  isFriendly,
  log,
  markDirty,
  overlordOf,
  ownedProvinces,
  provinceValue,
  puppetsOf,
  sideOf,
  removePact,
  warsOf,
} from '../query';
import { rand } from '../rng';
import type { GameState, War } from '../state';
import { addOpinion, opinion, worldOpinion } from './relations';
import { breakPact } from './pacts';

export type WarSide = 'attackers' | 'defenders';

export interface PeaceTerms {
  cede: number[]; // provinces handed to the receiving side
  money: number;
  puppet: boolean;
  annex: boolean;
}

export const WHITE_PEACE: PeaceTerms = { cede: [], money: 0, puppet: false, annex: false };

export function canDeclareWar(state: GameState, attacker: number, target: number): string | null {
  if (attacker === target) return 'Cannot declare war on yourself';
  const A = state.nations[attacker];
  const T = state.nations[target];
  if (!A.alive || !T.alive) return 'Nation no longer exists';
  if (atWar(state, attacker, target)) return 'Already at war';
  if (overlordOf(state, attacker) >= 0) return 'Puppets cannot declare wars';
  if (findPact(state, 'puppet', attacker, target)) return 'That is your puppet — release or annex it instead';
  if (findPact(state, 'puppet', target, attacker)) return 'Cannot attack your overlord (wait for independence)';
  return null;
}

export function declareWar(state: GameState, attacker: number, target: number): War | string {
  const why = canDeclareWar(state, attacker, target);
  if (why) return why;
  const A = state.nations[attacker];
  const T = state.nations[target];

  const alliance = findPact(state, 'alliance', attacker, target);
  if (alliance) breakPact(state, attacker, alliance, true);
  const truce = findPact(state, 'truce', attacker, target);
  if (truce) {
    removePact(state, truce);
    A.trust = Math.max(0, A.trust - 15);
    worldOpinion(state, attacker, -8, 'Broke a truce', 0.01);
  }
  const nap = findPact(state, 'nap', attacker, target);
  if (nap) {
    removePact(state, nap);
    A.trust = Math.max(0, A.trust - 20);
    worldOpinion(state, attacker, -10, 'Broke a non-aggression pact', 0.01);
    log(state, `${A.name} tore up its non-aggression pact with ${T.name}!`, 'diplo', [attacker, target]);
  }
  // trade and access with the enemy end immediately
  state.pacts = state.pacts.filter(
    (p) => !((p.type === 'access' || p.type === 'trade') && ((p.a === attacker && p.b === target) || (p.a === target && p.b === attacker))),
  );

  const war: War = {
    id: state.nextId++,
    name: `${A.adjective}–${T.adjective} War`,
    attackers: [attacker],
    defenders: [target],
    start: state.day,
    score: 0,
    battlesA: 0,
    battlesD: 0,
    casualtiesA: 0,
    casualtiesD: 0,
  };
  state.wars.push(war);
  for (const p of puppetsOf(state, attacker)) if (!atWar(state, p, target)) war.attackers.push(p);
  for (const p of puppetsOf(state, target)) if (!war.attackers.includes(p)) war.defenders.push(p);
  markDirty();

  // aggression is remembered; attacking someone much weaker is worse
  const sizeRatio = ownedProvinces(state, attacker).length / Math.max(1, ownedProvinces(state, target).length);
  const warmonger = -Math.round(6 + Math.min(14, Math.max(0, sizeRatio - 1) * 4));
  worldOpinion(state, attacker, warmonger, 'Warmonger', 0.02, [target, ...alliesOf(state, attacker)]);
  addOpinion(state, target, attacker, -40, 'Declared war on us', 0.02);
  A.trust = Math.max(0, A.trust - 3);
  log(state, `${A.name} declares war on ${T.name}! (${war.name})`, 'war', [attacker, target]);

  // defensive allies answer the call
  for (const ally of alliesOf(state, target)) {
    if (war.attackers.includes(ally) || war.defenders.includes(ally)) continue;
    if (findPact(state, 'alliance', ally, attacker)) continue; // allied to both: stays out
    const an = state.nations[ally];
    if (an.isPlayer) {
      state.pendingEvents.push({ id: 'call_to_arms', nation: ally, day: state.day, war: war.id, from: target });
      continue;
    }
    const chance = 0.35 + 0.55 * an.personality.loyalty * ((opinion(state, ally, target) + 100) / 200) + (opinion(state, ally, attacker) < 0 ? 0.15 : 0);
    if (rand(state) < chance) joinWar(state, war, ally, 'defenders');
    else refuseCall(state, ally, target);
  }
  return war;
}

export function refuseCall(state: GameState, ally: number, caller: number): void {
  const pact = findPact(state, 'alliance', ally, caller);
  if (pact) removePact(state, pact);
  state.nations[ally].trust = Math.max(0, state.nations[ally].trust - 8);
  addOpinion(state, caller, ally, -30, 'Abandoned us in war', 0.02);
  log(state, `${state.nations[ally].name} refused to honour its alliance with ${state.nations[caller].name}.`, 'diplo', [ally, caller]);
  markDirty();
}

export function joinWar(state: GameState, war: War, nation: number, side: WarSide): void {
  const other = side === 'attackers' ? war.defenders : war.attackers;
  if (war.attackers.includes(nation) || war.defenders.includes(nation)) return;
  if (other.some((o) => isFriendly(state, o, nation) && findPact(state, 'alliance', o, nation))) {
    // cannot fight an ally: leave that alliance first (betrayal)
    for (const o of other) {
      const p = findPact(state, 'alliance', o, nation);
      if (p) breakPact(state, nation, p, true);
    }
  }
  war[side].push(nation);
  for (const p of puppetsOf(state, nation)) if (!war.attackers.includes(p) && !war.defenders.includes(p)) war[side].push(p);
  markDirty();
  log(state, `${state.nations[nation].name} joins the ${war.name} on the ${side === 'attackers' ? 'attacking' : 'defending'} side.`, 'war', [nation]);
}

/** Ask an ally to join a war you are in. Returns null if they accepted, or the reason they refused. */
export function callToArms(state: GameState, caller: number, ally: number, war: War): string | null {
  const side = sideOf(war, caller);
  if (!side) return 'You are not in that war';
  if (!findPact(state, 'alliance', caller, ally)) return 'Not an ally';
  if (sideOf(war, ally)) return 'Already in the war';
  const an = state.nations[ally];
  const enemies = enemiesIn(war, caller);
  const enemyOpinion = enemies.reduce((s, e) => s + opinion(state, ally, e), 0) / Math.max(1, enemies.length);
  const chance = 0.2 + 0.5 * an.personality.loyalty + (opinion(state, ally, caller) - enemyOpinion) / 300 + (state.nations[caller].trust - 50) / 200;
  if (an.isPlayer || rand(state) < chance) {
    joinWar(state, war, ally, side);
    addOpinion(state, caller, ally, 15, 'Fought by our side', 0.01, 40);
    return null;
  }
  return `${an.name} declined to join.`;
}

function sideValue(state: GameState, members: number[]): number {
  let v = 0;
  for (const m of members) for (const pid of ownedProvinces(state, m)) v += provinceValue(state, pid);
  return Math.max(1, v);
}

function occupiedValue(state: GameState, owners: number[], occupiers: number[]): number {
  let v = 0;
  for (const o of owners)
    for (const pid of ownedProvinces(state, o)) {
      const p = state.provinces[pid];
      if (occupiers.includes(p.controller)) v += provinceValue(state, pid) * (p.isCapital ? 2 : 1);
    }
  return v;
}

export function updateWarScore(state: GameState, war: War): void {
  const occA = occupiedValue(state, war.defenders, war.attackers) / sideValue(state, war.defenders);
  const occD = occupiedValue(state, war.attackers, war.defenders) / sideValue(state, war.attackers);
  const battles = Math.max(-25, Math.min(25, (war.battlesA - war.battlesD) * 2));
  war.score = Math.max(-100, Math.min(100, Math.round((occA - occD) * 110 + battles)));
}

/** War score from `nation`'s point of view (positive = winning). */
export function scoreFor(war: War, nation: number): number {
  return sideOf(war, nation) === 'defenders' ? -war.score : war.score;
}

export function leaderOf(war: War, side: WarSide): number {
  return war[side][0];
}

/** War score a set of demands costs. `receiver` is the side getting the terms. */
export function termsCost(state: GameState, war: War, receiver: WarSide, terms: PeaceTerms): number {
  const giver: WarSide = receiver === 'attackers' ? 'defenders' : 'attackers';
  const loserLeader = leaderOf(war, giver);
  if (terms.annex) return 100;
  const total = sideValue(state, war[giver]);
  let cost = 0;
  for (const pid of terms.cede) cost += (provinceValue(state, pid) / total) * 130 + 2;
  const income = Math.max(1, state.nations[loserLeader].income);
  cost += (terms.money / (income * 150)) * 30;
  if (terms.puppet) cost += 55;
  return Math.round(cost);
}

export function validateTerms(state: GameState, war: War, receiver: WarSide, terms: PeaceTerms): string | null {
  const giver: WarSide = receiver === 'attackers' ? 'defenders' : 'attackers';
  for (const pid of terms.cede) {
    const p = state.provinces[pid];
    if (!war[giver].includes(p.owner)) return `${p.name} is not enemy land`;
    if (!war[receiver].includes(p.controller)) return `${p.name} is not occupied by your side`;
  }
  if (terms.annex) {
    const loser = leaderOf(war, giver);
    if (!isCapitulated(state, loser)) return 'Annexation requires the enemy to have capitulated';
  }
  return null;
}

export function isCapitulated(state: GameState, nation: number): boolean {
  const n = state.nations[nation];
  const owned = ownedProvinces(state, nation);
  if (!owned.length) return true;
  const capLost = state.provinces[n.capital]?.controller !== nation;
  const occupied = owned.filter((pid) => state.provinces[pid].controller !== nation).length;
  return capLost && occupied / owned.length >= 0.6;
}

/** Does the AI on the giving side accept these terms? */
export function aiAcceptsTerms(state: GameState, war: War, receiver: WarSide, terms: PeaceTerms): boolean {
  const giver: WarSide = receiver === 'attackers' ? 'defenders' : 'attackers';
  const loser = leaderOf(war, giver);
  const receiverScore = receiver === 'attackers' ? war.score : -war.score;
  const cost = termsCost(state, war, receiver, terms);
  const exhaustion = state.nations[loser].warExhaustion;
  if (terms.annex) return isCapitulated(state, loser) && receiverScore >= 60;
  if (cost === 0) {
    // white peace: accept unless clearly winning
    return receiverScore > -15 - exhaustion * 0.3;
  }
  return cost <= receiverScore + exhaustion * 0.35 + (isCapitulated(state, loser) ? 30 : 0);
}

export function makePeace(state: GameState, war: War, receiver: WarSide, terms: PeaceTerms): void {
  const giver: WarSide = receiver === 'attackers' ? 'defenders' : 'attackers';
  const winner = leaderOf(war, receiver);
  const loser = leaderOf(war, giver);
  const W = state.nations[winner];
  const L = state.nations[loser];
  const parts: string[] = [];
  let annexedCount = 0;

  for (const pid of terms.cede) {
    const p = state.provinces[pid];
    const newOwner = war[receiver].includes(p.controller) ? p.controller : winner;
    transferProvince(state, pid, newOwner);
  }
  if (terms.cede.length) parts.push(`${terms.cede.length} province${terms.cede.length > 1 ? 's' : ''}`);
  if (terms.money > 0) {
    const paid = Math.min(L.money, terms.money);
    L.money -= paid;
    L.debt += terms.money - paid;
    W.money += terms.money;
    parts.push(`${Math.round(terms.money)} in reparations`);
  }
  if (terms.annex) {
    annexedCount = ownedProvinces(state, loser).length;
    for (const pid of [...ownedProvinces(state, loser)]) transferProvince(state, pid, winner);
    parts.push('full annexation');
  } else if (terms.puppet && L.alive) {
    for (const p of [...state.pacts]) if (p.type === 'alliance' && (p.a === loser || p.b === loser)) removePact(state, p);
    for (const p of [...state.pacts]) if (p.type === 'puppet' && p.a === loser) removePact(state, p);
    state.pacts.push({ id: state.nextId++, type: 'puppet', a: winner, b: loser, start: state.day, until: -1, liberty: 20 });
    parts.push('puppet status');
  }
  if (terms.cede.length || terms.money || terms.puppet || terms.annex) addOpinion(state, loser, winner, -30, 'Humiliated us in war', 0.01);
  // land grabs alarm everyone (the bigger the conqueror already is, the more)
  const gained = terms.annex ? annexedCount : terms.cede.length;
  if (gained > 0) {
    const size = ownedProvinces(state, winner).length;
    const ae = -gained * (2 + size / 25);
    worldOpinion(state, winner, ae, 'Aggressive expansion', 0.012, [...war[receiver]]);
  }
  for (const a of war.attackers)
    for (const d of war.defenders)
      if (state.nations[a].alive && state.nations[d].alive && !findPact(state, 'truce', a, d))
        state.pacts.push({ id: state.nextId++, type: 'truce', a, b: d, start: state.day, until: state.day + 365 * 5 });
  endWar(state, war);
  log(
    state,
    parts.length ? `Peace: ${W.name} wins the ${war.name} (${parts.join(', ')}).` : `White peace ends the ${war.name}.`,
    'war',
    [winner, loser],
  );
}

export function transferProvince(state: GameState, pid: number, newOwner: number): void {
  const p = state.provinces[pid];
  const old = p.owner;
  p.owner = newOwner;
  p.controller = newOwner;
  p.siege = 0;
  p.siegeBy = -1;
  p.construction = null;
  if (p.isCapital) {
    p.isCapital = false;
    markDirty();
    relocateCapital(state, old);
  }
  p.unrest = Math.min(100, p.unrest + 30);
  markDirty();
  checkAlive(state, old);
}

function relocateCapital(state: GameState, nation: number): void {
  const owned = ownedProvinces(state, nation);
  if (!owned.length) return;
  let best = owned[0];
  for (const pid of owned) if (state.provinces[pid].pop > state.provinces[best].pop) best = pid;
  state.nations[nation].capital = best;
  state.provinces[best].isCapital = true;
}

export function checkAlive(state: GameState, nation: number): void {
  if (nation < 0) return;
  const n = state.nations[nation];
  if (!n.alive) return;
  if (ownedProvinces(state, nation).length > 0) return;
  n.alive = false;
  state.divisions = state.divisions.filter((d) => d.owner !== nation);
  state.pacts = state.pacts.filter((p) => p.a !== nation && p.b !== nation);
  for (const w of [...state.wars]) {
    w.attackers = w.attackers.filter((x) => x !== nation);
    w.defenders = w.defenders.filter((x) => x !== nation);
    if (!w.attackers.length || !w.defenders.length) endWar(state, w);
  }
  markDirty();
  log(state, `${n.name} has ceased to exist.`, nation === state.player ? 'bad' : 'war', [nation]);
}

export function endWar(state: GameState, war: War): void {
  const i = state.wars.indexOf(war);
  if (i >= 0) state.wars.splice(i, 1);
  markDirty();
  // occupations end where the two nations are no longer at war
  for (const p of state.provinces) {
    if (p.isSea || p.owner < 0 || p.controller === p.owner) continue;
    if (!atWar(state, p.owner, p.controller)) {
      p.controller = p.owner;
      p.siege = 0;
      p.siegeBy = -1;
    }
  }
  evacuate(state);
  markDirty();
}

/** Divisions standing where they are no longer allowed go home. */
export function evacuate(state: GameState): void {
  for (const d of state.divisions) {
    const p = state.provinces[d.province];
    if (p.isSea) continue;
    const c = p.controller;
    if (c === d.owner || isFriendly(state, d.owner, c) || atWar(state, d.owner, c) || findPact(state, 'access', c, d.owner)) continue;
    d.province = state.nations[d.owner].capital;
    d.path = [];
    d.moveProgress = 0;
  }
  markDirty();
}

/** Leave a war you are not leading. */
export function withdrawFromWar(state: GameState, war: War, nation: number): string | null {
  const side = sideOf(war, nation);
  if (!side) return 'Not in that war';
  if (war[side][0] === nation) return 'War leaders must negotiate peace';
  const leaving = [nation, ...puppetsOf(state, nation)];
  war[side] = war[side].filter((x) => !leaving.includes(x));
  for (const ally of war[side]) addOpinion(state, ally, nation, -20, 'Left us alone in war', 0.02);
  markDirty();
  endWarIfEmpty(state, war);
  for (const p of state.provinces) {
    if (leaving.includes(p.controller) && !atWar(state, p.owner, p.controller)) p.controller = p.owner;
    if (leaving.includes(p.owner) && p.controller !== p.owner && !atWar(state, p.owner, p.controller)) p.controller = p.owner;
  }
  evacuate(state);
  log(state, `${state.nations[nation].name} withdraws from the ${war.name}.`, 'war', [nation]);
  return null;
}

function endWarIfEmpty(state: GameState, war: War): void {
  if (!war.attackers.length || !war.defenders.length) endWar(state, war);
}

export function warsDay(state: GameState): void {
  for (const war of [...state.wars]) {
    war.attackers = war.attackers.filter((n) => state.nations[n].alive);
    war.defenders = war.defenders.filter((n) => state.nations[n].alive);
    if (!war.attackers.length || !war.defenders.length) {
      endWar(state, war);
      continue;
    }
    updateWarScore(state, war);
    for (const n of [...war.attackers, ...war.defenders]) {
      const nation = state.nations[n];
      nation.warExhaustion = Math.min(100, nation.warExhaustion + 0.01 * (1 - mod(state, n, 'stability') / 100));
    }
  }
}

export function playerWars(state: GameState): War[] {
  return state.player >= 0 ? warsOf(state, state.player) : [];
}
