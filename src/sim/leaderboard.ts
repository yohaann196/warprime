// Leaderboards and the end of the game. There are no victories: nations are ranked monthly on the
// Prosperity Index (the current leaderboard), and the time each spends at the top adds up to the
// all-time leaderboard. The game ends on 1 Jan of settings.endYear, when Earth becomes uninhabitable,
// or when the player's nation is destroyed. checkEnd is the only code that sets state.gameOver.
import { computeProsperity, ranking } from './prosperity';
import { log, nationPop, notice, ownedProvinces } from './query';
import {
  DAYS_PER_YEAR,
  yearOf,
  type Difficulty,
  type EndCause,
  type GameState,
  type LeaderboardState,
  type NationRecord,
  type PlayerFinal,
} from './state';

export const SAMPLE_DAYS = 30; // the ranking is sampled monthly
export const RANK_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]; // per year at each rank
export const CROWN_MARGIN = 1; // prosperity lead that takes the crown at once (else two samples in a row)
export const RUNAWAY_LEAD = 1.05; // the crown holder is a runaway leader 5% ahead of the next nation
export const YEARS_AT_TOP_MILESTONES = [1, 5, 10, 25, 50, 100, 250, 500];
export const DIFF_MULT: Record<Difficulty, number> = { beginner: 0.5, realistic: 1, demonic: 2 };

// ------------------------------------------------------------------ state

export function decadeOf(year: number): number {
  return Math.floor(year / 10) * 10;
}

/** Calendar year of a given game day. */
export function yearAt(state: GameState, day: number): number {
  return state.settings.startYear + Math.floor(day / DAYS_PER_YEAR);
}

/** First day of a calendar year. */
export function dayOfYear(state: GameState, year: number): number {
  return (year - state.settings.startYear) * DAYS_PER_YEAR;
}

export function emptyLeaderboard(day: number, year: number): LeaderboardState {
  return {
    lastSampleDay: day,
    order: [],
    allTimeOrder: [],
    yearStartOrder: [],
    crown: -1,
    challenger: -1,
    records: [],
    reigns: [],
    decade: { start: decadeOf(year), days: [] },
    decades: [],
    nextYearsMilestone: 0,
  };
}

function newRecord(state: GameState, id: number): NationRecord {
  const n = state.nations[id];
  const provinces = n.alive ? ownedProvinces(state, id).length : 0;
  return {
    daysAtTop: 0,
    daysTop3: 0,
    rankPoints: 0,
    bestRank: 0,
    bestAllTimeRank: 0,
    peakProsperity: n.alive ? n.prosperity : 0,
    peakProsperityDay: state.day,
    reigns: 0,
    longestReign: 0,
    firstTopDay: -1,
    startProvinces: provinces,
    peakProvinces: provinces,
    peakGdp: n.alive ? n.gdp : 0,
    diedDay: n.alive ? -1 : state.day,
    eliminatedBy: -1,
    deaths: n.alive ? 0 : 1,
    lives: 1,
  };
}

/** Grows the records (and the decade tally) to cover every nation; existing records are kept. */
export function ensureRecords(state: GameState): void {
  const lb = state.leaderboard;
  while (lb.records.length < state.nations.length) lb.records.push(newRecord(state, lb.records.length));
  while (lb.decade.days.length < state.nations.length) lb.decade.days.push(0);
}

/** Default filler for the leaderboard (newGame, save migration and nation revival call it). */
export function ensureLeaderboardDefaults(state: GameState, nationId?: number): void {
  if (!state.leaderboard) {
    if (state.day > 0) seedFromHistory(state);
    else state.leaderboard = emptyLeaderboard(state.day, yearOf(state));
  }
  ensureRecords(state);
  if (nationId !== undefined && state.nations[nationId]?.alive) resetNationRecordOnRevive(state, nationId);
}

/** A dead nation came back: it is alive again on the boards and can die (and be recorded) again. */
export function resetNationRecordOnRevive(state: GameState, id: number): void {
  ensureRecords(state);
  const r = state.leaderboard.records[id];
  if (r.diedDay < 0) return;
  r.diedDay = -1;
  r.eliminatedBy = -1;
  r.lives++;
}

// ------------------------------------------------------------------ queries

export function currentRank(state: GameState, id: number): number {
  return state.leaderboard.order.indexOf(id) + 1;
}

