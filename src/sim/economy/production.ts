// Daily economy for one nation: logistics, production, population, money, happiness and stability.
import { BUILDINGS, MINE_OUTPUT } from '../../data/buildings';
import { erasFor } from '../../data/techs';
import { UNITS } from '../../data/units';
import { mod, mult } from '../modifiers';
import { hasTech, ownedProvinces, puppetsOf, overlordOf, nationPop } from '../query';
import { clickValue } from '../clicks';
import { privateImport } from './market';
import type { BuildingId, GameState, Good, Nation, Province } from '../state';

export const FOOD_PER_POP = 0.0125; // per thousand per day
const CONSUMER_PER_POP = 0.0018;
const SERVICES_PER_POP = 0.06;

export const FOOD_TERRAIN: Record<string, number> = { plains: 1.2, forest: 0.8, hills: 0.8, jungle: 0.9, desert: 0.5, tundra: 0.5, mountains: 0.4 };
const CAPACITY: Record<string, number> = { plains: 900, forest: 600, hills: 500, jungle: 500, desert: 220, tundra: 200, mountains: 260 };

const FACTORY_ORDER: BuildingId[] = ['refinery', 'steel_mill', 'munitions_plant', 'consumer_factory', 'vehicle_plant', 'electronics_plant'];

/** Land provinces reachable from the capital through territory the nation (or a friend) controls. */
export function computeConnected(state: GameState, n: Nation): Set<number> {
  const out = new Set<number>();
  const cap = state.provinces[n.capital];
  if (!cap || cap.controller !== n.id) return out;
  const stack = [n.capital];
  out.add(n.capital);
  while (stack.length) {
    const id = stack.pop()!;
    const p = state.provinces[id];
    for (const nb of p.neighbors) {
      if (out.has(nb)) continue;
      const q = state.provinces[nb];
      if (q.isSea) {
        // ports bridge the sea for logistics
        if ((p.buildings.port ?? 0) > 0) {
          for (const far of q.neighbors) {
            const f = state.provinces[far];
            if (!out.has(far) && !f.isSea && f.owner === n.id && f.controller === n.id && (f.buildings.port ?? 0) > 0) {
              out.add(far);
              stack.push(far);
            }
          }
        }
        continue;
      }
      if (q.owner === n.id && q.controller === n.id) {
        out.add(nb);
        stack.push(nb);
      }
    }
  }
  return out;
}

export function provinceEfficiency(p: Province, connected: boolean): number {
  let e = connected ? 0.85 + 0.06 * p.roads : 0.55;
  e *= 1 - p.devastation * 0.7;
  if (p.fallout > 0) e *= 0.4;
  e *= 1 - p.unrest / 250;
  return Math.max(0.05, e);
}

export function staffing(p: Province): number {
  let need = 0;
  for (const [b, lvl] of Object.entries(p.buildings)) need += BUILDINGS[b as BuildingId].workers * (lvl ?? 0);
  if (need <= 0) return 1;
  return Math.min(1, (p.pop * 0.55) / need);
}

export function provinceCapacity(p: Province, era: number): number {
  return (CAPACITY[p.terrain] ?? 300) * (p.area / 7) * (1 + 0.25 * (p.buildings.farm ?? 0) + 0.35 * era + 0.08 * p.roads) * (p.isCapital ? 2 : 1) * (1 - (p.fallout > 0 ? 0.5 : 0));
}

function add(rec: Record<string, number>, key: string, v: number) {
  rec[key] = (rec[key] ?? 0) + v;
}

