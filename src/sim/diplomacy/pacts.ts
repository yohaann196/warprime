// Alliances (incl. betrayal), pacts, puppets and the treaty desk.
import { militaryStrength } from '../military/units';
import { atWar, findPact, log, markDirty, neighborsOf, overlordOf, ownedProvinces, provinceValue, warsOf } from '../query';
import { rand } from '../rng';
import type { GameState, Good, Pact } from '../state';
import { addOpinion, opinion, worldOpinion } from './relations';
import { declareWar, transferProvince } from './war';

export type Clause =
  | { k: 'give_money'; amount: number }
  | { k: 'ask_money'; amount: number }
  | { k: 'give_goods'; good: Good; amount: number }
  | { k: 'ask_goods'; good: Good; amount: number }
  | { k: 'give_province'; province: number }
  | { k: 'ask_province'; province: number }
  | { k: 'alliance' }
  | { k: 'nap' }
  | { k: 'ask_access' }
  | { k: 'give_access' }
  | { k: 'trade_sell'; good: Good; amount: number; price: number; years: number }
  | { k: 'trade_buy'; good: Good; amount: number; price: number; years: number }
  | { k: 'loan_give'; amount: number; interest: number; years: number }
  | { k: 'loan_ask'; amount: number; interest: number; years: number }
  | { k: 'war_on'; nation: number };

export function clauseLabel(state: GameState, c: Clause): string {
  const N = (id: number) => state.nations[id]?.name ?? '?';
  switch (c.k) {
    case 'give_money': return `We give ${c.amount} money`;
    case 'ask_money': return `They give ${c.amount} money`;
    case 'give_goods': return `We give ${c.amount} ${c.good}`;
    case 'ask_goods': return `They give ${c.amount} ${c.good}`;
    case 'give_province': return `We cede ${state.provinces[c.province].name}`;
    case 'ask_province': return `They cede ${state.provinces[c.province].name}`;
    case 'alliance': return 'Military alliance';
    case 'nap': return 'Non-aggression pact (10 years)';
    case 'ask_access': return 'They grant us military access';
    case 'give_access': return 'We grant them military access';
    case 'trade_sell': return `We sell ${c.amount} ${c.good}/day at ${c.price} for ${c.years}y`;
    case 'trade_buy': return `We buy ${c.amount} ${c.good}/day at ${c.price} for ${c.years}y`;
    case 'loan_give': return `We lend ${c.amount} at ${Math.round(c.interest * 100)}% for ${c.years}y`;
    case 'loan_ask': return `They lend us ${c.amount} at ${Math.round(c.interest * 100)}% for ${c.years}y`;
    case 'war_on': return `They declare war on ${N(c.nation)}`;
  }
}

/** Ending a pact. Leaving an ally who is at war (or `treacherous`) is betrayal. */
export function breakPact(state: GameState, actor: number, pact: Pact, treacherous = false): void {
  const i = state.pacts.indexOf(pact);
  if (i < 0) return;
  const other = pact.a === actor ? pact.b : pact.a;
  const A = state.nations[actor];
  if (pact.type === 'puppet') {
    if (pact.b === actor) return; // subjects must fight for independence
    state.pacts.splice(i, 1);
    addOpinion(state, other, actor, 30, 'Granted us independence', 0.01);
    log(state, `${A.name} releases ${state.nations[other].name} from vassalage.`, 'diplo', [actor, other]);
    markDirty();
    return;
  }
  state.pacts.splice(i, 1);
  markDirty();
  if (pact.type === 'alliance') {
    const allyAtWar = warsOf(state, other).length > 0;
    if (treacherous || allyAtWar) {
      A.trust = Math.max(0, A.trust - 30);
      addOpinion(state, other, actor, -60, 'Betrayed our alliance', 0.01);
      worldOpinion(state, actor, -15, 'Betrayed an ally', 0.008, [other]);
      log(state, `BETRAYAL: ${A.name} breaks its alliance with ${state.nations[other].name}!`, 'bad', [actor, other]);
    } else {
      A.trust = Math.max(0, A.trust - 5);
      addOpinion(state, other, actor, -20, 'Cancelled our alliance', 0.02);
      log(state, `${A.name} ends its alliance with ${state.nations[other].name}.`, 'diplo', [actor, other]);
    }
  } else if (pact.type === 'nap') {
    A.trust = Math.max(0, A.trust - 8);
    addOpinion(state, other, actor, -15, 'Cancelled a non-aggression pact', 0.02);
  } else if (pact.type === 'loan') {
    // cancelling a loan as the lender calls it in early
    if (pact.a === actor) addOpinion(state, other, actor, -10, 'Called in a loan', 0.03);
  } else {
    addOpinion(state, other, actor, -5, 'Cancelled an agreement', 0.05);
  }
}

