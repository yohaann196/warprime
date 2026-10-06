// The clicker layer: work clicks, construction clicks, research clicks, battle clicks and automation.
import { mult } from './modifiers';
import type { GameState, Good, Nation } from './state';

export const CLICK_HEAT_SCALE = 30; // heat at which a click is worth half
export const MAX_COMBO = 50;

export function upgradeCost(n: Nation): number {
  return Math.round(150 * Math.pow(1.7, n.clicks.upgrades) * Math.pow(1.3, n.era));
}

/** Value of one click. Manual clicks get combo bonus and heat penalty; automated ones do not.
 * Economic clicks (work, research) grow with the size of the economy so they stay relevant. */
export function clickValue(state: GameState, n: Nation, manual = true, economic = true): number {
  const scale = economic ? Math.sqrt(Math.max(1, n.gdp / 150)) : 1;
  let v = n.clicks.power * scale * mult(state, n.id, 'clickPower');
  if (manual) {
    v *= 1 + Math.min(MAX_COMBO, n.clicks.combo) * 0.01;
    v *= heatEfficiency(n);
  }
  return v;
}

export function heatEfficiency(n: Nation): number {
  return 1 / (1 + n.clicks.heat / CLICK_HEAT_SCALE);
}

function registerClick(state: GameState, n: Nation, economic = true): { value: number; crit: boolean } {
  let value = clickValue(state, n, true, economic);
  const r = ((state.day * 7919 + n.clicks.totalClicks * 104729) % 1000) / 1000; // cheap deterministic roll
  const crit = r < 0.05;
  if (crit) value *= 5;
  n.clicks.heat += 1;
  n.clicks.combo = Math.min(MAX_COMBO, n.clicks.combo + 1);
  n.clicks.totalClicks++;
  return { value, crit };
}

export interface ClickResult {
  money: number;
  good?: Good;
  amount?: number;
  crit: boolean;
  text: string;
}

/** Clicking one of your own provinces: immediate money plus a burst of whatever the province makes. */
export function workClick(state: GameState, n: Nation, provinceId: number): ClickResult | null {
  const p = state.provinces[provinceId];
  if (!p || p.owner !== n.id || p.controller !== n.id) return null;
  const { value, crit } = registerClick(state, n);
  const popFactor = 0.6 + Math.min(2, Math.sqrt(p.pop / 400)) * 0.4;
  const money = value * 3 * popFactor;
  n.money += money;
  let good: Good | undefined;
  if (p.resource && p.buildings.mine) good = p.resource;
  else if (p.resource === 'oil' && p.buildings.oil_well) good = 'oil';
  else if (p.buildings.steel_mill) good = 'steel';
  else if (p.buildings.sawmill) good = 'wood';
  else if (p.buildings.farm) good = 'food';
  let amount = 0;
  if (good) {
    amount = value * (good === 'uranium' || good === 'rare' || good === 'steel' ? 0.3 : 1);
    n.stock[good] += amount;
  }
  return { money, good, amount, crit, text: `+${fmt(money)}${good ? ` +${fmt(amount)} ${good}` : ''}${crit ? ' CRIT!' : ''}` };
}

export function buildClick(state: GameState, n: Nation, provinceId: number): ClickResult | null {
  const p = state.provinces[provinceId];
  if (!p || p.owner !== n.id || !p.construction) return null;
  const { value, crit } = registerClick(state, n, false);
  const work = value * 0.6;
  p.construction.progress += work;
  return { money: 0, crit, text: `+${fmt(work)} build${crit ? ' CRIT!' : ''}` };
}

export function researchClick(state: GameState, n: Nation): ClickResult | null {
  if (!n.tech.current) return null;
  const { value, crit } = registerClick(state, n);
  const pts = value * 1.2;
  n.tech.progress += pts;
  return { money: 0, crit, text: `+${fmt(pts)} research${crit ? ' CRIT!' : ''}` };
}

/** Clicking a contested province adds pressure: boosts your side's damage and siege progress there. */
export function battleClick(state: GameState, n: Nation, provinceId: number): ClickResult | null {
  const p = state.provinces[provinceId];
  if (!p) return null;
  const { value, crit } = registerClick(state, n, false);
  const boost = value * 0.04;
  p.clickBoost = Math.min(1.5, (p.clickBoost ?? 0) + boost);
  p.clickBoostBy = n.id;
  return { money: 0, crit, text: `⚔ +${Math.round(boost * 100)}% push${crit ? ' CRIT!' : ''}` };
}

/** Called every tick: heat cools down, combo fades. */
export function coolClicks(n: Nation): void {
  n.clicks.heat *= 0.85;
  if (n.clicks.heat < 0.01) n.clicks.heat = 0;
  n.clicks.combo *= 0.8;
  if (n.clicks.combo < 0.5) n.clicks.combo = 0;
}

export function fmt(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (a >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (a >= 1e4) return (v / 1e3).toFixed(1) + 'k';
  if (a >= 100) return Math.round(v).toString();
  if (a >= 10) return v.toFixed(1);
  return v.toFixed(2);
}