export function nationEconomyDay(state: GameState, n: Nation): void {
  if (!n.alive) return;
  const ledger: Record<string, number> = {};
  const net: Partial<Record<Good, number>> = {};
  const prices = state.prices;
  const owned = ownedProvinces(state, n.id);
  const connected = computeConnected(state, n);
  n.connected = [...connected];

  const fFactory = mult(state, n.id, 'factory');
  const fRaw = mult(state, n.id, 'raw');
  const fFood = mult(state, n.id, 'food');
  const fConsumer = mult(state, n.id, 'consumer');
  const fMilitary = mult(state, n.id, 'military');
  const fServices = mult(state, n.id, 'services');
  const fTrade = mult(state, n.id, 'trade');
  const fUpkeep = mult(state, n.id, 'upkeep');

  let valueAdded = 0;
  let services = 0;
  let research = 2;
  let marketMoney = 0;
  let upkeep = 0;
  let adminLevels = 0;
  const totalPop = nationPop(state, n.id);

  const produce = (g: Good, amt: number) => {
    n.stock[g] += amt;
    net[g] = (net[g] ?? 0) + amt;
    valueAdded += amt * prices[g];
  };
  const consume = (g: Good, amt: number) => {
    n.stock[g] -= amt;
    net[g] = (net[g] ?? 0) - amt;
    valueAdded -= amt * prices[g];
  };

  for (const pid of owned) {
    const p = state.provinces[pid];
    for (const [b, lvl] of Object.entries(p.buildings)) upkeep += BUILDINGS[b as BuildingId].upkeep * (lvl ?? 0);
    if (p.controller !== n.id) continue; // occupied: produces nothing for us
    const eff = provinceEfficiency(p, connected.has(pid)) * staffing(p);
    const B = p.buildings;

    services += p.pop * SERVICES_PER_POP * (1 + 0.2 * n.era) * (0.6 + 0.4 * eff);

    if (B.farm) produce('food', B.farm * 3.5 * (FOOD_TERRAIN[p.terrain] ?? 0.6) * eff * fFood);
    if (B.sawmill) produce('wood', B.sawmill * 4 * eff * fRaw);
    if (B.mine && p.resource && MINE_OUTPUT[p.resource] > 0) {
      if (p.resource !== 'uranium' || hasTech(state, n.id, 'atomic_theory')) produce(p.resource, B.mine * MINE_OUTPUT[p.resource] * eff * fRaw);
    }
    if (B.oil_well && p.resource === 'oil') produce('oil', B.oil_well * 3 * eff * fRaw);

    let power = 1;
    if (B.power_plant) {
      const need = B.power_plant;
      const got = Math.min(need, Math.max(0, n.stock.coal));
      consume('coal', got);
      power += 0.2 * B.power_plant * (got / need);
    }

    for (const b of FACTORY_ORDER) {
      const lvl = B[b];
      if (!lvl) continue;
      const def = BUILDINGS[b];
      let ratio = lvl * eff;
      for (const [g, amt] of Object.entries(def.inputs ?? {})) {
        const need = (amt ?? 0) * lvl * eff;
        if (need > 0) ratio = Math.min(ratio, (Math.max(0, n.stock[g as Good]) / need) * lvl * eff);
      }
      if (ratio <= 0) continue;
      for (const [g, amt] of Object.entries(def.inputs ?? {})) consume(g as Good, (amt ?? 0) * ratio);
      for (const [g, amt] of Object.entries(def.outputs ?? {})) {
        let m = fFactory * power;
        if (g === 'consumer') m *= fConsumer;
        if (g === 'munitions' || g === 'vehicles') m *= fMilitary;
        produce(g as Good, (amt ?? 0) * ratio * m);
      }
    }

    if (B.university) research += B.university * 3 * eff;
    if (B.market_hall) {
      marketMoney += B.market_hall * (2 + p.roads) * Math.sqrt(p.pop / 400) * eff * fTrade;
    }
    if (B.admin_office) adminLevels += B.admin_office;
    if (B.port) marketMoney += B.port * 1.5 * eff * fTrade;
  }

  // --- research ---
  research += totalPop * 0.0012;
  research *= mult(state, n.id, 'research');
  n.research = research;

  // --- consumption ---
  // households first use domestic stock, then import privately (up to a share of demand)
  const foodNeed = totalPop * FOOD_PER_POP;
  const foodHave = Math.max(0, n.stock.food);
  const foodUsed = Math.min(foodNeed, foodHave);
  consume('food', foodUsed);
  const foodImports = Math.min(foodNeed - foodUsed, foodNeed * 0.35);
  privateImport('food', foodImports);
  n.foodShortage = foodUsed + foodImports < foodNeed * 0.98;
  const consNeed = totalPop * CONSUMER_PER_POP * (1 + 0.3 * n.era);
  const consHave = Math.max(0, n.stock.consumer);
  const consUsed = Math.min(consNeed, consHave);
  consume('consumer', consUsed);
  const consImports = Math.min(consNeed - consUsed, consNeed * 0.45);
  privateImport('consumer', consImports);
  n.consumerSat = consNeed > 0 ? (consUsed + consImports) / consNeed : 1;

  // --- automation clicks ---
  n.clicks.autoRate = Math.max(0, mod(state, n.id, 'autoClick') + adminLevels * 3);
  const autoMoney = n.clicks.autoRate * clickValue(state, n, false) * 0.6;

  // --- money ---
  services *= fServices;
  const gdp = Math.max(0, services + valueAdded + marketMoney);
  n.gdp = gdp;
  const taxEff = 0.6 * mult(state, n.id, 'tax') * (1 + adminLevels * 0.02) * (0.7 + 0.3 * (n.stability / 100));
  const taxes = (services + Math.max(0, valueAdded) * 0.4) * n.taxRate * taxEff;
  add(ledger, 'Taxes', taxes);
  add(ledger, 'Markets & ports', marketMoney);
  if (autoMoney > 0) add(ledger, 'Automation', autoMoney);
  add(ledger, 'Building upkeep', -upkeep * fUpkeep);

  // army upkeep
  let armyMoney = 0;
  for (const d of state.divisions) {
    if (d.owner !== n.id) continue;
    const u = UNITS[d.type];
    armyMoney += u.upkeep;
    for (const [g, amt] of Object.entries(u.upkeepGoods)) {
      const need = amt ?? 0;
      const have = Math.max(0, n.stock[g as Good]);
      const got = Math.min(need, have);
      n.stock[g as Good] -= got;
      net[g as Good] = (net[g as Good] ?? 0) - got;
      if (got < need * 0.9) d.org = Math.max(0, d.org - 0.01); // supply shortage
    }
  }
  if (armyMoney) add(ledger, 'Army upkeep', -armyMoney * fUpkeep);

  // puppets pay tribute
  const overlord = overlordOf(state, n.id);
  if (overlord >= 0) {
    const tribute = taxes * 0.2;
    add(ledger, 'Tribute to overlord', -tribute);
    state.nations[overlord].money += tribute;
    state.nations[overlord].ledger['Tribute from puppets'] = (state.nations[overlord].ledger['Tribute from puppets'] ?? 0) + tribute;
  }

  // debt service
  if (n.debt > 0) add(ledger, 'Debt interest', -(n.debt * 0.05) / 365);
  // hoarded cash erodes (inflation, graft): keeps treasuries from growing without bound
  const hoardCap = 2500 + Math.max(0, taxes) * 120;
  if (n.money > hoardCap) add(ledger, 'Inflation & graft', -(n.money - hoardCap) * 0.005);

  let total = 0;
  for (const v of Object.values(ledger)) total += v;
  n.money += total;
  // automatic borrowing keeps the lights on but hurts stability
  if (n.money < 0) {
    n.debt += -n.money;
    n.money = 0;
  } else if (n.debt > 0 && n.money > 500) {
    const pay = Math.min(n.debt, (n.money - 500) * 0.1);
    n.debt -= pay;
    n.money -= pay;
  }

  n.income = 0;
  n.expenses = 0;
  for (const v of Object.values(ledger)) {
    if (v > 0) n.income += v;
    else n.expenses -= v;
  }
  // keep tribute received (written by puppets earlier in the tick) visible
  const tribute = n.ledger['Tribute from puppets'];
  n.ledger = ledger;
  if (tribute && puppetsOf(state, n.id).length) n.ledger['Tribute from puppets'] = tribute;
  n.netGoods = net;

  for (const g of Object.keys(n.stock) as Good[]) if (n.stock[g] < 0) n.stock[g] = 0;

  populationDay(state, n, owned);
  moodDay(state, n);
  manpowerDay(state, n, totalPop);
}