// --------------------------------------------------------------------------------------------
// AI evaluation of treaties. Positive = good for `to`. Units are "goodwill points".
// --------------------------------------------------------------------------------------------

export interface Evaluation {
  value: number;
  reasons: { label: string; value: number }[];
}

function threatTo(state: GameState, nation: number): number {
  // strongest hostile-ish neighbour's strength relative to ours
  const mine = Math.max(1, militaryStrength(state, nation));
  let worst = 0;
  for (const nb of neighborsOf(state, nation)) {
    if (opinion(state, nation, nb) > 20) continue;
    worst = Math.max(worst, militaryStrength(state, nb) / mine);
  }
  return worst;
}

export function evaluateTreaty(state: GameState, from: number, to: number, clauses: Clause[]): Evaluation {
  const T = state.nations[to];
  const F = state.nations[from];
  const reasons: { label: string; value: number }[] = [];
  const add = (label: string, value: number) => reasons.push({ label, value: Math.round(value) });
  const op = opinion(state, to, from);
  add('Their opinion of us', op * 0.25);
  add('Our trustworthiness', (F.trust - 50) * 0.2);
  const greed = 1 + T.personality.greed;
  const scale = Math.max(40, T.income * 8); // money matters less to rich nations

  for (const c of clauses) {
    switch (c.k) {
      case 'give_money':
        add(`Gift of ${c.amount}`, (c.amount / scale) * 4 * greed);
        break;
      case 'ask_money':
        if (T.money < c.amount) add('They cannot afford it', -999);
        else add(`Paying ${c.amount}`, -(c.amount / scale) * 5 * greed);
        break;
      case 'give_goods':
        add(`${c.amount} ${c.good}`, ((c.amount * state.prices[c.good]) / scale) * 4 * greed);
        break;
      case 'ask_goods':
        if (T.stock[c.good] < c.amount) add('They do not have the goods', -999);
        else add(`Giving ${c.amount} ${c.good}`, -((c.amount * state.prices[c.good]) / scale) * 5 * greed);
        break;
      case 'give_province': {
        const p = state.provinces[c.province];
        if (p.owner !== from) add('Not ours to give', -999);
        else add(`Gaining ${p.name}`, provinceValue(state, c.province) * 0.8);
        break;
      }
      case 'ask_province': {
        const p = state.provinces[c.province];
        if (p.owner !== to) add('Not theirs', -999);
        else if (p.isCapital) add('Never their capital', -999);
        else {
          let v = -provinceValue(state, c.province) * 4;
          if (overlordOf(state, to) === from) {
            v *= 0.5; // puppets comply more readily, but it costs liberty
          }
          add(`Losing ${p.name}`, v);
        }
        break;
      }
      case 'alliance': {
        if (findPact(state, 'alliance', from, to)) {
          add('Already allied', -999);
          break;
        }
        if (atWar(state, from, to)) {
          add('We are at war', -999);
          break;
        }
        add('Alliance (needs friendship)', (op - 30) * 0.9);
        const threat = threatTo(state, to);
        if (threat > 1.1) add('They feel threatened', Math.min(30, (threat - 1) * 25));
        const ourStrength = militaryStrength(state, from) / Math.max(1, militaryStrength(state, to));
        add('Our military weight', Math.min(15, (ourStrength - 0.5) * 10));
        if (warsOf(state, from).length) add('We are at war — they would be dragged in', -20 * (1.2 - T.personality.loyalty));
        if (F.trust < 40) add('We are untrustworthy', -(40 - F.trust));
        break;
      }
      case 'nap': {
        if (findPact(state, 'nap', from, to)) {
          add('Already have one', -999);
          break;
        }
        const ratio = militaryStrength(state, from) / Math.max(1, militaryStrength(state, to));
        add('Non-aggression pact', 4 + (ratio > 1.2 ? 10 : 0) - T.personality.aggression * 12);
        break;
      }
      case 'ask_access':
        add('Grant military access', -12 + op * 0.25);
        break;
      case 'give_access':
        add('Receive military access', 3);
        break;
      case 'trade_sell': {
        const market = state.prices[c.good] * 1.1;
        const daily = c.amount * (market - c.price);
        add(`Buying ${c.good} below market`, (daily * 365 * c.years) / (scale * 40) * 10);
        if (T.stock[c.good] < (T.reserve[c.good] ?? 0)) add(`They need ${c.good}`, 6);
        if (T.money < c.amount * c.price * 30) add('Cannot afford the deliveries', -30);
        break;
      }
      case 'trade_buy': {
        const market = state.prices[c.good] * 0.9;
        const daily = c.amount * (c.price - market);
        add(`Selling ${c.good} above market`, (daily * 365 * c.years) / (scale * 40) * 10);
        const surplus = (T.netGoods[c.good] ?? 0) - c.amount;
        add(surplus >= 0 ? 'They have a surplus' : 'They would run short', surplus >= 0 ? 5 : -25);
        break;
      }
      case 'loan_give':
        add(`Receiving a loan of ${c.amount}`, (c.amount / scale) * 2 - c.interest * 100 * 0.6 * c.years * (c.amount / scale));
        break;
      case 'loan_ask':
        if (T.money < c.amount * 1.3) add('They lack the funds', -999);
        else add(`Lending ${c.amount}`, -(c.amount / scale) * 3 + c.interest * 100 * 0.5 * c.years * (c.amount / scale) + (F.trust - 50) * 0.3);
        break;
      case 'war_on': {
        if (c.nation === to || c.nation === from) {
          add('Invalid target', -999);
          break;
        }
        if (findPact(state, 'alliance', to, c.nation)) {
          add('They are allied to the target', -999);
          break;
        }
        const o = opinion(state, to, c.nation);
        const ratio = (militaryStrength(state, to) + militaryStrength(state, from) * 0.6) / Math.max(1, militaryStrength(state, c.nation));
        add(`Their opinion of ${state.nations[c.nation].name}`, -o * 0.6);
        add('Odds of victory', (ratio - 1) * 25);
        add('Appetite for war', T.personality.aggression * 20 - 25);
        if (warsOf(state, to).length) add('Already fighting', -30);
        break;
      }
    }
  }
  let value = 0;
  for (const r of reasons) value += r.value;
  return { value, reasons };
}

