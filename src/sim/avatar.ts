// Avatar mode only: the Avatar is reborn in a different nation every few years and, while at war,
// randomly turns up in that nation's battles to rally its troops.
import { getWorldMode } from '../data/worlds';
import { invalidateMods } from './modifiers';
import { divisionsAt, notice, warsOf } from './query';
import { rand } from './rng';
import { DAYS_PER_YEAR, type GameState } from './state';

const AID_CHANCE = 0.04; // per day, while the Avatar's nation has divisions fighting
const REASON = 'The Avatar is with us';

export function avatarDay(state: GameState): void {
  const years = getWorldMode(state.settings.mapId).avatarYears;
  if (!years) return;
  const interval = years * DAYS_PER_YEAR;
  if (!state.avatar) state.avatar = { nation: -1, since: state.day, nextDay: state.day };
  const av = state.avatar;
  const alive = state.nations.filter((n) => n.alive);
  if (!alive.length) return;

  if (state.day >= av.nextDay || av.nation < 0 || !state.nations[av.nation]?.alive) {
    for (const n of state.nations) n.tempMods = n.tempMods.filter((t) => t.reason !== REASON);
    const others = alive.filter((n) => n.id !== av.nation);
    const pool = others.length ? others : alive;
    const chosen = pool[Math.floor(rand(state) * pool.length)];
    av.nation = chosen.id;
    av.since = state.day;
    av.nextDay = state.day + interval;
    const until = av.nextDay;
    chosen.tempMods.push({ key: 'stability', value: 5, until, reason: REASON });
    chosen.tempMods.push({ key: 'defense', value: 0.1, until, reason: REASON });
    invalidateMods();
    notice(state, `🌀 The Avatar has been born in the ${chosen.name}!`, 'gold', [chosen.id]);
    return;
  }

  const n = state.nations[av.nation];
  if (!warsOf(state, n.id).length || rand(state) > AID_CHANCE) return;
  // find a province where the Avatar's divisions are in a fight, and rally them
  for (const { id: pid } of state.provinces) {
    const divs = divisionsAt(state, pid);
    const mine = divs.filter((d) => d.owner === n.id && d.training === 0);
    if (!mine.length || !divs.some((d) => d.owner !== n.id && d.training === 0)) continue;
    for (const d of mine) {
      d.org = Math.min(1, d.org + 0.4);
      d.strength = Math.min(1, d.strength + 0.25);
    }
    notice(state, `🌀 The Avatar joins the fight for the ${n.name} at ${state.provinces[pid].name}!`, n.isPlayer ? 'gold' : 'info', [n.id], `avatar-aid-${n.id}`, 60);
    return;
  }
}
