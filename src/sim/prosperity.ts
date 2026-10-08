// The Prosperity Index: the score every nation is ranked on each month (see leaderboard.ts).
import { militaryStrength } from './military/units';
import { nationPop, neighborsOf, ownedProvinces } from './query';
import type { GameState, Nation } from './state';

export const PROSPERITY_WEIGHTS: Record<string, { label: string; weight: number; desc: string; how: string }> = {
  wealth: { label: 'Wealth per person', weight: 0.26, desc: 'GDP per capita relative to the richest nation', how: 'Raise GDP faster than your population grows: build Factories and Markets, research, keep taxes fair.' },
  economy: { label: 'Economic size', weight: 0.14, desc: 'Total GDP relative to the largest economy', how: 'Own more productive provinces: build Farms, Mines and Factories and conquer or annex land.' },
  wellbeing: { label: 'Wellbeing', weight: 0.15, desc: 'Average of happiness and stability', how: 'Keep happiness and stability up: stable taxes, consumer goods, institutions, and avoid long wars.' },
  population: { label: 'Population', weight: 0.08, desc: 'Population relative to the most populous nation', how: 'Hold more land and food; Farms and avoiding famine and war devastation grow people.' },
  technology: { label: 'Technology', weight: 0.1, desc: 'Technologies researched relative to the most advanced nation', how: 'Research more technologies: keep the Research tab busy and build Universities.' },
  trade: { label: 'Trade', weight: 0.08, desc: 'Trade volume relative to the biggest trader', how: 'Sell goods on the market and sign trade pacts; auto-trade counts.' },
  security: { label: 'Security', weight: 0.08, desc: 'Military strength versus neighbours', how: 'Keep an army at least ~70% as strong as your strongest neighbour (capped at 100).' },
  reputation: { label: 'Reputation', weight: 0.05, desc: 'Trustworthiness in the eyes of the world', how: 'Keep treaties, avoid surprise wars and insults; trust slowly recovers.' },
  climate: { label: 'Climate responsibility', weight: 0.06, desc: 'Fossil emissions per unit of GDP vs the world average, plus green investment', how: 'Cut emissions per GDP and fund green programmes.' },
};

/** Technologies counted for the relative technology score. */
function techScore(n: Nation): number {
  return n.tech.researched.length;
}

/** Net fossil emissions per day (gross minus abatement); 0 until the climate subsystem runs. */
function netEmissions(n: Nation): number {
  return Math.max(0, (n.emissions ?? 0) - (n.abated ?? 0));
}

export function computeProsperity(state: GameState): void {
  const alive = state.nations.filter((n) => n.alive);
  const stats = alive.map((n) => {
    const pop = Math.max(1, nationPop(state, n.id));
    const gdp = Math.max(1, n.gdp);
    return {
      n,
      pop,
      gdp: n.gdp,
      gdpPc: n.gdp / pop,
      strength: militaryStrength(state, n.id),
      intensity: netEmissions(n) / gdp,
      greenShare: Math.max(0, n.greenSpend ?? 0) / gdp,
    };
  });
  const max = (f: (s: (typeof stats)[number]) => number) => Math.max(1e-9, ...stats.map(f));
  const maxPc = max((s) => s.gdpPc);
  const maxGdp = max((s) => s.gdp);
  const maxPop = max((s) => s.pop);
  const maxTrade = max((s) => s.n.tradeVolume);
  const maxTech = Math.max(1, ...stats.map((s) => techScore(s.n)));
  const strengthOf = new Map(stats.map((s) => [s.n.id, s.strength]));
  // climate responsibility: the world-average emission intensity scores 50, clean scores 100, twice the average 0
  let worldEmissions = 0;
  let worldGdp = 0;
  for (const s of stats) {
    worldEmissions += netEmissions(s.n);
    worldGdp += Math.max(1, s.n.gdp);
  }
  const worldIntensity = worldGdp > 0 ? worldEmissions / worldGdp : 0;
  const maxGreen = Math.max(0, ...stats.map((s) => s.greenShare));

  for (const s of stats) {
    const n = s.n;
    n.militaryStrength = s.strength;
    let threat = 0;
    for (const nb of neighborsOf(state, n.id)) threat = Math.max(threat, strengthOf.get(nb) ?? 0);
    const security = threat <= 0 ? 100 : Math.min(100, (s.strength / threat) * 70);
    let fallout = 0;
    const owned = ownedProvinces(state, n.id);
    for (const pid of owned) if (state.provinces[pid].fallout > 0) fallout++;
    const emissionScore = worldIntensity <= 0 ? 100 : 100 * Math.max(0, Math.min(1, 1 - (0.5 * s.intensity) / worldIntensity));
    const greenScore = maxGreen <= 0 ? 0 : (100 * s.greenShare) / maxGreen;
    const parts: Record<string, number> = {
      wealth: (s.gdpPc / maxPc) * 100,
      economy: (s.gdp / maxGdp) * 100,
      wellbeing: (n.happiness + n.stability) / 2,
      population: (s.pop / maxPop) * 100,
      technology: (techScore(n) / maxTech) * 100,
      trade: (n.tradeVolume / maxTrade) * 100,
      security,
      reputation: n.trust,
      climate: 0.75 * emissionScore + 0.25 * greenScore,
    };
    let total = 0;
    for (const [k, v] of Object.entries(parts)) total += v * PROSPERITY_WEIGHTS[k].weight;
    // penalty: war exhaustion x0.12 plus up to 25 for the share of land with nuclear fallout
    const penalty = n.warExhaustion * 0.12 + (owned.length ? (fallout / owned.length) * 25 : 0);
    parts.penalty = -penalty;
    n.prosperity = Math.max(0, total - penalty);
    n.prosperityParts = parts;
  }
  for (const n of state.nations) if (!n.alive) n.prosperity = 0;
}

/** Living nations by prosperity, best first; ties go to the lower nation id. */
export function ranking(state: GameState): { nation: number; prosperity: number }[] {
  return state.nations
    .filter((n) => n.alive)
    .map((n) => ({ nation: n.id, prosperity: n.prosperity }))
    .sort((a, b) => b.prosperity - a.prosperity || a.nation - b.nation);
}

export const HISTORY_STEP = 90; // days between history points at the start of a game
export const HISTORY_MAX = 240; // points per nation before the spacing doubles

/**
 * Appends a history point for every living nation. Called when state.day is a multiple of
 * state.historyStep. When a history grows past HISTORY_MAX the step doubles and every nation keeps
 * only the points on the new grid, so histories span the whole game at a uniform, coarser spacing.
 */
export function recordHistory(state: GameState): void {
  let over = false;
  for (const n of state.nations) {
    if (!n.alive) continue;
    n.history.push({ day: state.day, prosperity: Math.round(n.prosperity * 10) / 10, gdp: Math.round(n.gdp) });
    if (n.history.length > HISTORY_MAX) over = true;
  }
  if (!over) return;
  state.historyStep *= 2;
  for (const n of state.nations) n.history = n.history.filter((h) => h.day % state.historyStep === 0);
}
