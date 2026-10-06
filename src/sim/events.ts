// Random national events with choices. The player picks; AI nations choose automatically.
import type { GameEvent, GameState, Nation, Resource } from './state';
import type { ModKey } from '../data/modifiers';
import { rand } from './rng';
import { log, ownedProvinces, warsOf, neighborsOf } from './query';
import { invalidateMods } from './modifiers';
import { joinWar, refuseCall, aiAcceptsTerms, makePeace, type PeaceTerms } from './diplomacy/war';
import { applyTreaty, clauseLabel, type Clause } from './diplomacy/pacts';
import { addOpinion } from './diplomacy/relations';

export interface EventOption {
  label: string;
  desc: string;
  effect: (state: GameState, n: Nation, ev: GameEvent) => void;
}

export interface EventDef {
  id: string;
  title: string;
  icon: string;
  text: (state: GameState, n: Nation, ev: GameEvent) => string;
  weight: (state: GameState, n: Nation) => number; // 0 = never randomly
  options: EventOption[];
}

function temp(state: GameState, n: Nation, key: ModKey, value: number, days: number, reason: string): void {
  n.tempMods.push({ key, value, until: state.day + days, reason });
  invalidateMods();
}

function randomOwned(state: GameState, n: Nation, filter: (pid: number) => boolean = () => true): number {
  const owned = ownedProvinces(state, n.id).filter(filter);
  if (!owned.length) return n.capital;
  return owned[Math.floor(rand(state) * owned.length)];
}