function populationDay(state: GameState, n: Nation, owned: number[]): void {
  const fGrowth = mult(state, n.id, 'popGrowth');
  for (const pid of owned) {
    const p = state.provinces[pid];
    const cap = provinceCapacity(p, n.era);
    let g = 0.00006 * fGrowth * (0.5 + n.happiness / 100);
    if (n.foodShortage) g = -0.0002;
    if (p.fallout > 0) g -= 0.0001;
    const logistic = g > 0 ? g * (1 - p.pop / cap) : g;
    p.pop = Math.max(5, p.pop * (1 + logistic));
    if (p.devastation > 0) p.devastation = Math.max(0, p.devastation - 0.0015);
    if (p.fallout > 0) p.fallout--;
    // unrest follows low stability and foreign occupation
    const targetUnrest = Math.max(0, 50 - n.stability) * 1.5 + (p.controller !== p.owner ? 30 : 0);
    p.unrest += (targetUnrest - p.unrest) * 0.01;
  }
}

function moodDay(state: GameState, n: Nation): void {
  const atWarNow = state.wars.some((w) => w.attackers.includes(n.id) || w.defenders.includes(n.id));
  let happy = 55 + mod(state, n.id, 'happiness');
  happy += (n.consumerSat - 0.5) * 30;
  happy -= (n.taxRate - 0.25) * 90;
  if (n.foodShortage) happy -= 20;
  happy -= n.era * 2; // rising expectations
  n.happiness += (Math.max(0, Math.min(100, happy)) - n.happiness) * 0.02;

  let stab = 35 + n.happiness * 0.45 + mod(state, n.id, 'stability');
  if (atWarNow) stab -= 5;
  n.stability += (Math.max(0, Math.min(100, stab)) - n.stability) * 0.02;

  if (n.warExhaustion > 0 && !atWarNow) n.warExhaustion = Math.max(0, n.warExhaustion - 0.08);
  if (n.transition > 0) n.transition--;
  if (n.econSwitchCooldown > 0) n.econSwitchCooldown--;
  if (n.sabotageCooldown > 0) n.sabotageCooldown--;
  n.tempMods = n.tempMods.filter((t) => t.until > state.day);
  // trust slowly recovers toward 70 (diplomacy institution helps)
  const trustTarget = 70 + n.institutions.diplomacy * 2;
  if (n.trust < trustTarget) n.trust = Math.min(trustTarget, n.trust + 0.004 * mult(state, n.id, 'diplo'));
}

function manpowerDay(state: GameState, n: Nation, totalPop: number): void {
  const fMan = mult(state, n.id, 'manpower');
  const cap = totalPop * 0.04 * fMan;
  let barracks = 0;
  for (const pid of ownedProvinces(state, n.id)) barracks += state.provinces[pid].buildings.barracks ?? 0;
  const regen = totalPop * 0.00004 * fMan * (1 + 0.15 * barracks);
  n.manpower = Math.min(cap, n.manpower + regen);
}

export function eraName(era: number, mapId = 'random'): string {
  const eras = erasFor(mapId);
  return eras[Math.min(era, eras.length - 1)].name;
}

export function isAtWar(state: GameState, n: number): boolean {
  return state.wars.some((w) => w.attackers.includes(n) || w.defenders.includes(n));
}


