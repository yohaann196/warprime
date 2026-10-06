import { describe, expect, it } from 'vitest';
import { transferProvince } from '../src/sim/diplomacy/war';
import { DIFFICULTY } from '../src/sim/difficulty';
import {
  allTimeRanking,
  ensureLeaderboardDefaults,
  markDeaths,
  runawayLeader,
  sampleLeaderboard,
  yearsFmt,
} from '../src/sim/leaderboard';
import { computeProsperity, HISTORY_MAX, PROSPERITY_WEIGHTS, recordHistory } from '../src/sim/prosperity';
import { markDirty, notice, ownedProvinces } from '../src/sim/query';
import { advanceDay } from '../src/sim/tick';
import type { GameState } from '../src/sim/state';
import { game, landNeighbor } from './helpers';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** A world whose prosperity the test controls (nation i scores 50 - i by default), sampled at day 0. */
function controlled(score: (i: number) => number = (i) => 50 - i): GameState {
  const s = game();
  computeProsperity(s);
  s.nations.forEach((n, i) => (n.prosperity = score(i)));
  sampleLeaderboard(s, { reset: true });
  return s;
}

function sampleAt(s: GameState, day: number): void {
  s.day = day;
  sampleLeaderboard(s);
}

function kill(s: GameState, victim: number, by: number): void {
  for (const pid of [...ownedProvinces(s, victim)]) transferProvince(s, pid, by);
  markDirty();
}

describe('leaderboard accrual', () => {
  it('time at #1 adds up to the sampled time, and the top 3 to three times that', () => {
    const s = game(5);
    for (let d = 0; d < 365 * 3; d++) advanceDay(s);
    const lb = s.leaderboard;
    expect(lb.lastSampleDay).toBe(Math.floor(s.day / 30) * 30);
    expect(sum(lb.records.map((r) => r.daysAtTop))).toBe(lb.lastSampleDay);
    expect(s.nations.filter((n) => n.alive).length).toBeGreaterThanOrEqual(3);
    expect(sum(lb.records.map((r) => r.daysTop3))).toBe(3 * lb.lastSampleDay);
    expect(lb.records.length).toBe(s.nations.length);
    expect(lb.allTimeOrder.length).toBe(s.nations.length);
  }, 60_000);

  it('credits the previous RAW #1 even while the crown stays with someone else', () => {
    const s = controlled();
    const [a, b] = [0, 1];
    expect(s.leaderboard.crown).toBe(a);
    // b edges ahead by 0.3: not enough to take the crown at once
    s.nations[b].prosperity = s.nations[a].prosperity + 0.3;
    sampleAt(s, 30);
    expect(s.leaderboard.crown).toBe(a);
    expect(s.leaderboard.challenger).toBe(b);
    expect(s.leaderboard.records[a].daysAtTop).toBe(30); // [0, 30) belonged to a's raw lead
    // the next interval is credited to b, the raw #1 of the previous sample
    sampleAt(s, 60);
    expect(s.leaderboard.records[b].daysAtTop).toBe(30);
    expect(s.leaderboard.records[a].daysAtTop).toBe(30);
    // two samples in a row at #1: the crown passes
    expect(s.leaderboard.crown).toBe(b);
    expect(s.leaderboard.challenger).toBe(-1);
    const reigns = s.leaderboard.reigns;
    expect(reigns.map((r) => [r.nation, r.start, r.end])).toEqual([
      [a, 0, 60],
      [b, 60, -1],
    ]);
    expect(s.leaderboard.records[a].longestReign).toBe(60);
    expect(s.leaderboard.records[b].reigns).toBe(1);
  });

  it('the end-of-game sample credits the last days but never hands over a living crown', () => {
    const s = controlled();
    s.nations[1].prosperity = s.nations[0].prosperity + 0.3;
    sampleAt(s, 30);
    expect(s.leaderboard.challenger).toBe(1);
    s.day = 40;
    sampleLeaderboard(s, { final: true });
    expect(s.leaderboard.crown).toBe(0);
    expect(s.leaderboard.records[1].daysAtTop).toBe(10);
    expect(s.leaderboard.lastSampleDay).toBe(40);
    const before = JSON.stringify(s.leaderboard);
    sampleLeaderboard(s, { final: true }); // same day: nothing changes
    expect(JSON.stringify(s.leaderboard)).toBe(before);
  });

  it('a clear lead takes the crown at once', () => {
    const s = controlled();
    s.nations[2].prosperity = s.nations[0].prosperity + 1.5;
    sampleAt(s, 30);
    expect(s.leaderboard.crown).toBe(2);
    expect(s.leaderboard.records[2].firstTopDay).toBe(30);
  });

  it('a year at #1 is worth 25 rank points, #2 18 and #3 15', () => {
    const s = controlled();
    for (let d = 30; d <= 360; d += 30) sampleAt(s, d);
    sampleAt(s, 365);
    const rec = s.leaderboard.records;
    expect(rec[0].rankPoints).toBeCloseTo(25);
    expect(rec[1].rankPoints).toBeCloseTo(18);
    expect(rec[2].rankPoints).toBeCloseTo(15);
    expect(rec[10].rankPoints).toBe(0);
  });

  it('splits decades at the calendar boundary', () => {
    const s = controlled();
    for (let d = 30; d <= 3650 + 30; d += 30) sampleAt(s, d);
    const lb = s.leaderboard;
    expect(lb.decades[0].start).toBe(1900);
    expect(sum(lb.decades[0].holders.map(([, d]) => d))).toBe(3650);
    expect(lb.decades[0].holders[0][0]).toBe(0);
    expect(lb.decade.start).toBe(1910);
    expect(sum(lb.decade.days)).toBe(lb.lastSampleDay - 3650);
    expect(s.notices.some((n) => n.text.startsWith('The 1900s belonged to'))).toBe(true);
  });

  it('orders the all-time board by #1 time, top-3 time, points, lifespan, then id', () => {
    const s = controlled();
    const rec = s.leaderboard.records;
    for (const r of rec) Object.assign(r, { daysAtTop: 0, daysTop3: 0, rankPoints: 0, diedDay: -1 });
    rec[5].daysAtTop = 100;
    rec[3].daysAtTop = 50;
    rec[3].daysTop3 = 300;
    rec[4].daysAtTop = 50;
    rec[4].daysTop3 = 200;
    rec[6].daysTop3 = 10;
    rec[6].rankPoints = 5;
    rec[7].daysTop3 = 10;
    rec[7].rankPoints = 9;
    // equal everything else: alive beats dead, a later death beats an earlier one
    rec[8].diedDay = 400;
    rec[9].diedDay = 900;
    const order = allTimeRanking(s);
    expect(order.slice(0, 5)).toEqual([5, 3, 4, 7, 6]);
    const rest = order.slice(5);
    expect(rest.indexOf(9)).toBe(rest.length - 2);
    expect(rest.indexOf(8)).toBe(rest.length - 1);
    expect(rest.slice(0, -2)).toEqual([...rest.slice(0, -2)].sort((a, b) => a - b));
  });
});