export function validateClauses(state: GameState, from: number, to: number, clauses: Clause[]): string | null {
  const F = state.nations[from];
  if (!clauses.length) return 'Add at least one clause';
  if (!state.nations[to].alive) return 'That nation no longer exists';
  for (const c of clauses) {
    if (c.k === 'give_money' && F.money < c.amount) return 'Not enough money';
    if (c.k === 'give_goods' && F.stock[c.good] < c.amount) return `Not enough ${c.good}`;
    if (c.k === 'give_province' && state.provinces[c.province].owner !== from) return 'Not your province';
    if (c.k === 'loan_give' && F.money < c.amount) return 'Not enough money to lend';
    if ((c.k === 'trade_sell' || c.k === 'trade_buy') && (c.amount <= 0 || c.price <= 0 || c.years <= 0)) return 'Invalid trade terms';
  }
  return null;
}

export function applyTreaty(state: GameState, from: number, to: number, clauses: Clause[]): void {
  const F = state.nations[from];
  const T = state.nations[to];
  const day = state.day;
  for (const c of clauses) {
    switch (c.k) {
      case 'give_money': F.money -= c.amount; T.money += c.amount; break;
      case 'ask_money': T.money -= c.amount; F.money += c.amount; break;
      case 'give_goods': F.stock[c.good] -= c.amount; T.stock[c.good] += c.amount; break;
      case 'ask_goods': T.stock[c.good] -= c.amount; F.stock[c.good] += c.amount; break;
      case 'give_province': transferProvince(state, c.province, to); break;
      case 'ask_province': {
        const puppet = findPact(state, 'puppet', from, to, true);
        if (puppet) puppet.liberty = Math.min(100, (puppet.liberty ?? 0) + provinceValue(state, c.province) * 0.8);
        transferProvince(state, c.province, from);
        break;
      }
      case 'alliance': state.pacts.push({ id: state.nextId++, type: 'alliance', a: from, b: to, start: day, until: -1 }); break;
      case 'nap': state.pacts.push({ id: state.nextId++, type: 'nap', a: from, b: to, start: day, until: day + 3650 }); break;
      case 'ask_access': state.pacts.push({ id: state.nextId++, type: 'access', a: to, b: from, start: day, until: day + 1825 }); break;
      case 'give_access': state.pacts.push({ id: state.nextId++, type: 'access', a: from, b: to, start: day, until: day + 1825 }); break;
      case 'trade_sell': state.pacts.push({ id: state.nextId++, type: 'trade', a: from, b: to, good: c.good, amount: c.amount, price: c.price, start: day, until: day + c.years * 365 }); break;
      case 'trade_buy': state.pacts.push({ id: state.nextId++, type: 'trade', a: to, b: from, good: c.good, amount: c.amount, price: c.price, start: day, until: day + c.years * 365 }); break;
      case 'loan_give': F.money -= c.amount; T.money += c.amount; state.pacts.push({ id: state.nextId++, type: 'loan', a: from, b: to, amount: c.amount, interest: c.interest, start: day, until: day + c.years * 365 }); break;
      case 'loan_ask': T.money -= c.amount; F.money += c.amount; state.pacts.push({ id: state.nextId++, type: 'loan', a: to, b: from, amount: c.amount, interest: c.interest, start: day, until: day + c.years * 365 }); break;
      case 'war_on': declareWar(state, to, c.nation); break;
    }
  }
  addOpinion(state, to, from, 5, 'Recent agreement', 0.05, 20);
  addOpinion(state, from, to, 5, 'Recent agreement', 0.05, 20);
  markDirty();
}

