// Global market: dynamic prices, automatic surplus selling / shortage buying, trade contracts and loans.
import { BASE_PRICES } from '../../data/buildings';
import { mod } from '../modifiers';
import { atWar, log } from '../query';
import { GOODS, type GameState, type Good, type Nation } from '../state';

const BASE_VOLUME = 40;

interface Flow {
  supply: Record<Good, number>;
  demand: Record<Good, number>;
}

let flow: Flow = freshFlow();

function freshFlow(): Flow {
  const supply = {} as Record<Good, number>;
  const demand = {} as Record<Good, number>;
  for (const g of GOODS) {
    supply[g] = 0;
    demand[g] = 0;
  }
  return { supply, demand };
}

/**
 * Share of export revenue that reaches the treasury. The rest is private income, which already
 * shows up in GDP and therefore in taxes. State-run economies keep more of it.
 */
export function stateShare(state: GameState, n: Nation): number {
  const sys = n.econSystem === 'planned' ? 0.2 : n.econSystem === 'war_economy' ? 0.1 : n.econSystem === 'mercantilism' ? 0.08 : 0;
  return Math.max(0.1, Math.min(0.6, 0.15 + sys + mod(state, n.id, 'trade') * 0.12));
}

/** Imports bought by households (not the treasury). They only move world prices. */
export function privateImport(g: Good, amount: number): void {
  if (amount > 0) flow.demand[g] += amount;
}

export function sellPrice(state: GameState, n: Nation, g: Good): number {
  return state.prices[g] * stateShare(state, n);
}

export function buyPrice(state: GameState, n: Nation, g: Good): number {
  return state.prices[g] * (1.12 - Math.min(0.08, mod(state, n.id, 'trade') * 0.05));
}

/** Sell goods on the world market. Returns money received. */
export function marketSell(state: GameState, n: Nation, g: Good, amount: number): number {
  const amt = Math.max(0, Math.min(amount, n.stock[g]));
  if (amt <= 0) return 0;
  const money = amt * sellPrice(state, n, g);
  n.stock[g] -= amt;
  n.money += money;
  flow.supply[g] += amt;
  n.tradeVolume += amt * state.prices[g];
  n.ledger['Market sales'] = (n.ledger['Market sales'] ?? 0) + money;
  return money;
}

/** Buy goods on the world market. Returns money spent. */
export function marketBuy(state: GameState, n: Nation, g: Good, amount: number): number {
  const price = buyPrice(state, n, g);
  const amt = Math.max(0, Math.min(amount, n.money / price));
  if (amt <= 0) return 0;
  const money = amt * price;
  n.stock[g] += amt;
  n.money -= money;
  flow.demand[g] += amt;
  n.tradeVolume += amt * state.prices[g];
  n.ledger['Market purchases'] = (n.ledger['Market purchases'] ?? 0) - money;
  return money;
}

/** Automatic trading: sell what is above the reserve, top up what is far below it. */
export function autoTrade(state: GameState, n: Nation): void {
  if (!n.autoTrade || !n.alive) return;
  for (const g of GOODS) {
    const reserve = n.reserve[g] ?? 0;
    const have = n.stock[g];
    if (have > reserve * 1.2 + 5) {
      marketSell(state, n, g, Math.min(have - reserve, 25 + have * 0.05));
    } else if (have < reserve * 0.5 && n.money > 200) {
      const want = Math.min(reserve - have, 20);
      const budget = n.money * 0.15;
      marketBuy(state, n, g, Math.min(want, budget / buyPrice(state, n, g)));
    }
  }
}

/** Once a day: move prices with net demand, mean-revert toward base. */
export function updatePrices(state: GameState): void {
  for (const g of GOODS) {
    const base = BASE_PRICES[g];
    const ratio = (flow.demand[g] + BASE_VOLUME) / (flow.supply[g] + BASE_VOLUME);
    const target = base * Math.pow(ratio, 0.6);
    let p = state.prices[g];
    p += (target - p) * 0.04;
    p += (base - p) * 0.003;
    state.prices[g] = Math.max(base * 0.3, Math.min(base * 4, p));
  }
  if (state.day % 30 === 0) {
    for (const g of GOODS) {
      const h = state.priceHistory[g];
      h.push(Math.round(state.prices[g] * 100) / 100);
      if (h.length > 60) h.shift();
    }
  }
  flow = freshFlow();
}

export function resetTradeVolume(state: GameState): void {
  if (state.day % 365 === 0) for (const n of state.nations) n.tradeVolume *= 0.5;
}

/** Trade contracts deliver goods daily; loans accrue interest and mature. */
export function contractsDay(state: GameState): void {
  for (const pact of [...state.pacts]) {
    if (pact.until >= 0 && pact.until <= state.day) {
      if (pact.type === 'loan') settleLoan(state, pact.a, pact.b, pact.amount ?? 0);
      state.pacts.splice(state.pacts.indexOf(pact), 1);
      continue;
    }
    if (pact.type === 'trade' && pact.good) {
      if (atWar(state, pact.a, pact.b)) continue; // frozen while at war
      const seller = state.nations[pact.a];
      const buyer = state.nations[pact.b];
      if (!seller.alive || !buyer.alive) continue;
      const amt = Math.min(pact.amount ?? 0, seller.stock[pact.good]);
      const cost = amt * (pact.price ?? state.prices[pact.good]);
      if (amt <= 0 || buyer.money < cost) continue;
      seller.stock[pact.good] -= amt;
      buyer.stock[pact.good] += amt;
      buyer.money -= cost;
      seller.money += cost * stateShare(state, seller);
      seller.tradeVolume += cost;
      buyer.tradeVolume += cost;
      seller.ledger['Trade contracts'] = (seller.ledger['Trade contracts'] ?? 0) + cost * stateShare(state, seller);
      buyer.ledger['Trade contracts'] = (buyer.ledger['Trade contracts'] ?? 0) - cost;
    } else if (pact.type === 'loan') {
      const borrower = state.nations[pact.b];
      const lender = state.nations[pact.a];
      const interest = ((pact.amount ?? 0) * (pact.interest ?? 0.05)) / 365;
      borrower.money -= interest;
      lender.money += interest;
    }
  }
}

function settleLoan(state: GameState, lender: number, borrower: number, amount: number): void {
  const b = state.nations[borrower];
  const l = state.nations[lender];
  if (!b.alive) return;
  if (b.money >= amount) {
    b.money -= amount;
    l.money += amount;
    log(state, `${b.name} repaid a loan of ${Math.round(amount)} to ${l.name}.`, 'econ', [lender, borrower]);
  } else {
    l.money += b.money;
    b.money = 0;
    b.trust = Math.max(0, b.trust - 15);
    state.opinion.push({ from: lender, to: borrower, value: -40, decay: 0.03, reason: 'Defaulted on a loan' });
    log(state, `${b.name} DEFAULTED on a loan from ${l.name}!`, 'bad', [lender, borrower]);
  }
}