describe('deaths and revival', () => {
  it('records the death, then a revival, then a second death', () => {
    const s = controlled();
    const victim = 3;
    const killer = landNeighbor(s, victim);
    kill(s, victim, killer);
    expect(s.nations[victim].alive).toBe(false);
    markDeaths(s);
    const r = s.leaderboard.records[victim];
    expect(r.diedDay).toBe(s.day);
    expect(r.eliminatedBy).toBe(killer);
    expect(r.deaths).toBe(1);
    sampleAt(s, 30);
    expect(s.leaderboard.order).not.toContain(victim);
    expect(s.leaderboard.allTimeOrder).toContain(victim);

    // independence: the nation is reborn in one province
    const home = ownedProvinces(s, killer).find((pid) => !s.provinces[pid].isCapital)!;
    transferProvince(s, home, victim);
    s.nations[victim].alive = true;
    s.nations[victim].capital = home;
    s.provinces[home].isCapital = true;
    markDirty();
    ensureLeaderboardDefaults(s, victim);
    expect(r.diedDay).toBe(-1);
    expect(r.lives).toBe(2);
    ensureLeaderboardDefaults(s, victim); // idempotent
    expect(r.lives).toBe(2);
    s.nations[victim].prosperity = 1;
    sampleAt(s, 60);
    expect(s.leaderboard.order).toContain(victim);

    kill(s, victim, killer);
    s.day = 75;
    markDeaths(s);
    expect(r.diedDay).toBe(75);
    expect(r.deaths).toBe(2);
  });
});

describe('notices', () => {
  it('respect cooldowns, cap the queue at 40 and also write the log', () => {
    const s = game();
    const logged = s.log.length;
    expect(notice(s, 'A', 'info', [], 'k', 180)).toBe(true);
    expect(notice(s, 'B', 'info', [], 'k', 180)).toBe(false);
    s.day = 179;
    expect(notice(s, 'C', 'info', [], 'k', 180)).toBe(false);
    s.day = 180;
    expect(notice(s, 'D', 'info', [], 'k', 180)).toBe(true);
    expect(s.notices.map((n) => n.text)).toEqual(['A', 'D']);
    expect(s.log.length).toBe(logged + 2);
    for (let i = 0; i < 60; i++) notice(s, `n${i}`, 'gold', [0]);
    expect(s.notices.length).toBe(40);
    expect(s.notices[39].id).toBe(s.nextNoticeId - 1);
    expect(s.log[s.log.length - 1].kind).toBe('good');
  });

  it('tells the player once when they take the crown, and cools down being overtaken', () => {
    // nation 1 holds the crown, the player (nation 0) is #2
    const s = controlled((i) => (i === 1 ? 60 : 50 - i));
    const p = s.player;
    expect(p).toBe(0);
    sampleAt(s, 30);
    expect(s.leaderboard.crown).toBe(1);
    const before = s.notices.length;
    s.nations[p].prosperity = 70;
    sampleAt(s, 60);
    const crownNotices = s.notices.slice(before).filter((n) => n.tone === 'gold' && n.text.includes("world's #1"));
    expect(crownNotices).toHaveLength(1);
    expect(crownNotices[0].text).toContain('for the first time');
    expect(s.notices.slice(before).filter((n) => n.text.includes('world\'s #1')).length).toBe(1);

    // overtaken twice within 180 days: only one notice
    s.nations[1].prosperity = 90;
    sampleAt(s, 90); // crown passes on a clear lead: crown-lost notice, no overtaken notice
    expect(s.notices[s.notices.length - 1].text).toContain('has taken the #1 spot from you');
    s.nations[2].prosperity = 80;
    sampleAt(s, 120);
    s.nations[3].prosperity = 75;
    sampleAt(s, 150);
    const overtaken = s.notices.filter((n) => n.text.includes('has overtaken you'));
    expect(overtaken).toHaveLength(1);
  });
});

