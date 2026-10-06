import { DIFFICULTY } from '../difficulty';
import { mod } from '../modifiers';
import { atWar, findPact, overlordOf } from '../query';
import type { GameState } from '../state';

export interface OpinionPart {
  label: string;
  value: number;
}

/** How `from` feels about `to`, with every contributing factor (for tooltips). */
export function opinionParts(state: GameState, from: number, to: number): OpinionPart[] {
  if (from === to) return [{ label: 'Self', value: 100 }];
  const parts: OpinionPart[] = [];
  parts.push({ label: 'Base relations', value: state.relations[from][to] });
  const A = state.nations[from];
  const B = state.nations[to];
  const grouped = new Map<string, number>();
  for (const m of state.opinion) {
    if (m.from === from && m.to === to) grouped.set(m.reason, (grouped.get(m.reason) ?? 0) + m.value);
  }
  for (const [label, value] of grouped) parts.push({ label, value });
  if (findPact(state, 'alliance', from, to)) parts.push({ label: 'Allies', value: 20 });
  if (findPact(state, 'nap', from, to)) parts.push({ label: 'Non-aggression pact', value: 5 });
  const trade = state.pacts.filter((p) => p.type === 'trade' && ((p.a === from && p.b === to) || (p.a === to && p.b === from)));
  if (trade.length) parts.push({ label: 'Trade partners', value: 6 * trade.length + mod(state, to, 'partnerRelations') });
  if (A.econSystem === B.econSystem) parts.push({ label: 'Same economic system', value: 6 });
  if (B.trust !== 60) parts.push({ label: `${B.name}'s trustworthiness`, value: Math.round((B.trust - 60) * 0.35) });
  parts.push({ label: 'Diplomatic influence', value: Math.round(mod(state, to, 'diplo') * 15) });
  if (atWar(state, from, to)) parts.push({ label: 'At war', value: -60 });
  const ov = overlordOf(state, from);
  if (ov === to) {
    const pact = findPact(state, 'puppet', to, from, true);
    parts.push({ label: 'Liberty desire', value: -Math.round((pact?.liberty ?? 0) * 0.4) });
  }
  return parts.filter((p) => Math.round(p.value) !== 0);
}

export function opinion(state: GameState, from: number, to: number): number {
  if (from === to) return 100;
  let v = 0;
  for (const p of opinionParts(state, from, to)) v += p.value;
  return Math.max(-100, Math.min(100, Math.round(v)));
}

/** Add an opinion modifier; repeated reasons stack up to `cap`. Decay is slowed by the difficulty's memory. */
export function addOpinion(state: GameState, from: number, to: number, value: number, reason: string, decay: number, cap = 200): void {
  if (from === to) return;
  const memory = DIFFICULTY[state.settings.difficulty].memory;
  const d = decay / memory;
  const existing = state.opinion.find((m) => m.from === from && m.to === to && m.reason === reason);
  if (existing) {
    existing.value = Math.max(-cap, Math.min(cap, existing.value + value));
    existing.decay = d;
  } else state.opinion.push({ from, to, value: Math.max(-cap, Math.min(cap, value)), decay: d, reason });
}

/** Everyone else's opinion of `target` changes. */
export function worldOpinion(state: GameState, target: number, value: number, reason: string, decay: number, except: number[] = []): void {
  for (const n of state.nations) {
    if (!n.alive || n.id === target || except.includes(n.id)) continue;
    addOpinion(state, n.id, target, value, reason, decay);
  }
}

export function opinionDay(state: GameState): void {
  for (const m of state.opinion) {
    if (m.value > 0) m.value = Math.max(0, m.value - m.decay);
    else m.value = Math.min(0, m.value + m.decay);
  }
  if (state.day % 30 === 0) state.opinion = state.opinion.filter((m) => Math.abs(m.value) >= 0.5 && state.nations[m.from].alive && state.nations[m.to].alive);
}

export function improveRelationsCost(state: GameState, from: number): number {
  return Math.round(80 * Math.pow(1.6, state.nations[from].era));
}

export function improveRelations(state: GameState, from: number, to: number): string | null {
  const n = state.nations[from];
  const cost = improveRelationsCost(state, from);
  if (n.money < cost) return `Need ${cost} money`;
  const existing = state.opinion.find((m) => m.from === to && m.to === from && m.reason === 'Diplomatic outreach');
  if (existing && existing.value >= 45) return 'Relations boost already at maximum';
  n.money -= cost;
  addOpinion(state, to, from, 12 * (1 + mod(state, from, 'diplo')), 'Diplomatic outreach', 0.03, 50);
  return null;
}

export function insult(state: GameState, from: number, to: number): void {
  addOpinion(state, to, from, -25, 'Insulted us', 0.04, 80);
}