export function allTimeRank(state: GameState, id: number): number {
  return state.leaderboard.allTimeOrder.indexOf(id) + 1;
}

/** Day the current crown holder took the crown (-1 if nobody holds it). */
export function crownSince(state: GameState): number {
  const r = state.leaderboard.reigns[state.leaderboard.reigns.length - 1];
  return r && r.end < 0 ? r.start : -1;
}

/** The crown holder when it leads the next nation by RUNAWAY_LEAD, else -1. AI envy targets it. */
export function runawayLeader(state: GameState): number {
  const crown = state.leaderboard.crown;
  if (crown < 0 || !state.nations[crown]?.alive) return -1;
  let best = 0;
  for (const n of state.nations) if (n.alive && n.id !== crown) best = Math.max(best, n.prosperity);
  return state.nations[crown].prosperity >= best * RUNAWAY_LEAD ? crown : -1;
}

/** Every nation, dead ones included: days at #1, then days in the top 3, points, lifespan, id. */
export function allTimeRanking(state: GameState): number[] {
  const rec = state.leaderboard.records;
  const life = (id: number) => (rec[id].diedDay < 0 ? Infinity : rec[id].diedDay);
  return state.nations
    .map((n) => n.id)
    .sort(
      (a, b) =>
        rec[b].daysAtTop - rec[a].daysAtTop ||
        rec[b].daysTop3 - rec[a].daysTop3 ||
        rec[b].rankPoints - rec[a].rankPoints ||
        (life(b) === life(a) ? 0 : life(b) > life(a) ? 1 : -1) ||
        a - b,
    );
}

/** "0 months", "3 months", "1.5 years", "120 years". Any time at all reads as at least a month. */
/** Compact years for tables: "0", "0.4", "7.5", "112". */
export function yearsShort(days: number): string {
  if (days <= 0) return '0';
  const y = days / DAYS_PER_YEAR;
  return y >= 10 ? String(Math.round(y)) : (Math.round(y * 10) / 10).toString();
}

export function yearsFmt(days: number): string {
  if (days < DAYS_PER_YEAR) {
    const m = days > 0 ? Math.max(1, Math.round(days / 30)) : 0;
    return `${m} month${m === 1 ? '' : 's'}`;
  }
  const y = days / DAYS_PER_YEAR;
  const txt = y < 10 ? (Math.round(y * 10) / 10).toString() : String(Math.round(y));
  return `${txt} year${txt === '1' ? '' : 's'}`;
}

export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${s}`;
}

/** Sums the decades of a century into [nation, days at #1], best first. */
export function centuryHolders(state: GameState, century: number): [number, number][] {
  const days = new Map<number, number>();
  for (const d of state.leaderboard.decades) {
    if (d.start < century || d.start >= century + 100) continue;
    for (const [id, v] of d.holders) days.set(id, (days.get(id) ?? 0) + v);
  }
  return [...days.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
}

// ------------------------------------------------------------------ sampling

/**
 * Credits [from, to) to a ranking (left-Riemann: a rank holds until the next sample). This is what
 * makes sum(daysAtTop) equal the sampled time exactly, and it works at any step size.
 */
function credit(state: GameState, order: number[], from: number, to: number, quiet: boolean): void {
  const lb = state.leaderboard;
  if (to <= from || !order.length) return;
  const dt = to - from;
  for (let i = 0; i < order.length && i < RANK_POINTS.length; i++) {
    const r = lb.records[order[i]];
    if (i === 0) r.daysAtTop += dt;
    if (i < 3) r.daysTop3 += dt;
    r.rankPoints += (RANK_POINTS[i] * dt) / DAYS_PER_YEAR;
  }
  // the running decade, split at calendar-decade boundaries
  let t = from;
  for (;;) {
    const boundary = dayOfYear(state, lb.decade.start + 10);
    if (to < boundary) {
      lb.decade.days[order[0]] += to - t;
      return;
    }
    lb.decade.days[order[0]] += boundary - t;
    finishDecade(state, quiet);
    t = boundary;
    if (t >= to) return;
  }
}

function finishDecade(state: GameState, quiet: boolean): void {
  const lb = state.leaderboard;
  const start = lb.decade.start;
  const holders = lb.decade.days
    .map((d, id) => [id, d] as [number, number])
    .filter(([, d]) => d > 0)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  lb.decades.push(start < state.settings.startYear ? { start, holders, partial: true } : { start, holders });
  lb.decade = { start: start + 10, days: state.nations.map(() => 0) };
  if (quiet || !holders.length) return;
  const [top, days] = holders[0];
  const name = state.nations[top].name;
  notice(state, `The ${start}s belonged to ${name} (${yearsFmt(days)} at #1).`, top === state.player ? 'gold' : 'info', [top], 'decade');
  if ((start + 10) % 100 !== 0) return;
  const century = start + 10 - 100;
  const best = centuryHolders(state, century)[0];
  if (!best) return;
  const label = `${ordinal(century / 100 + 1)} century`;
  const p = state.player >= 0 ? state.nations[state.player] : null;
  const endured = p?.alive ? ` ${p.name} has endured ${yearOf(state) - state.settings.startYear} years.` : '';
  notice(state, `The ${label} belonged to ${state.nations[best[0]].name} (${yearsFmt(best[1])} at #1).${endured}`, 'gold', [best[0]], 'century');
}