describe('prosperity', () => {
  it('weights sum to 1 and the climate part is neutral without emissions', () => {
    expect(sum(Object.values(PROSPERITY_WEIGHTS).map((w) => w.weight))).toBeCloseTo(1);
    const s = game();
    for (let d = 0; d < 40; d++) advanceDay(s);
    for (const n of s.nations.filter((x) => x.alive)) {
      expect(n.prosperityParts.climate).toBe(75);
      expect(n.prosperity).toBeGreaterThanOrEqual(0);
      expect(n.prosperity).toBeLessThanOrEqual(100);
      for (const [k, v] of Object.entries(n.prosperityParts)) if (k !== 'penalty') expect(v).toBeLessThanOrEqual(100.0001);
    }
  });

  it('rewards clean, green economies through the climate part', () => {
    const s = game();
    for (let d = 0; d < 40; d++) advanceDay(s);
    for (const n of s.nations) {
      n.emissions = n.gdp * 0.1;
      n.abated = 0;
    }
    s.nations[1].emissions = 0;
    s.nations[1].greenSpend = s.nations[1].gdp * 0.05;
    s.nations[2].emissions = s.nations[2].gdp * 0.4;
    computeProsperity(s);
    expect(s.nations[1].prosperityParts.climate).toBe(100);
    expect(s.nations[2].prosperityParts.climate).toBe(0);
    expect(s.nations[3].prosperityParts.climate).toBeGreaterThan(25);
    expect(s.nations[3].prosperityParts.climate).toBeLessThan(75);
  });

  it('thins every history to a uniform, doubling step', () => {
    const s = game();
    computeProsperity(s);
    // as in the tick: a point whenever the day is on the current grid
    for (let i = 1; i <= HISTORY_MAX * 3; i++) {
      s.day = (Math.floor(s.day / s.historyStep) + 1) * s.historyStep;
      recordHistory(s);
    }
    expect(s.historyStep).toBeGreaterThan(90);
    for (const n of s.nations.filter((x) => x.alive)) {
      expect(n.history.length).toBeLessThanOrEqual(HISTORY_MAX);
      expect(n.history.length).toBeGreaterThan(HISTORY_MAX / 2 - 2);
      for (const h of n.history) expect(h.day % s.historyStep).toBe(0);
      for (let i = 1; i < n.history.length; i++) expect(n.history[i].day - n.history[i - 1].day).toBe(s.historyStep);
    }
  });
});

describe('AI envy of the world #1', () => {
  it('names a runaway leader only when the crown holder is 5% ahead', () => {
    const s = controlled();
    s.nations[0].prosperity = 51.6; // the next best scores 49: 5.3% behind
    expect(runawayLeader(s)).toBe(0);
    s.nations[0].prosperity = 51;
    expect(runawayLeader(s)).toBe(-1);
  });

  it('difficulty knobs replace the old gang-up flag', () => {
    expect([DIFFICULTY.beginner.leaderEnvy, DIFFICULTY.realistic.leaderEnvy, DIFFICULTY.demonic.leaderEnvy]).toEqual([0, 0.08, 0.35]);
    expect([DIFFICULTY.beginner.playerEnvy, DIFFICULTY.realistic.playerEnvy, DIFFICULTY.demonic.playerEnvy]).toEqual([0, 0, 0.1]);
    expect([DIFFICULTY.beginner.leaderAllianceYears, DIFFICULTY.realistic.leaderAllianceYears, DIFFICULTY.demonic.leaderAllianceYears]).toEqual([0, 30, 10]);
    expect('gangUpOnLeader' in DIFFICULTY.demonic).toBe(false);
  });

  it('formats reign lengths', () => {
    expect(yearsFmt(30)).toBe('1 month');
    expect(yearsFmt(365)).toBe('1 year');
    expect(yearsFmt(547)).toBe('1.5 years');
    expect(yearsFmt(365 * 120)).toBe('120 years');
  });
});