export const EVENTS: EventDef[] = [
  {
    id: 'boom', title: 'Economic Boom', icon: '📈',
    text: () => 'Investors are euphoric and factories run around the clock. How do we ride the wave?',
    weight: (_s, n) => (n.econSystem === 'free_market' ? 3 : 1) * (n.stability > 50 ? 1 : 0.3),
    options: [
      { label: 'Let it run', desc: '+20% service economy for 1 year', effect: (s, n) => temp(s, n, 'services', 0.2, 365, 'Economic boom') },
      { label: 'Bank the windfall', desc: 'Gain 90 days of income', effect: (_s, n) => { n.money += n.income * 90; } },
    ],
  },
  {
    id: 'recession', title: 'Recession', icon: '📉',
    text: () => 'Credit has dried up and unemployment is climbing.',
    weight: (_s, n) => (n.econSystem === 'free_market' ? 3 : n.econSystem === 'planned' ? 0.5 : 1),
    options: [
      { label: 'Stimulus package', desc: 'Pay 90 days of income, avoid the downturn', effect: (_s, n) => { n.money -= n.income * 90; } },
      { label: 'Austerity', desc: '-15% service economy and -8 happiness for 1 year', effect: (s, n) => { temp(s, n, 'services', -0.15, 365, 'Recession'); temp(s, n, 'happiness', -8, 365, 'Austerity'); } },
    ],
  },
  {
    id: 'strike', title: 'General Strike', icon: '✊',
    text: () => 'Workers have downed tools across the country, demanding better pay.',
    weight: (_s, n) => (n.happiness < 45 ? 3 : 0.3) * (n.econSystem === 'planned' ? 1.5 : 1),
    options: [
      { label: 'Concede', desc: 'Taxes −5 points, +10 happiness for 1 year', effect: (s, n) => { n.taxRate = Math.max(0, n.taxRate - 0.05); temp(s, n, 'happiness', 10, 365, 'Strike settlement'); } },
      { label: 'Break the strike', desc: '−12 stability for 1 year, −20% factory output for 3 months', effect: (s, n) => { temp(s, n, 'stability', -12, 365, 'Broken strike'); temp(s, n, 'factory', -0.2, 90, 'Strike'); } },
    ],
  },
  {
    id: 'breakthrough', title: 'Scientific Breakthrough', icon: '💡',
    text: () => 'Our scientists report an astonishing discovery.',
    weight: (_s, n) => 1 + n.institutions.science * 0.3,
    options: [
      { label: 'Fund it fully', desc: '+25% research for 2 years (costs 300)', effect: (s, n) => { n.money -= 300; temp(s, n, 'research', 0.25, 730, 'Breakthrough'); } },
      { label: 'Publish and move on', desc: 'Instant research progress', effect: (_s, n) => { n.tech.progress += n.research * 60; } },
    ],
  },
  {
    id: 'discovery', title: 'Mineral Discovery', icon: '⛏️',
    text: (s, _n, ev) => `Prospectors have found a rich deposit in ${s.provinces[ev.province ?? 0].name}!`,
    weight: (s, n) => (ownedProvinces(s, n.id).some((pid) => !s.provinces[pid].resource) ? 1 : 0),
    options: [
      {
        label: 'Excellent!', desc: 'The province gains a natural resource',
        effect: (s, _n, ev) => {
          const p = s.provinces[ev.province ?? 0];
          const pool: Resource[] = ['iron', 'coal', 'oil', 'rare', 'uranium'];
          p.resource = pool[Math.floor(rand(s) * pool.length)];
          log(s, `${p.name} now has ${p.resource}.`, 'econ', [p.owner]);
        },
      },
    ],
  },
  {
    id: 'disaster', title: 'Natural Disaster', icon: '🌋',
    text: (s, _n, ev) => `A devastating ${['earthquake', 'flood', 'wildfire', 'hurricane'][s.day % 4]} has struck ${s.provinces[ev.province ?? 0].name}.`,
    weight: () => 1,
    options: [
      { label: 'Send relief', desc: 'Costs 250, limits the damage', effect: (s, n, ev) => { n.money -= 250; s.provinces[ev.province ?? 0].devastation = Math.min(1, s.provinces[ev.province ?? 0].devastation + 0.1); } },
      { label: 'They must cope', desc: 'Heavy devastation and unrest there', effect: (s, _n, ev) => { const p = s.provinces[ev.province ?? 0]; p.devastation = Math.min(1, p.devastation + 0.45); p.unrest = Math.min(100, p.unrest + 30); p.pop *= 0.97; } },
    ],
  },
  {
    id: 'refugees', title: 'Refugees at the Border', icon: '🧳',
    text: () => 'Thousands flee a war next door and ask for shelter.',
    weight: (s, n) => (neighborsOf(s, n.id).some((nb) => warsOf(s, nb).length > 0) ? 2 : 0),
    options: [
      { label: 'Welcome them', desc: '+population in the capital, −4 happiness for 6 months', effect: (s, n) => { s.provinces[n.capital].pop += 60; temp(s, n, 'happiness', -4, 180, 'Refugee strain'); } },
      { label: 'Close the border', desc: '−5 trustworthiness', effect: (_s, n) => { n.trust = Math.max(0, n.trust - 5); } },
    ],
  },
  {
    id: 'corruption', title: 'Corruption Scandal', icon: '🕵️',
    text: () => 'A minister has been caught with his hand in the treasury.',
    weight: (_s, n) => (n.institutions.bureaucracy < 3 ? 2 : 0.5),
    options: [
      { label: 'Purge the ministry', desc: '−8 stability for 6 months, then +10% tax efficiency for 2 years', effect: (s, n) => { temp(s, n, 'stability', -8, 180, 'Purge'); temp(s, n, 'tax', 0.1, 730, 'Clean government'); } },
      { label: 'Cover it up', desc: '−8 trustworthiness, keep calm', effect: (_s, n) => { n.trust = Math.max(0, n.trust - 8); } },
    ],
  },
  {
    id: 'inventor', title: 'A Brilliant Inventor', icon: '🔧',
    text: () => 'A tinkerer has built a machine that multiplies the work of every pair of hands.',
    weight: () => 0.7,
    options: [
      { label: 'Fund the workshop', desc: 'Free click-power upgrade', effect: (_s, n) => { n.clicks.upgrades++; n.clicks.power += 0.6; } },
      { label: 'Sell the patent', desc: '+400 money', effect: (_s, n) => { n.money += 400; } },
    ],
  },
  {
    id: 'separatists', title: 'Separatist Movement', icon: '🏴',
    text: (s, _n, ev) => `Separatists in ${s.provinces[ev.province ?? 0].name} demand autonomy.`,
    weight: (_s, n) => (n.stability < 35 ? 3 : 0),
    options: [
      { label: 'Negotiate', desc: 'Costs 400, unrest falls', effect: (s, n, ev) => { n.money -= 400; s.provinces[ev.province ?? 0].unrest = 0; } },
      { label: 'Crack down', desc: '−6 happiness for 1 year, unrest rises', effect: (s, n, ev) => { temp(s, n, 'happiness', -6, 365, 'Crackdown'); const p = s.provinces[ev.province ?? 0]; p.unrest = Math.min(100, p.unrest + 25); } },
    ],
  },
  {
    id: 'harvest', title: 'Bumper Harvest', icon: '🌽',
    text: () => 'The granaries are overflowing.',
    weight: () => 1,
    options: [{ label: 'Wonderful', desc: '+ food stockpile', effect: (s, n) => { n.stock.food += 30 + ownedProvinces(s, n.id).length * 6; } }],
  },
  {
    id: 'investment', title: 'Foreign Investment', icon: '💼',
    text: () => 'International financiers want to invest in our country.',
    weight: (_s, n) => (n.trust > 60 ? 1.5 : 0.2),
    options: [
      { label: 'Accept', desc: '+600 money, +10% factory output for 1 year', effect: (s, n) => { n.money += 600; temp(s, n, 'factory', 0.1, 365, 'Foreign investment'); } },
      { label: 'Decline', desc: '+5 stability for 1 year', effect: (s, n) => temp(s, n, 'stability', 5, 365, 'Economic sovereignty') },
    ],
  },
  {
    id: 'pandemic', title: 'Pandemic', icon: '🦠',
    text: () => 'A new disease is spreading rapidly.',
    weight: (_s, n) => (n.era >= 1 ? 0.6 : 0.2),
    options: [
      { label: 'Lockdown', desc: '−25% service economy for 6 months', effect: (s, n) => temp(s, n, 'services', -0.25, 180, 'Lockdown') },
      { label: 'Keep calm and carry on', desc: '−3% population everywhere', effect: (s, n) => { for (const pid of ownedProvinces(s, n.id)) s.provinces[pid].pop *= 0.97; } },
    ],
  },
  {
    id: 'jubilee', title: 'National Jubilee', icon: '🎉',
    text: () => 'The nation celebrates a historic anniversary.',
    weight: (_s, n) => (n.stability > 60 ? 1 : 0.2),
    options: [
      { label: 'Grand festivities', desc: 'Costs 200, +8 happiness for 1 year', effect: (s, n) => { n.money -= 200; temp(s, n, 'happiness', 8, 365, 'Jubilee'); } },
      { label: 'A modest parade', desc: '+3 stability for 1 year', effect: (s, n) => temp(s, n, 'stability', 3, 365, 'Jubilee') },
    ],
  },
  {
    id: 'military_coup', title: 'Generals Grumble', icon: '🎖️',
    text: () => 'Senior officers complain about pay and prestige.',
    weight: (s, n) => (n.stability < 40 && s.divisions.filter((d) => d.owner === n.id).length > 6 ? 1.5 : 0),
    options: [
      { label: 'Raise their pay', desc: 'Costs 300', effect: (_s, n) => { n.money -= 300; } },
      { label: 'Retire them', desc: '−10% attack and −5 stability for 1 year', effect: (s, n) => { temp(s, n, 'attack', -0.1, 365, 'Purged officers'); temp(s, n, 'stability', -5, 365, 'Purged officers'); } },
    ],
  },
  // ---- diplomatic events (never random) ----
  {
    id: 'call_to_arms', title: 'Call to Arms', icon: '📯',
    text: (s, _n, ev) => {
      const war = s.wars.find((w) => w.id === ev.war);
      return `Our ally ${s.nations[ev.from ?? 0].name} has been attacked${war ? ` (${war.name})` : ''}. Will we honour the alliance?`;
    },
    weight: () => 0,
    options: [
      {
        label: 'Honour the alliance', desc: 'Join the war on their side',
        effect: (s, n, ev) => { const war = s.wars.find((w) => w.id === ev.war); if (war) joinWar(s, war, n.id, war.defenders.includes(ev.from ?? -1) ? 'defenders' : 'attackers'); },
      },
      { label: 'Stay out', desc: 'The alliance ends, −8 trustworthiness, they will remember', effect: (s, n, ev) => refuseCall(s, n.id, ev.from ?? 0) },
    ],
  },
  {
    id: 'peace_offer', title: 'Peace Offer', icon: '🕊️',
    text: (s, _n, ev) => {
      const war = s.wars.find((w) => w.id === ev.war);
      const t = ev.terms!;
      const parts: string[] = [];
      if (t.cede.length) parts.push(`cession of ${t.cede.map((p) => s.provinces[p].name).join(', ')}`);
      if (t.money) parts.push(`${Math.round(t.money)} in reparations`);
      if (t.puppet) parts.push('puppet status');
      if (t.annex) parts.push('full annexation');
      const recv = war && ev.receiver ? s.nations[war[ev.receiver][0]].name : '?';
      return `${s.nations[ev.from ?? 0].name} proposes to end the ${war?.name ?? 'war'}: ${parts.length ? parts.join(', ') + ` (in favour of ${recv})` : 'a white peace'}.`;
    },
    weight: () => 0,
    options: [
      { label: 'Accept', desc: 'Sign the peace', effect: (s, _n, ev) => { const war = s.wars.find((w) => w.id === ev.war); if (war && ev.receiver && ev.terms) makePeace(s, war, ev.receiver, ev.terms as PeaceTerms); } },
      { label: 'Reject', desc: 'Fight on', effect: () => undefined },
    ],
  },
  {
    id: 'treaty_offer', title: 'Treaty Proposal', icon: '📜',
    text: (s, _n, ev) => `${s.nations[ev.from ?? 0].name} proposes: ${(ev.clauses as Clause[]).map((c) => clauseLabel(s, c)).join('; ')}. (Clauses are written from their side: "we" = ${s.nations[ev.from ?? 0].name}.)`,
    weight: () => 0,
    options: [
      { label: 'Accept', desc: 'Sign the treaty', effect: (s, n, ev) => { if (ev.from !== undefined && s.nations[ev.from].alive) applyTreaty(s, ev.from, n.id, ev.clauses as Clause[]); } },
      { label: 'Decline', desc: 'They will be a little offended', effect: (s, n, ev) => addOpinion(s, ev.from ?? 0, n.id, -5, 'Rejected our proposal', 0.05, 20) },
    ],
  },
];