function updateRecords(state: GameState, order: number[], day: number): void {
  const lb = state.leaderboard;
  order.forEach((id, i) => {
    const n = state.nations[id];
    const r = lb.records[id];
    if (r.bestRank === 0 || i + 1 < r.bestRank) r.bestRank = i + 1;
    if (n.prosperity > r.peakProsperity) {
      r.peakProsperity = n.prosperity;
      r.peakProsperityDay = day;
    }
    r.peakProvinces = Math.max(r.peakProvinces, ownedProvinces(state, id).length);
    r.peakGdp = Math.max(r.peakGdp, n.gdp);
  });
}

function setAllTimeOrder(state: GameState): void {
  const lb = state.leaderboard;
  lb.allTimeOrder = allTimeRanking(state);
  lb.allTimeOrder.forEach((id, i) => {
    const r = lb.records[id];
    // nations only hold an all-time place once they have earned points
    if (r.rankPoints > 0 && (r.bestAllTimeRank === 0 || i + 1 < r.bestAllTimeRank)) r.bestAllTimeRank = i + 1;
  });
}

function takeCrown(state: GameState, nation: number, day: number): void {
  const lb = state.leaderboard;
  const cur = lb.reigns[lb.reigns.length - 1];
  if (cur && cur.end < 0) {
    cur.end = day;
    const r = lb.records[cur.nation];
    r.longestReign = Math.max(r.longestReign, cur.end - cur.start);
  }
  lb.reigns.push({ nation, start: day, end: -1 });
  lb.crown = nation;
  const r = lb.records[nation];
  r.reigns++;
  if (r.firstTopDay < 0) r.firstTopDay = day;
}

/**
 * Crown with hysteresis: it passes on a CROWN_MARGIN lead or after two samples in a row at #1.
 * final (the end of the game, off the monthly grid): it only leaves a dead holder.
 */
function updateCrown(state: GameState, order: number[], day: number, final: boolean): void {
  const lb = state.leaderboard;
  const top = order[0] ?? -1;
  if (top < 0) {
    lb.challenger = -1;
    return;
  }
  const crown = lb.crown;
  const P = (id: number) => state.nations[id].prosperity;
  if (crown < 0 || !state.nations[crown].alive) takeCrown(state, top, day);
  else if (!final && top !== crown && (P(top) - P(crown) >= CROWN_MARGIN || lb.challenger === top)) takeCrown(state, top, day);
  lb.challenger = lb.crown !== top ? top : -1;
  const cur = lb.reigns[lb.reigns.length - 1];
  if (cur && cur.end < 0) {
    const r = lb.records[cur.nation];
    r.longestReign = Math.max(r.longestReign, day - cur.start);
  }
}

/** Starts the boards from the current ranking without crediting any time (day 0 and warm-up). */
function resetLeaderboard(state: GameState, order: number[]): void {
  const lb = emptyLeaderboard(state.day, yearOf(state));
  state.leaderboard = lb;
  ensureRecords(state);
  lb.order = order;
  lb.yearStartOrder = order;
  if (order.length) takeCrown(state, order[0], state.day);
  updateRecords(state, order, state.day);
  setAllTimeOrder(state);
}

/**
 * Samples the ranking. Runs monthly right after computeProsperity. Credits the time since the last
 * sample to the previous RAW ranking (days at #1, days in the top 3, rank points), then moves the
 * crown (display and notices only), updates the all-time order and emits the player's milestones.
 * reset: start the boards over (day 0). final: the end of the game; credits the time off the monthly
 * grid and stays quiet.
 */
