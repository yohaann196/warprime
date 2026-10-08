// Utility-based AI for computer nations: economy, military and diplomacy planners.
import { BUILDINGS, BASE_PRICES } from '../../data/buildings';
import { INSTITUTIONS_DEF, institutionCost } from '../../data/institutions';
import { techCost, type TechDef } from '../../data/techs';
import { UNITS } from '../../data/units';
import { DIFFICULTY } from '../difficulty';
import { cannotBuild, costOf, maxConcurrentBuilds, activeBuilds, startBuilding, upgradeRoad, roadCost, MAX_ROADS } from '../economy/build';
import { raiseInstitution } from '../institutions';
import { findPath } from '../military/pathfinding';
import { canRecruit, militaryStrength, recruit } from '../military/units';
import { canBuildNuke, launchNuke, startNuke } from '../military/nukes';
import { annexPuppet, breakPact, canAnnexPuppet, proposeTreaty, type Clause, evaluateTreaty } from '../diplomacy/pacts';
import { improveRelations, opinion } from '../diplomacy/relations';
import { callToArms, declareWar, isCapitulated, joinWar, leaderOf, scoreFor, termsCost, type PeaceTerms } from '../diplomacy/war';
import { offerPeace } from '../events';
import {
  alliesOf,
  atWar,
  log,
  divisionsAt,
  findPact,
  isFriendly,
  nationPop,
  neighborsOf,
  overlordOf,
  ownedProvinces,
  provinceValue,
  puppetsOf,
  sideOf,
  warsOf,
} from '../query';
import { rand } from '../rng';
import { availableTechs, setResearch } from '../tech';
import { crownSince, currentRank, runawayLeader } from '../leaderboard';
import { DAYS_PER_YEAR, INSTITUTIONS, yearOf, type BuildingId, type GameState, type Institution, type Nation, type UnitType } from '../state';

export function runAI(state: GameState): void {
  for (const n of state.nations) {
    if (!n.alive || n.isPlayer) continue;
    const slot = (state.day + n.id) % 10;
    if (slot === 0) aiEconomy(state, n);
    if (slot === 5) aiMilitary(state, n);
    if ((state.day + n.id * 3) % 30 === 0) aiDiplomacy(state, n);
  }
}

// ------------------------------------------------------------------------------------------
// Economy
// ------------------------------------------------------------------------------------------

function techWeight(n: Nation, t: TechDef): number {
  const focus = n.personality.focus;
  let w = 1;
  if (focus === 'economy' && t.line === 'industry') w = 2;
  if (focus === 'military' && t.line === 'military') w = 2.2;
  if (focus === 'science' && (t.line === 'science' || t.line === 'society')) w = 1.8;
  if (focus === 'trade' && (t.line === 'society' || t.line === 'industry')) w = 1.6;
  if (t.id === 'nuclear_weapons') w *= n.personality.aggression;
  return w / Math.sqrt(techCost(t));
}

function aiResearch(state: GameState, n: Nation): void {
  if (n.tech.current) return;
  const avail = availableTechs(state, n);
  if (!avail.length) return;
  let best = avail[0];
  let bw = -1;
  for (const t of avail) {
    const w = techWeight(n, t) * (0.8 + rand(state) * 0.4);
    if (w > bw) {
      bw = w;
      best = t;
    }
  }
  setResearch(state, n, best.id);
}

function aiInstitutions(state: GameState, n: Nation): void {
  for (let guard = 0; guard < 5; guard++) {
    const order: Institution[] = [...n.goals, ...INSTITUTIONS.filter((i) => !n.goals.includes(i))];
    // goals first, but keep others from falling hopelessly behind
    let pick: Institution | null = null;
    for (const inst of order) {
      const lvl = n.institutions[inst];
      if (lvl >= INSTITUTIONS_DEF[inst].reforms.length) continue;
      const isGoal = n.goals.includes(inst);
      const gl = Math.min(n.institutions[n.goals[0]], n.institutions[n.goals[1]]);
      if (!isGoal && lvl >= gl / 2) continue;
      if (institutionCost(lvl) <= n.devPoints) {
        pick = inst;
        break;
      }
    }
    if (!pick || raiseInstitution(state, n, pick)) return;
  }
}

