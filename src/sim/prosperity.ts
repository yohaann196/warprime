// The Prosperity Index (the score every nation competes on) and victory conditions.
import { TECHS } from '../data/techs';
import { militaryStrength } from './military/units';
import { alliesOf, log, nationPop, neighborsOf, ownedProvinces, puppetsOf } from './query';
import { yearOf, type GameState, type VictoryType } from './state';

export const PROSPERITY_WEIGHTS: Record<string, { label: string; weight: number; desc: string }> = {
  wealth: { label: 'Wealth per person', weight: 0.28, desc: 'GDP per capita relative to the richest nation' },
  economy: { label: 'Economic size', weight: 0.14, desc: 'Total GDP relative to the largest economy' },
  wellbeing: { label: 'Wellbeing', weight: 0.16, desc: 'Average of happiness and stability' },
  population: { label: 'Population', weight: 0.08, desc: 'Population relative to the most populous nation' },
  technology: { label: 'Technology', weight: 0.12, desc: 'Share of all technologies researched' },
  trade: { label: 'Trade', weight: 0.08, desc: 'Trade volume relative to the biggest trader' },
  security: { label: 'Security', weight: 0.08, desc: 'Military strength versus neighbours' },
  reputation: { label: 'Reputation', weight: 0.06, desc: 'Trustworthiness in the eyes of the world' },
};

export function computeProsperity(state: GameState): void {
  const alive = state.nations.filter((n) => n.alive);
  const stats = alive.map((n) => {
    const pop = Math.max(1, nationPop(state, n.id));
    return { n, pop, gdp: n.gdp, gdpPc: n.gdp / pop, strength: militaryStrength(state, n.id) };
  });
  const max = (f: (s: (typeof stats)[number]) => number) => Math.max(1e-9, ...stats.map(f));
  const maxPc = max((s) => s.gdpPc);
  const maxGdp = max((s) => s.gdp);
  const maxPop = max((s) => s.pop);
  const maxTrade = max((s) => s.n.tradeVolume);
  const strengthOf = new Map(stats.map((s) => [s.n.id, s.strength]));

  for (const s of stats) {
    const n = s.n;
    n.militaryStrength = s.strength;
    let threat = 0;
    for (const nb of neighborsOf(state, n.id)) threat = Math.max(threat, strengthOf.get(nb) ?? 0);
    const security = threat <= 0 ? 100 : Math.min(100, (s.strength / threat) * 70);
    let fallout = 0;
    const owned = ownedProvinces(state, n.id);
    for (const pid of owned) if (state.provinces[pid].fallout > 0) fallout++;
    const parts: Record<string, number> = {
      wealth: (s.gdpPc / maxPc) * 100,
      economy: (s.gdp / maxGdp) * 100,
      wellbeing: (n.happiness + n.stability) / 2,
      population: (s.pop / maxPop) * 100,
      technology: (n.tech.researched.length / TECHS.length) * 100,
      trade: (n.tradeVolume / maxTrade) * 100,
      security,
      reputation: n.trust,
    };
    let total = 0;
    for (const [k, v] of Object.entries(parts)) total += v * PROSPERITY_WEIGHTS[k].weight;
    const penalty = n.warExhaustion * 0.12 + (owned.length ? (fallout / owned.length) * 25 : 0);
    parts.penalty = -penalty;
    n.prosperity = Math.max(0, total - penalty);
    n.prosperityParts = parts;
  }
  for (const n of state.nations) if (!n.alive) n.prosperity = 0;
}

export function ranking(state: GameState): { nation: number; prosperity: number }[] {
  return state.nations
    .filter((n) => n.alive)
    .map((n) => ({ nation: n.id, prosperity: n.prosperity }))
    .sort((a, b) => b.prosperity - a.prosperity);
}

export const VICTORY_INFO: Record<VictoryType, { name: string; desc: string }> = {
  domination: { name: 'Domination', desc: 'Own 55% of all land provinces.' },
  hegemon: { name: 'Economic Hegemon', desc: 'From 1950: produce 35% of world GDP for 2 straight years.' },
  golden_age: { name: 'Golden Age', desc: 'From 1950: be #1 in prosperity with happiness and stability above 75 for 10 straight years.' },
  scientific: { name: 'Scientific', desc: 'Complete the Singularity Project.' },
  diplomatic: { name: 'Diplomatic', desc: 'From 1950: lead a bloc (you, allies and puppets) holding 65% of the world population.' },
  prosperity: { name: 'Most Prosperous', desc: 'Have the highest Prosperity Index when the era ends.' },
};

/** Runs monthly. Sets state.gameOver when someone wins (or the player is wiped out). */
export function checkVictory(state: GameState): void {
  if (state.gameOver) return;
  const land = state.provinces.filter((p) => !p.isSea).length;
  const worldGdp = state.nations.reduce((s, n) => s + (n.alive ? n.gdp : 0), 0) || 1;
  const worldPop = state.nations.reduce((s, n) => s + (n.alive ? nationPop(state, n.id) : 0), 0) || 1;
  const rank = ranking(state);
  const top = rank[0]?.nation ?? -1;

  const win = (winner: number, type: VictoryType) => {
    state.gameOver = { winner, type, day: state.day, ranking: ranking(state) };
    log(state, `${state.nations[winner].name} achieves a ${VICTORY_INFO[type].name} victory!`, winner === state.player ? 'good' : 'bad', [winner]);
  };

  if (state.player >= 0 && !state.nations[state.player].alive) {
    state.gameOver = { winner: top, type: 'defeat', day: state.day, ranking: rank };
    return;
  }

  for (const n of state.nations) {
    if (!n.alive) continue;
    if (ownedProvinces(state, n.id).length / land >= 0.55) return win(n.id, 'domination');
    if (n.tech.researched.includes('singularity_project')) return win(n.id, 'scientific');
    const lateGame = yearOf(state) >= 1950;
    if (n.gdp / worldGdp >= 0.35 && lateGame) n.daysHegemon += 30;
    else n.daysHegemon = 0;
    if (n.daysHegemon >= 730) return win(n.id, 'hegemon');
    if (lateGame && n.id === top && n.happiness >= 75 && n.stability >= 75) n.yearsGolden += 30;
    else n.yearsGolden = 0;
    if (n.yearsGolden >= 3650) return win(n.id, 'golden_age');
    const bloc = new Set([n.id, ...alliesOf(state, n.id), ...puppetsOf(state, n.id)]);
    let blocPop = 0;
    for (const b of bloc) blocPop += nationPop(state, b);
    if (lateGame && bloc.size > 1 && blocPop / worldPop >= 0.65 && n.id === rank.find((r) => bloc.has(r.nation))?.nation) return win(n.id, 'diplomatic');
  }

  if (yearOf(state) >= state.settings.endYear && top >= 0) win(top, 'prosperity');
}

export function recordHistory(state: GameState): void {
  for (const n of state.nations) {
    if (!n.alive) continue;
    n.history.push({ day: state.day, prosperity: Math.round(n.prosperity * 10) / 10, gdp: Math.round(n.gdp) });
    if (n.history.length > 400) n.history.shift();
  }
}