export function sampleLeaderboard(state: GameState, opts: { reset?: boolean; final?: boolean } = {}): void {
  const order = ranking(state).map((r) => r.nation);
  if (opts.reset) return resetLeaderboard(state, order);
  // deaths first: their headlines read the rank and crown the fallen held, and the all-time
  // lifespan tiebreak must already see them
  markDeaths(state);
  const lb = state.leaderboard;
  const day = state.day;
  if (day <= lb.lastSampleDay && lb.order.length) return; // already sampled today
  const prev = {
    order: lb.order.length ? lb.order : order,
    allTimeOrder: lb.allTimeOrder,
    crown: lb.crown,
    firstTopDay: state.player >= 0 ? (lb.records[state.player]?.firstTopDay ?? -1) : -1,
    bestRank: state.player >= 0 ? (lb.records[state.player]?.bestRank ?? 0) : 0,
    bestAllTimeRank: state.player >= 0 ? (lb.records[state.player]?.bestAllTimeRank ?? 0) : 0,
    reignStart: crownSince(state),
  };
  credit(state, prev.order, lb.lastSampleDay, day, !!opts.final);
  updateRecords(state, order, day);
  updateCrown(state, order, day, !!opts.final);
  if (yearAt(state, day) !== yearAt(state, lb.lastSampleDay) || !lb.yearStartOrder.length) lb.yearStartOrder = order;
  lb.order = order;
  setAllTimeOrder(state);
  lb.lastSampleDay = day;
  if (!opts.final) playerNotices(state, prev);
}

/** Player-centred headlines from a sample (section E of the leaderboards design). */
function playerNotices(
  state: GameState,
  prev: { order: number[]; allTimeOrder: number[]; crown: number; firstTopDay: number; bestRank: number; bestAllTimeRank: number; reignStart: number },
): void {
  const lb = state.leaderboard;
  const p = state.player;
  const name = (id: number) => state.nations[id].name;
  // a crown passing between other nations is news, but only a headline when it concerns the player
  if (lb.crown !== prev.crown && lb.crown >= 0 && prev.crown !== p && lb.crown !== p) {
    const text = `${name(lb.crown)} is now the world's #1 nation.`;
    const mine = p >= 0 && state.nations[p].alive ? currentRank(state, p) : 0;
    if (mine > 0 && mine <= 5) notice(state, text, 'info', [lb.crown], 'new_leader');
    else log(state, text, 'info', [lb.crown]);
  }
  if (p < 0 || !state.nations[p].alive) return;
  const day = state.day;
  const rec = lb.records[p];
  const P = (id: number) => state.nations[id].prosperity;
  // always-on notices still start their key's cooldown so the regular rule cannot repeat them at once
  const always = (key: string, cooldown: number, text: string, tone: 'good' | 'bad' | 'gold', nations: number[]) => {
    notice(state, text, tone, nations);
    if (cooldown > 0) state.noticeCooldowns[key] = day + cooldown;
  };

  if (lb.crown !== prev.crown && lb.crown === p) {
    always('crown_gained', 0, `You are now the world's #1 nation${prev.firstTopDay < 0 ? ' for the first time' : ''}!`, 'gold', [p]);
  } else if (lb.crown !== prev.crown && prev.crown === p && lb.crown >= 0) {
    const held = prev.reignStart >= 0 ? day - prev.reignStart : 0;
    always('crown_lost', 0, `${name(lb.crown)} has taken the #1 spot from you after ${yearsFmt(held)}.`, 'bad', [lb.crown, p]);
  }

  const rank = currentRank(state, p);
  const prevRank = prev.order.indexOf(p) + 1;
  if (lb.crown === p) {
    const rival = lb.challenger >= 0 ? lb.challenger : (lb.order[1] ?? -1);
    if (rival >= 0) {
      const gap = P(p) - P(rival);
      if (lb.challenger >= 0 || gap < 1.5) {
        const text =
          gap >= 0
            ? `${name(rival)} is closing in, ${gap.toFixed(1)} points behind.`
            : `${name(rival)} leads the monthly ranking by ${(-gap).toFixed(1)} points. Hold on, or the crown is theirs.`;
        notice(state, text, 'info', [rival, p], 'challenger', 365);
      }
    }
  } else if (rank > 0 && prevRank > 0 && prev.crown !== p) {
    if (rank > prevRank && rank <= 10) {
      const passer = lb.order.slice(0, rank - 1).find((id) => {
        const was = prev.order.indexOf(id);
        return was < 0 || was > prevRank - 1;
      });
      if (passer !== undefined) notice(state, `${name(passer)} has overtaken you. You are now #${rank}.`, 'bad', [passer, p], 'overtaken', 180);
    } else if (rank < prevRank) {
      const passed = prev.order
        .slice(0, prevRank - 1)
        .filter((id) => lb.order.indexOf(id) > rank - 1 || lb.order.indexOf(id) < 0)
        .find((id) => state.nations[id].alive);
      const text = `You climbed to #${rank}${passed !== undefined ? `, passing ${name(passed)}` : ''}.`;
      const nations = passed !== undefined ? [p, passed] : [p];
      if ((rank <= 3 && prevRank > 3) || rank < prev.bestRank) always('climbed', 180, text, 'good', nations);
      else notice(state, text, 'good', nations, 'climbed', 180);
    }
  }

  let milestone = -1;
  while (lb.nextYearsMilestone < YEARS_AT_TOP_MILESTONES.length && rec.daysAtTop >= YEARS_AT_TOP_MILESTONES[lb.nextYearsMilestone] * DAYS_PER_YEAR)
    milestone = YEARS_AT_TOP_MILESTONES[lb.nextYearsMilestone++];
  if (milestone > 0) notice(state, `You have now led the world for a total of ${milestone} year${milestone === 1 ? '' : 's'}.`, 'gold', [p]);

  // the all-time board means little in the first year
  if (day < DAYS_PER_YEAR) return;
  const at = allTimeRank(state, p);
  const prevAt = prev.allTimeOrder.indexOf(p) + 1;
  if (at <= 0 || prevAt <= 0 || at >= prevAt) return;
  if (at === 1) notice(state, 'You are #1 of all time!', 'gold', [p], 'alltime_top', 365);
  else if (at <= 3 && (prev.bestAllTimeRank === 0 || at < prev.bestAllTimeRank)) always('alltime_up', 365, `You rose to #${at} on the all-time leaderboard.`, 'good', [p]);
  else notice(state, `You rose to #${at} on the all-time leaderboard.`, 'good', [p], 'alltime_up', 365);
}