function buildScore(state: GameState, n: Nation, pid: number, b: BuildingId): number {
  const p = state.provinces[pid];
  const net = n.netGoods;
  const pop = nationPop(state, n.id);
  const focus = n.personality.focus;
  const lvl = p.buildings[b] ?? 0;
  const staffOk = p.pop > 60 ? 1 : 0.4;
  let s = 0;
  switch (b) {
    case 'farm': s = n.foodShortage || (net.food ?? 0) < pop * 0.0015 ? 30 : 2; break;
    case 'sawmill': s = (net.wood ?? 0) < 2 ? 14 : 2; break;
    case 'mine': s = p.resource ? 16 + (state.prices[p.resource] / BASE_PRICES[p.resource]) * 8 : 0; break;
    case 'oil_well': s = 16; break;
    case 'steel_mill': s = (n.stock.iron > 15 || (net.iron ?? 0) > 1.5) && (n.stock.coal > 10 || (net.coal ?? 0) > 0.5) ? 20 : 4; break;
    case 'refinery': s = (net.oil ?? 0) > 1.5 || n.stock.oil > 30 ? 15 : 1; break;
    case 'munitions_plant': s = (net.steel ?? 0) > 0.8 ? 10 + (focus === 'military' ? 10 : 0) : 2; break;
    case 'consumer_factory': s = n.consumerSat < 0.9 ? 22 : 4; break;
    case 'vehicle_plant': s = (net.steel ?? 0) > 1.5 && n.stock.fuel > 5 ? 12 + (focus === 'military' ? 8 : 0) : 1; break;
    case 'electronics_plant': s = n.stock.rare > 5 || (net.rare ?? 0) > 0.5 ? 14 : 1; break;
    case 'power_plant': {
      let f = 0;
      for (const k of ['steel_mill', 'munitions_plant', 'consumer_factory', 'vehicle_plant', 'electronics_plant', 'refinery'] as BuildingId[]) f += p.buildings[k] ?? 0;
      s = f >= 2 && (net.coal ?? 0) > 0 ? 10 : 0;
      break;
    }
    case 'green_plant': s = (state.climate?.damage ?? 0) > 15 ? 4 + (state.climate!.damage / 10) * (n.personality.loyalty + 0.5) : 0.5; break;
    case 'university': s = 7 + (focus === 'science' ? 12 : 0); break;
    case 'market_hall': s = (5 + (focus === 'trade' ? 10 : 0)) * Math.min(2, p.pop / 400); break;
    case 'admin_office': s = 6; break;
    case 'barracks': s = lvl === 0 && !p.isCapital && focus === 'military' ? 4 : 0; break;
    case 'fort': {
      const border = p.neighbors.some((nb) => {
        const o = state.provinces[nb].owner;
        return o >= 0 && o !== n.id && opinion(state, n.id, o) < -20;
      });
      s = border ? 6 * (p.isCapital ? 2 : 1) : 0;
      break;
    }
    case 'port': s = lvl === 0 ? 4 : 0; break;
  }
  if (BUILDINGS[b].category === 'factory') s *= staffOk;
  return s / Math.pow(costOf(state, n, p, b) / 300, 0.6) * (1 - lvl * 0.12);
}

function aiEconomy(state: GameState, n: Nation): void {
  aiResearch(state, n);
  aiInstitutions(state, n);

  let targetTax = n.happiness > 65 ? 0.32 : n.happiness > 50 ? 0.27 : n.happiness > 40 ? 0.22 : 0.16;
  if (n.money < 100 || n.debt > 0) targetTax += 0.06;
  if (n.money > 6000) targetTax -= 0.06;
  if (n.taxRate < targetTax - 0.005) n.taxRate = Math.round((n.taxRate + 0.01) * 100) / 100;
  else if (n.taxRate > targetTax + 0.005) n.taxRate = Math.round((n.taxRate - 0.01) * 100) / 100;

  const owned = ownedProvinces(state, n.id);
  for (let i = 0; i < 3 && activeBuilds(state, n) < maxConcurrentBuilds(n) && n.money > 250; i++) {
    let best: { pid: number; b: BuildingId; s: number } | null = null;
    for (const pid of owned) {
      const p = state.provinces[pid];
      if (p.controller !== n.id || p.construction) continue;
      for (const b of Object.keys(BUILDINGS) as BuildingId[]) {
        if (cannotBuild(state, n, p, b)) continue;
        const s = buildScore(state, n, pid, b) * (0.85 + rand(state) * 0.3);
        if (s > 0 && (!best || s > best.s)) best = { pid, b, s };
      }
    }
    if (!best) break;
    // keep a cash buffer at war
    if (warsOf(state, n.id).length && n.money - costOf(state, n, state.provinces[best.pid], best.b) < 400) break;
    startBuilding(state, n, state.provinces[best.pid], best.b);
  }

  if (n.money > 2500) {
    let bestP = -1;
    let bestPop = 0;
    for (const pid of owned) {
      const p = state.provinces[pid];
      if (p.roads < MAX_ROADS && p.controller === n.id && p.pop > bestPop && roadCost(p, n.era) < n.money * 0.3) {
        bestPop = p.pop;
        bestP = pid;
      }
    }
    if (bestP >= 0) upgradeRoad(n, state.provinces[bestP]);
  }

  if (n.personality.aggression > 0.55 && n.money > 6000 && n.nukes < 3 && !canBuildNuke(state, n.id)) startNuke(state, n.id);
}