/** Propose a treaty. AI nations decide immediately. Returns the evaluation and whether it was accepted. */
export function proposeTreaty(state: GameState, from: number, to: number, clauses: Clause[]): { accepted: boolean; evaluation: Evaluation; error?: string } {
  const err = validateClauses(state, from, to, clauses);
  const evaluation = evaluateTreaty(state, from, to, clauses);
  if (err) return { accepted: false, evaluation, error: err };
  const accepted = evaluation.value > 0;
  if (accepted) {
    applyTreaty(state, from, to, clauses);
    log(state, `${state.nations[to].name} accepts a treaty with ${state.nations[from].name}: ${clauses.map((c) => clauseLabel(state, c)).join('; ')}.`, 'diplo', [from, to]);
  }
  return { accepted, evaluation };
}

// --------------------------------------------------------------------------------------------
// Puppets
// --------------------------------------------------------------------------------------------

export function puppetsDay(state: GameState): void {
  for (const pact of [...state.pacts]) {
    if (pact.type !== 'puppet') continue;
    const over = state.nations[pact.a];
    const sub = state.nations[pact.b];
    if (!over.alive || !sub.alive) {
      state.pacts.splice(state.pacts.indexOf(pact), 1);
      continue;
    }
    const ratio = militaryStrength(state, pact.b) / Math.max(1, militaryStrength(state, pact.a));
    const op = opinion(state, pact.b, pact.a);
    pact.liberty = Math.max(0, Math.min(100, (pact.liberty ?? 0) + 0.012 + ratio * 0.02 - Math.max(0, op) * 0.0004));
    if ((pact.liberty ?? 0) >= 100 && rand(state) < 0.01) {
      state.pacts.splice(state.pacts.indexOf(pact), 1);
      markDirty();
      log(state, `${sub.name} rises up for independence from ${over.name}!`, 'war', [pact.a, pact.b]);
      declareWar(state, pact.b, pact.a);
    }
  }
}

export function canAnnexPuppet(state: GameState, overlord: number, puppet: number): string | null {
  const pact = findPact(state, 'puppet', overlord, puppet, true);
  if (!pact) return 'Not your puppet';
  if (state.day - pact.start < 3650) return `Needs 10 years as a puppet (${Math.ceil((3650 - (state.day - pact.start)) / 365)} left)`;
  if ((pact.liberty ?? 0) > 50) return 'Liberty desire must be below 50';
  if (atWar(state, overlord, puppet)) return 'At war';
  const cost = annexCost(state, puppet);
  if (state.nations[overlord].money < cost) return `Need ${cost} money`;
  return null;
}

export function annexCost(state: GameState, puppet: number): number {
  return Math.round(400 + state.nations[puppet].income * 200);
}

export function annexPuppet(state: GameState, overlord: number, puppet: number): string | null {
  const why = canAnnexPuppet(state, overlord, puppet);
  if (why) return why;
  state.nations[overlord].money -= annexCost(state, puppet);
  const pact = findPact(state, 'puppet', overlord, puppet, true)!;
  state.pacts.splice(state.pacts.indexOf(pact), 1);
  for (const d of state.divisions) if (d.owner === puppet) d.owner = overlord;
  for (const pid of [...ownedProvinces(state, puppet)]) transferProvince(state, pid, overlord);
  markDirty();
  log(state, `${state.nations[overlord].name} peacefully integrates ${state.nations[puppet].name}.`, 'diplo', [overlord, puppet]);
  return null;
}