// ------------------------------------------------------------------ migration of old saves

/** v1 kept at most this many history points per nation, dropping the oldest. */
const V1_HISTORY_MAX = 400;

/**
 * Rebuilds the boards of a save that had none (v1) from the nations' prosperity histories. v1
 * sampled the living nations every 90 days and dropped a history's oldest points past
 * V1_HISTORY_MAX, so in a late save the survivors have lost their early samples while nations that
 * died early kept theirs. Only the days every history still covers are ranked: the gap before the
 * first of them goes to that sample's ranking, and each interval to the ranking that opens it,
 * without the nations that are gone by its end (no one is credited past their last sample).
 * sum(daysAtTop) still equals lastSampleDay. Crown changes are taken from the raw samples.
 */
function seedFromHistory(state: GameState): void {
  const lb = emptyLeaderboard(0, state.settings.startYear);
  state.leaderboard = lb;
  ensureRecords(state);
  for (const r of lb.records) {
    r.diedDay = -1;
    r.deaths = 0;
  }
  const samples = new Map<number, { nation: number; prosperity: number; gdp: number }[]>();
  const add = (day: number, nation: number, prosperity: number, gdp: number) => {
    const r = lb.records[nation];
    if (prosperity > r.peakProsperity) {
      r.peakProsperity = prosperity;
      r.peakProsperityDay = day;
    }
    r.peakGdp = Math.max(r.peakGdp, gdp);
    let arr = samples.get(day);
    if (!arr) samples.set(day, (arr = []));
    arr.push({ nation, prosperity, gdp });
  };
  let complete = 0; // the first day no history has lost
  for (const n of state.nations) {
    for (const h of n.history) add(h.day, n.id, h.prosperity, h.gdp);
    if (n.history.length >= V1_HISTORY_MAX) complete = Math.max(complete, n.history[0].day);
  }
  // a dead nation's last sample is the last day it is known to have lived (its diedDay below)
  const lastSeen = state.nations.map((n) => (n.alive ? Infinity : (n.history[n.history.length - 1]?.day ?? 0)));
  // the live prosperity is the latest monthly ranking
  const now = Math.floor(state.day / SAMPLE_DAYS) * SAMPLE_DAYS;
  samples.delete(now);
  for (const n of state.nations) if (n.alive) add(now, n.id, n.prosperity, n.gdp);
  const days = [...samples.keys()].filter((d) => d >= complete && d <= now).sort((a, b) => a - b);
  let prevOrder: number[] | null = null;
  let prevDay = 0;
  for (const d of days) {
    const entries = samples.get(d)!.sort((a, b) => b.prosperity - a.prosperity || a.nation - b.nation);
    const order = entries.map((e) => e.nation);
    const held = (prevOrder ?? order).filter((id) => lastSeen[id] >= d);
    credit(state, held.length ? held : order, prevDay, d, true);
    entries.forEach((e, i) => {
      const r = lb.records[e.nation];
      if (r.bestRank === 0 || i + 1 < r.bestRank) r.bestRank = i + 1;
    });
    if (order.length && order[0] !== lb.crown) takeCrown(state, order[0], prevOrder ? d : 0);
    prevOrder = order;
    prevDay = d;
  }
  lb.lastSampleDay = prevDay;
  lb.order = ranking(state).map((r) => r.nation);
  lb.yearStartOrder = lb.order;
  lb.challenger = -1;
  for (const r of lb.reigns) {
    const len = (r.end < 0 ? prevDay : r.end) - r.start;
    lb.records[r.nation].longestReign = Math.max(lb.records[r.nation].longestReign, len);
  }
  for (const n of state.nations) {
    if (n.alive) continue;
    const r = lb.records[n.id];
    r.diedDay = lastSeen[n.id];
    r.deaths = 1;
    const killer = state.provinces[n.capital]?.owner ?? -1;
    r.eliminatedBy = killer !== n.id ? killer : -1;
  }
  setAllTimeOrder(state);
  if (state.player >= 0) {
    const days = lb.records[state.player].daysAtTop;
    while (lb.nextYearsMilestone < YEARS_AT_TOP_MILESTONES.length && days >= YEARS_AT_TOP_MILESTONES[lb.nextYearsMilestone] * DAYS_PER_YEAR) lb.nextYearsMilestone++;
  }
}