// ------------------------------------------------------------------------------------------
// Military
// ------------------------------------------------------------------------------------------

function pickUnit(state: GameState, n: Nation, count: number): UnitType {
  const opts: UnitType[] = [];
  for (const t of ['drone', 'armor', 'air', 'artillery'] as UnitType[]) {
    if (canRecruit(state, n, t, n.capital) === null) opts.push(t);
  }
  if (opts.includes('drone') && rand(state) < 0.4) return 'drone';
  if (opts.includes('armor') && rand(state) < 0.45) return 'armor';
  if (opts.includes('air') && rand(state) < 0.2) return 'air';
  if (opts.includes('artillery') && count % 4 === 3) return 'artillery';
  return 'infantry';
}

function enemyStrengthAt(state: GameState, pid: number, me: number): number {
  let s = 0;
  for (const d of divisionsAt(state, pid)) if (atWar(state, d.owner, me)) s += (UNITS[d.type].defense + 1) * d.strength * (0.3 + 0.7 * d.org);
  const p = state.provinces[pid];
  return s + (p.buildings.fort ?? 0) * 2;
}

function aiMilitary(state: GameState, n: Nation): void {
  const mine = state.divisions.filter((d) => d.owner === n.id);
  const wars = warsOf(state, n.id);
  const owned = ownedProvinces(state, n.id);
  const diff = DIFFICULTY[state.settings.difficulty];
  let desired = Math.round(owned.length * 0.3 * (0.6 + n.personality.aggression * diff.aiAggression * 0.6) * (wars.length ? 1.6 : 1)) + 2;
  if (n.personality.focus === 'military') desired = Math.round(desired * 1.3);
  const armyUpkeep = mine.reduce((s, d) => s + UNITS[d.type].upkeep, 0);
  const affordable = armyUpkeep < Math.max(10, n.income * (wars.length ? 0.55 : 0.35));
  if (mine.length < desired && affordable && n.money > 300) {
    const type = pickUnit(state, n, mine.length);
    // recruit nearest to the front when at war
    let where = n.capital;
    if (wars.length) {
      const barracks = owned.filter((pid) => (state.provinces[pid].buildings.barracks ?? 0) > 0 && state.provinces[pid].controller === n.id);
      if (barracks.length) where = barracks[Math.floor(rand(state) * barracks.length)];
    }
    if (state.provinces[where].controller !== n.id) where = owned.find((pid) => state.provinces[pid].controller === n.id) ?? n.capital;
    recruit(state, n, type, where);
  }

  const idle = mine.filter((d) => d.training === 0 && !d.path.length);
  if (!idle.length) return;
  const groups = new Map<number, typeof idle>();
  for (const d of idle) {
    const g = groups.get(d.province) ?? [];
    g.push(d);
    groups.set(d.province, g);
  }

  if (wars.length) {
    const enemies = new Set<number>();
    for (const w of wars) for (const e of sideOf(w, n.id) === 'attackers' ? w.defenders : w.attackers) enemies.add(e);
    // our own occupied land comes first
    const lost = owned.filter((pid) => enemies.has(state.provinces[pid].controller));
    for (const [pid, group] of groups) {
      const here = state.provinces[pid];
      if (!here.isSea && atWar(state, n.id, here.controller)) continue; // sieging
      if (divisionsAt(state, pid).some((d) => atWar(state, d.owner, n.id))) continue; // fighting
      // candidate targets: nearby enemy-held provinces
      const targets: number[] = [...lost];
      const seen = new Set<number>([pid]);
      let frontier = [pid];
      for (let depth = 0; depth < 5 && targets.length < 25; depth++) {
        const next: number[] = [];
        for (const f of frontier)
          for (const nb of state.provinces[f].neighbors) {
            if (seen.has(nb)) continue;
            seen.add(nb);
            const q = state.provinces[nb];
            if (q.isSea) continue;
            if (enemies.has(q.controller)) targets.push(nb);
            else if (isFriendly(state, n.id, q.controller)) next.push(nb);
          }
        frontier = next;
      }
      if (!targets.length) continue;
      const ourPower = group.reduce((s, d) => s + UNITS[d.type].attack * d.strength * d.org, 0);
      let best = -1;
      let bestScore = -Infinity;
      for (const t of targets) {
        const q = state.provinces[t];
        const dist = Math.hypot(q.center[0] - here.center[0], q.center[1] - here.center[1]);
        const enemy = enemyStrengthAt(state, t, n.id);
        const score = (ourPower / (enemy + 1)) * 10 + provinceValue(state, t) * 0.3 - dist * 0.08 + (lost.includes(t) ? 15 : 0) + (q.isCapital ? 20 : 0);
        if (score > bestScore) {
          bestScore = score;
          best = t;
        }
      }
      if (best < 0) continue;
      // keep one division home if the capital is threatened
      const sendGroup = pid === n.capital && group.length > 1 ? group.slice(1) : group;
      const ignores = sendGroup.every((d) => UNITS[d.type].ignoresTerrain);
      const path = findPath(state, n.id, pid, best, ignores, 1500);
      if (!path || !path.length) continue;
      for (const d of sendGroup) {
        d.path = [...path];
        d.moveProgress = 0;
        d.stance = 'move';
      }
    }
    return;
  }

  // peacetime: hold the border facing the biggest threat
  if ((state.day + n.id) % 30 !== 5) return;
  let threat = -1;
  let threatScore = 0;
  for (const nb of neighborsOf(state, n.id)) {
    if (isFriendly(state, n.id, nb)) continue;
    const s = militaryStrength(state, nb) * (1 - opinion(state, n.id, nb) / 150);
    if (s > threatScore) {
      threatScore = s;
      threat = nb;
    }
  }
  if (threat < 0) return;
  const border = owned.filter((pid) => state.provinces[pid].neighbors.some((nb) => state.provinces[nb].owner === threat));
  if (!border.length) return;
  let i = 0;
  for (const d of idle) {
    if (d.province !== n.capital) continue;
    if (divisionsAt(state, n.capital).filter((x) => x.owner === n.id).length <= 1) break;
    const target = border[i++ % border.length];
    const path = findPath(state, n.id, d.province, target, false, 1500);
    if (path && path.length) {
      d.path = path;
      d.stance = 'move';
    }
  }
}