export const EVENT_BY_ID: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

const EVENT_CHANCE = 1 / 420;

export function eventsDay(state: GameState): void {
  for (const n of state.nations) {
    if (!n.alive) continue;
    if (rand(state) > EVENT_CHANCE) continue;
    const pool = EVENTS.map((e) => ({ e, w: e.weight(state, n) })).filter((x) => x.w > 0);
    const total = pool.reduce((s, x) => s + x.w, 0);
    if (!total) continue;
    let r = rand(state) * total;
    let pick = pool[0].e;
    for (const x of pool) {
      r -= x.w;
      if (r <= 0) {
        pick = x.e;
        break;
      }
    }
    const ev: GameEvent = { id: pick.id, nation: n.id, day: state.day };
    if (pick.id === 'discovery') ev.province = randomOwned(state, n, (pid) => !state.provinces[pid].resource);
    else ev.province = randomOwned(state, n);
    if (n.isPlayer) state.pendingEvents.push(ev);
    else resolveEvent(state, ev, Math.floor(rand(state) * pick.options.length));
  }
  // drop stale diplomatic prompts (wars that ended)
  state.pendingEvents = state.pendingEvents.filter((ev) => !(ev.war !== undefined && !state.wars.some((w) => w.id === ev.war)));
}

export function resolveEvent(state: GameState, ev: GameEvent, option: number): void {
  const def = EVENT_BY_ID[ev.id];
  const n = state.nations[ev.nation];
  if (!def || !n?.alive) return;
  const opt = def.options[Math.max(0, Math.min(def.options.length - 1, option))];
  opt.effect(state, n, ev);
}

/** AI-to-AI or AI-to-player peace offer. AI receivers decide immediately. */
export function offerPeace(state: GameState, warId: number, from: number, receiver: 'attackers' | 'defenders', terms: PeaceTerms): boolean {
  const war = state.wars.find((w) => w.id === warId);
  if (!war) return false;
  const otherLeader = war.attackers.includes(from) ? war.defenders[0] : war.attackers[0];
  const O = state.nations[otherLeader];
  if (O.isPlayer) {
    if (!state.pendingEvents.some((e) => e.id === 'peace_offer' && e.war === warId))
      state.pendingEvents.push({ id: 'peace_offer', nation: otherLeader, day: state.day, war: warId, from, receiver, terms });
    return false;
  }
  // the AI being asked to concede checks whether the terms are justified
  const giverIsOther = war[receiver][0] !== otherLeader;
  const ok = giverIsOther ? aiAcceptsTerms(state, war, receiver, terms) : true;
  if (ok) makePeace(state, war, receiver, terms);
  return ok;
}