// ------------------------------------------------------------------ deaths and the end of the game

/** Records nations that died since the last check (who took their last province, and when). */
export function markDeaths(state: GameState): void {
  ensureRecords(state);
  const lb = state.leaderboard;
  for (const n of state.nations) {
    const r = lb.records[n.id];
    if (n.alive || r.diedDay >= 0) continue;
    r.diedDay = state.day;
    r.deaths++;
    // checkAlive and transferProvince leave the capital on the last province, now held by the conqueror
    const killer = state.provinces[n.capital]?.owner ?? -1;
    r.eliminatedBy = killer !== n.id ? killer : -1;
    const rank = currentRank(state, n.id);
    if (n.id === state.player || (n.id !== lb.crown && (rank === 0 || rank > 3))) continue;
    const who = n.id === lb.crown ? "the world's #1 nation" : `#${rank} in the world`;
    const by = r.eliminatedBy >= 0 ? ` to ${state.nations[r.eliminatedBy].name}` : '';
    notice(state, `${n.name}, ${who}, has fallen${by}.`, 'info', r.eliminatedBy >= 0 ? [n.id, r.eliminatedBy] : [n.id]);
  }
}

/** Climate collapse or the end of time: ends the game for everyone, spectators included. */
function worldEndCause(state: GameState): Exclude<EndCause, 'eliminated'> | null {
  if ((state.climate?.damage ?? 0) >= 100) return 'climate_collapse';
  if (yearOf(state) >= state.settings.endYear) return 'year_limit';
  return null;
}

/**
 * Runs at the very end of every day. Priority: climate collapse, then the player's elimination
 * (skipped when nobody plays), then the year limit. This is the only code that sets state.gameOver.
 * Migration also runs it once, so an old save whose player had fallen gets its ending on load.
 */