// ------------------------------------------------------------------------------------------
// Diplomacy
// ------------------------------------------------------------------------------------------

function canPropose(state: GameState, from: number, to: number): boolean {
  const T = state.nations[to];
  if (!T.isPlayer) return true;
  if (state.pendingEvents.filter((e) => e.id === 'treaty_offer').length >= 2) return false;
  return !state.pendingEvents.some((e) => e.id === 'treaty_offer' && e.from === from);
}

function propose(state: GameState, from: number, to: number, clauses: Clause[]): boolean {
  const T = state.nations[to];
  if (T.isPlayer) {
    if (!canPropose(state, from, to)) return false;
    // clauses are written from the proposer's side
    state.pendingEvents.push({ id: 'treaty_offer', nation: to, day: state.day, from, clauses });
    return false;
  }
  return proposeTreaty(state, from, to, clauses).accepted;
}

function aiPeace(state: GameState, n: Nation): void {
  for (const war of warsOf(state, n.id)) {
    // an earlier peace this turn may have ended this war or even annexed us
    if (!n.alive || !state.wars.includes(war)) continue;
    const side = sideOf(war, n.id);
    if (!side || war[side][0] !== n.id) continue; // leaders negotiate
    const other = side === 'attackers' ? 'defenders' : 'attackers';
    const enemyLeader = leaderOf(war, other);
    const myScore = scoreFor(war, n.id);
    const age = state.day - war.start;
    if (myScore >= 25 && age > 90) {
      // demand what we hold, within what the score justifies
      const terms: PeaceTerms = { cede: [], money: 0, puppet: false, annex: false };
      if (isCapitulated(state, enemyLeader) && myScore >= 70 && ownedProvinces(state, enemyLeader).length <= 6) terms.annex = true;
      else {
        const held = war[other]
          .flatMap((m) => ownedProvinces(state, m))
          .filter((pid) => war[side].includes(state.provinces[pid].controller))
          .sort((a, b) => provinceValue(state, b) - provinceValue(state, a));
        const maxTake = Math.max(2, Math.ceil(ownedProvinces(state, enemyLeader).length * 0.35));
        for (const pid of held) {
          if (terms.cede.length >= maxTake) break;
          const trial = { ...terms, cede: [...terms.cede, pid] };
          if (termsCost(state, war, side, trial) <= myScore) terms.cede = trial.cede;
        }
        if (!terms.cede.length) terms.money = Math.round(state.nations[enemyLeader].income * 150);
        if (myScore >= 80 && termsCost(state, war, side, { ...terms, puppet: true }) <= myScore + 10) terms.puppet = true;
      }
      offerPeace(state, war.id, n.id, side, terms);
    } else if ((myScore <= -40 || n.warExhaustion > 65) && age > 120) {
      // sue for peace: give up some of what they hold
      const held = war[side]
        .flatMap((m) => ownedProvinces(state, m))
        .filter((pid) => war[other].includes(state.provinces[pid].controller) && !state.provinces[pid].isCapital)
        .sort((a, b) => provinceValue(state, a) - provinceValue(state, b));
      const terms: PeaceTerms = { cede: [], money: 0, puppet: false, annex: false };
      for (const pid of held) {
        if (termsCost(state, war, other, terms) >= -myScore * 0.7) break;
        terms.cede.push(pid);
      }
      if (isCapitulated(state, n.id) && -myScore >= 80 && ownedProvinces(state, n.id).length <= 4) {
        terms.cede = [];
        terms.annex = true;
      }
      offerPeace(state, war.id, n.id, other, terms);
    } else if (age > 365 * 3 && Math.abs(myScore) < 20) {
      offerPeace(state, war.id, n.id, side, { cede: [], money: 0, puppet: false, annex: false });
    }
    // desperate measures
    if (!n.alive || !state.wars.includes(war)) continue;
    if (myScore < -45 && n.nukes > 0 && n.personality.aggression > 0.6 && rand(state) < 0.08 * DIFFICULTY[state.settings.difficulty].aiAggression) {
      const targets = ownedProvinces(state, enemyLeader).sort((a, b) => state.provinces[b].pop - state.provinces[a].pop);
      if (targets.length) launchNuke(state, n.id, targets[0]);
    }
  }
}