export function checkEnd(state: GameState): void {
  markDeaths(state);
  const world = worldEndCause(state);
  const over = state.gameOver;
  if (over) {
    // a spectator (eliminated player) watches until the world itself ends
    if (over.cause === 'eliminated' && world && !over.worldEnd) {
      computeProsperity(state);
      sampleLeaderboard(state, { final: true });
      endWorld(state, world);
      notice(state, world === 'climate_collapse' ? 'Earth has become uninhabitable.' : `The year ${yearOf(state)} has arrived. History ends here.`, 'info', []);
    }
    return;
  }
  if (world === 'climate_collapse') return endGame(state, world);
  if (state.player >= 0 && !state.nations[state.player].alive) {
    endGame(state, 'eliminated');
    // the player fell on the day the world ended: there is nothing left to spectate
    if (world) endWorld(state, world);
    return;
  }
  if (world) endGame(state, world);
}

/** Records the world's own end after the player's elimination: its day, final crown and climate damage. */
function endWorld(state: GameState, cause: Exclude<EndCause, 'eliminated'>): void {
  state.gameOver!.worldEnd = {
    cause,
    day: state.day,
    crown: state.leaderboard.crown,
    climateDamage: state.climate ? state.climate.damage : null,
  };
  state.spectating = false;
}

function endGame(state: GameState, cause: EndCause): void {
  computeProsperity(state);
  sampleLeaderboard(state, { final: true });
  const lb = state.leaderboard;
  const rec = lb.records;
  state.gameOver = {
    cause,
    day: state.day,
    year: yearOf(state),
    crown: lb.crown,
    climateDamage: state.climate ? state.climate.damage : null,
    current: lb.order.map((nation, i) => ({ nation, rank: i + 1, prosperity: Math.round(state.nations[nation].prosperity * 10) / 10 })),
    allTime: lb.allTimeOrder.map((nation, i) => ({
      nation,
      rank: i + 1,
      daysAtTop: rec[nation].daysAtTop,
      daysTop3: rec[nation].daysTop3,
      rankPoints: Math.round(rec[nation].rankPoints * 10) / 10,
      diedDay: rec[nation].diedDay,
    })),
    player: playerFinal(state),
  };
  const p = state.player >= 0 ? state.nations[state.player] : null;
  const crown = lb.crown >= 0 ? state.nations[lb.crown] : null;
  const text =
    cause === 'climate_collapse'
      ? 'Earth has become uninhabitable. Every nation is lost.'
      : cause === 'eliminated'
        ? `${p?.name ?? 'Your nation'} has fallen. The game is over.`
        : `The year ${yearOf(state)} has arrived.${crown ? ` ${crown.name} ends history as the world's #1.` : ''}`;
  notice(state, text, cause === 'year_limit' && crown && crown.id === state.player ? 'gold' : 'info', crown ? [crown.id] : []);
}

/** The player's final numbers and legacy score (the Hall of Fame sort key). */
export function playerFinal(state: GameState): PlayerFinal | null {
  if (state.player < 0) return null;
  ensureRecords(state);
  const n = state.nations[state.player];
  const r = state.leaderboard.records[n.id];
  const yearsAlive = (r.diedDay >= 0 ? r.diedDay : state.day) / DAYS_PER_YEAR;
  return {
    nation: n.id,
    survived: n.alive,
    diedDay: r.diedDay,
    eliminatedBy: r.eliminatedBy,
    currentRank: n.alive ? currentRank(state, n.id) : 0,
    aliveCount: state.nations.filter((x) => x.alive).length,
    allTimeRank: allTimeRank(state, n.id),
    nationCount: state.nations.length,
    prosperity: Math.round(n.prosperity * 10) / 10,
    peakProsperity: Math.round(r.peakProsperity * 10) / 10,
    peakProsperityDay: r.peakProsperityDay,
    daysAtTop: r.daysAtTop,
    daysTop3: r.daysTop3,
    rankPoints: Math.round(r.rankPoints * 10) / 10,
    bestRank: r.bestRank,
    longestReign: r.longestReign,
    reigns: r.reigns,
    firstTopDay: r.firstTopDay,
    provinces: n.alive ? ownedProvinces(state, n.id).length : 0,
    startProvinces: r.startProvinces,
    peakProvinces: r.peakProvinces,
    gdp: n.alive ? n.gdp : 0,
    peakGdp: r.peakGdp,
    population: n.alive ? nationPop(state, n.id) : 0,
    techs: n.tech.researched.length,
    clicks: n.clicks.totalClicks,
    yearsAlive: Math.round(yearsAlive * 10) / 10,
    legacy: Math.round(DIFF_MULT[state.settings.difficulty] * (r.rankPoints + 0.2 * yearsAlive)),
  };
}