function aiDiplomacy(state: GameState, n: Nation): void {
  const diff = DIFFICULTY[state.settings.difficulty];
  const wars = warsOf(state, n.id);
  if (overlordOf(state, n.id) >= 0) return; // puppets follow their overlord

  if (wars.length) {
    aiPeace(state, n);
    if (!n.alive) return;
    for (const war of warsOf(state, n.id)) {
      for (const ally of alliesOf(state, n.id)) {
        if (!sideOf(war, ally) && !state.nations[ally].isPlayer && rand(state) < 0.3) callToArms(state, n.id, ally, war);
      }
    }
    return;
  }

  // grand alliance: gang up on a superpower (balance of power) or a long-reigning runaway #1
  // while it is busy fighting someone else
  const land = state.provinces.filter((p) => !p.isSea).length;
  const runaway = runawayLeader(state);
  const since = crownSince(state);
  const longReign = runaway >= 0 && since >= 0 && diff.leaderAllianceYears > 0 && state.day - since >= diff.leaderAllianceYears * DAYS_PER_YEAR ? runaway : -1;
  for (const sp of state.nations) {
    if (!sp.alive || sp.id === n.id || isFriendly(state, n.id, sp.id) || findPact(state, 'truce', n.id, sp.id)) continue;
    const big = ownedProvinces(state, sp.id).length >= land * 0.18;
    if (!big && sp.id !== longReign) continue;
    const op = opinion(state, n.id, sp.id);
    if (!(big && op <= -10) && !(sp.id === longReign && op <= 10)) continue;
    const spWar = warsOf(state, sp.id)[0];
    if (spWar && rand(state) < 0.25 * diff.aiAggression) {
      joinWar(state, spWar, n.id, spWar.attackers.includes(sp.id) ? 'defenders' : 'attackers');
      log(state, `${n.name} joins the grand alliance against ${sp.name}.`, 'war', [n.id, sp.id]);
      return;
    }
  }

  const my = militaryStrength(state, n.id);
  const allyStrength = alliesOf(state, n.id).reduce((s, a) => s + militaryStrength(state, a), 0);
  const elapsedYears = yearOf(state) - state.settings.startYear;
  const playerRank = state.player >= 0 ? currentRank(state, state.player) : 0;

  // --- war ---
  if (elapsedYears >= 2 && n.warExhaustion < 8 && n.stability > 40) {
    let best = -1;
    let bestDesire = 0;
    for (const t of neighborsOf(state, n.id)) {
      if (isFriendly(state, n.id, t) || overlordOf(state, t) >= 0) continue;
      if (findPact(state, 'truce', n.id, t)) continue;
      if (findPact(state, 'nap', n.id, t) && n.personality.loyalty > 0.3) continue;
      const theirs = militaryStrength(state, t) + alliesOf(state, t).reduce((s, a) => s + militaryStrength(state, a) * 0.7, 0);
      const ratio = (my + allyStrength * 0.4) / Math.max(1, theirs);
      let desire = n.personality.aggression * diff.aiAggression * (ratio - 1.1) * 0.8 - opinion(state, n.id, t) / 150 + 0.05;
      desire -= Math.max(0, ownedProvinces(state, n.id).length - 25) / 120; // big empires are harder to rally for more war
      // envy: the world's #1 makes enemies, and on Demonic so does a player near the top
      if (t === runaway) desire += diff.leaderEnvy;
      if (t === state.player && playerRank > 0 && playerRank <= 3) desire += diff.playerEnvy;
      if (desire > bestDesire) {
        bestDesire = desire;
        best = t;
      }
    }
    if (best >= 0 && bestDesire > 0.3 && rand(state) < 0.25) {
      declareWar(state, n.id, best);
      return;
    }
  }

  // --- alliances against threats ---
  let threat = -1;
  let worst = 1.2;
  for (const nb of neighborsOf(state, n.id)) {
    if (isFriendly(state, n.id, nb)) continue;
    const r = militaryStrength(state, nb) / Math.max(1, my + allyStrength);
    if (r > worst && opinion(state, n.id, nb) < 10) {
      worst = r;
      threat = nb;
    }
  }
  if (threat >= 0 && rand(state) < 0.5) {
    const candidates = state.nations
      .filter((o) => o.alive && o.id !== n.id && o.id !== threat && !findPact(state, 'alliance', n.id, o.id) && overlordOf(state, o.id) < 0)
      .sort((a, b) => opinion(state, b.id, threat) - opinion(state, a.id, threat) + (opinion(state, n.id, b.id) - opinion(state, n.id, a.id)) * -1);
    for (const c of candidates.slice(0, 3)) {
      if (opinion(state, n.id, c.id) < 15) continue;
      if (c.isPlayer && evaluateTreaty(state, c.id, n.id, [{ k: 'alliance' }]).value < 0) continue;
      if (propose(state, n.id, c.id, [{ k: 'alliance' }])) break;
    }
    if (!findPact(state, 'nap', n.id, threat) && rand(state) < 0.12) propose(state, n.id, threat, [{ k: 'nap' }]);
  }

  // --- trade: sell surplus to someone short ---
  if (rand(state) < 0.35) {
    const goods = (Object.keys(n.netGoods) as (keyof typeof n.netGoods)[]).filter((g) => (n.netGoods[g] ?? 0) > 4 && n.stock[g] > 40);
    if (goods.length) {
      const g = goods[Math.floor(rand(state) * goods.length)];
      const buyers = state.nations.filter((o) => o.alive && o.id !== n.id && !atWar(state, n.id, o.id) && o.stock[g] < (o.reserve[g] ?? 0) && opinion(state, o.id, n.id) > -20);
      if (buyers.length) {
        const buyer = buyers[Math.floor(rand(state) * buyers.length)];
        const amount = Math.max(1, Math.round(Math.min((n.netGoods[g] ?? 0) * 0.5, 10)));
        const price = Math.round(state.prices[g] * 0.97 * 100) / 100;
        if (!buyer.isPlayer || rand(state) < 0.3) propose(state, n.id, buyer.id, [{ k: 'trade_sell', good: g, amount, price, years: 5 }]);
      }
    }
  }

  // --- maintain friendships, shed bad allies ---
  for (const ally of alliesOf(state, n.id)) {
    const op = opinion(state, n.id, ally);
    if (op < -25 && n.personality.loyalty < 0.35) {
      const pact = findPact(state, 'alliance', n.id, ally);
      if (pact) breakPact(state, n.id, pact);
    } else if (op < 40 && n.money > 1500 && rand(state) < 0.3) improveRelations(state, n.id, ally);
  }
  for (const pup of puppetsOf(state, n.id)) if (!canAnnexPuppet(state, n.id, pup) && n.money > 5000) annexPuppet(state, n.id, pup);
}

