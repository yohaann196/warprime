import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkMapMatches, migrateState, parseSave, SaveError } from '../src/save/migrate';
import { advanceDay } from '../src/sim/tick';
import { SAVE_VERSION } from '../src/sim/version';
import { SAVE_VERSION as WORLDGEN_SAVE_VERSION } from '../src/sim/worldgen';
import { generateMap } from '../src/sim/worldgen/geometry';
import type { GameState } from '../src/sim/state';
import { clone, game, invariants } from './helpers';

const FIXTURE = readFileSync('tests/fixtures/save-v1.json', 'utf8');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const v1 = (): any => JSON.parse(FIXTURE);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function codeOf(f: () => unknown): string | null {
  try {
    f();
    return null;
  } catch (e) {
    return e instanceof SaveError ? e.code : `not a SaveError: ${(e as Error).message}`;
  }
}

describe('save migration', () => {
  it('upgrades the v1 fixture to v2 and seeds the leaderboard from history', () => {
    const raw = v1();
    expect(raw.version).toBe(1);
    const s = migrateState(raw);
    expect(SAVE_VERSION).toBe(2);
    expect(WORLDGEN_SAVE_VERSION).toBe(SAVE_VERSION);
    expect(s.version).toBe(2);
    expect(s.settings.mapId).toBe('random');
    expect(s.settings.endYear).toBe(3000);
    expect(s.gameOver).toBeNull();
    for (const n of s.nations) {
      expect('yearsGolden' in n).toBe(false);
      expect('daysHegemon' in n).toBe(false);
    }
    expect(s.notices).toEqual([]);
    expect(s.nextNoticeId).toBe(1);
    expect(s.historyStep).toBe(90);
    const lb = s.leaderboard;
    expect(lb.records.length).toBe(s.nations.length);
    expect(lb.lastSampleDay).toBe(240);
    expect(sum(lb.records.map((r) => r.daysAtTop))).toBe(lb.lastSampleDay);
    expect(sum(lb.records.map((r) => r.daysTop3))).toBe(3 * lb.lastSampleDay);
    expect(lb.crown).toBe(lb.order[0]);
    expect(lb.reigns.length).toBeGreaterThan(0);
    expect(lb.reigns[0].start).toBe(0);
    expect(lb.allTimeOrder.length).toBe(s.nations.length);
    // the world is rebuilt from the seed: it must match the saved provinces
    expect(() => checkMapMatches(s, generateMap(s.settings.seed))).not.toThrow();
  });

  it('a migrated v1 game runs on for a year with every invariant intact', () => {
    const s = migrateState(v1());
    for (let d = 0; d < 365; d++) advanceDay(s);
    invariants(s);
    expect(s.day).toBe(240 + 365);
    expect(s.leaderboard.lastSampleDay).toBe(600);
  }, 60_000);

  it('drops v1 victories, and a dead v1 player gets its v2 elimination on load', () => {
    const raw = v1();
    const p = raw.player;
    const heir = raw.nations.find((n: { id: number }) => n.id !== p).id;
    for (const pr of raw.provinces) {
      if (pr.owner === p) pr.owner = heir;
      if (pr.controller === p) pr.controller = heir;
    }
    raw.nations[p].alive = false;
    raw.divisions = raw.divisions.filter((d: { owner: number }) => d.owner !== p);
    raw.gameOver = { winner: heir, type: 'defeat', day: raw.day, ranking: [] };
    const s = migrateState(raw);
    // a loaded game is paused and a fallen player has no time controls: the ending must exist at once
    expect(s.gameOver?.cause).toBe('eliminated');
    expect(s.gameOver?.day).toBe(240);
    expect(s.gameOver?.worldEnd).toBeUndefined();
    expect(s.gameOver?.player?.survived).toBe(false);
    expect(s.gameOver?.player?.eliminatedBy).toBe(heir);
    expect(s.gameOver?.allTime.length).toBe(s.nations.length);
    expect(s.leaderboard.records[p].diedDay).toBeGreaterThanOrEqual(0);
    expect(sum(s.leaderboard.records.map((r) => r.daysAtTop))).toBe(240);
    advanceDay(s);
    expect(s.day).toBe(240); // over until the player chooses to spectate

    const won = v1();
    won.gameOver = { winner: 3, type: 'scientific', day: won.day, ranking: [] };
    expect(migrateState(won).gameOver).toBeNull();
  });

  it('seeds a late v1 save from the days every history still covers', () => {
    // v1 kept a point every 90 days for the living nations and only the last 400 of them: by 2009 the
    // survivors' histories start in 1911, while a nation that fell early kept all of its points
    const raw = v1();
    const DAY = 40050;
    const early = 5; // fell in 1902
    const late = 6; // led the world until it fell in 1982
    const LATE_END = 29970;
    raw.day = DAY;
    const points = (from: number, to: number, p: (d: number) => number) => {
      const h = [];
      for (let d = from; d <= to; d += 90) h.push({ day: d, prosperity: p(d), gdp: 100 });
      return h;
    };
    for (const n of raw.nations) n.history = points(90, DAY, (d) => 40 + ((n.id * 7 + d / 90) % 13)).slice(-400);
    raw.nations[early].history = points(90, 900, () => 999);
    raw.nations[late].history = points(90, LATE_END, () => 500);
    for (const id of [early, late]) {
      raw.nations[id].alive = false;
      for (const pr of raw.provinces) {
        if (pr.owner === id) pr.owner = 1;
        if (pr.controller === id) pr.controller = 1;
      }
    }
    raw.divisions = raw.divisions.filter((d: { owner: number }) => d.owner !== early && d.owner !== late);
    const s = migrateState(raw);
    const lb = s.leaderboard;
    const first = DAY - 399 * 90;
    expect(s.nations[0].history[0].day).toBe(first);
    // the early dead are not ranked against survivors whose samples are gone
    expect(lb.records[early]).toMatchObject({ daysAtTop: 0, daysTop3: 0, rankPoints: 0, bestRank: 0, reigns: 0, diedDay: 900, peakProsperity: 999 });
    expect(lb.reigns.some((r) => r.nation === early)).toBe(false);
    expect(lb.decades.some((d) => d.holders.some(([id]) => id === early))).toBe(false);
    // the first complete sample's leader takes the time before it, and no one is credited past their last sample
    expect(lb.reigns[0]).toMatchObject({ nation: late, start: 0 });
    expect(lb.decades[0]).toMatchObject({ start: 1900, holders: [[late, 3650]] });
    expect(lb.records[late].diedDay).toBe(LATE_END);
    expect(lb.records[late].daysAtTop).toBe(LATE_END);
    expect(lb.lastSampleDay).toBe(DAY);
    expect(sum(lb.records.map((r) => r.daysAtTop))).toBe(DAY);
    expect(sum(lb.records.map((r) => r.daysTop3))).toBe(3 * DAY);
    expect(lb.allTimeOrder[0]).toBe(late);
    expect(s.gameOver).toBeNull();
  });

  it('clears research the current tech table does not allow', () => {
    const raw = v1();
    raw.nations[1].tech.current = 'singularity_project';
    raw.nations[1].tech.progress = 500;
    raw.nations[2].tech.current = 'no_such_tech';
    const s = migrateState(raw);
    expect(s.nations[1].tech.current).toBeNull();
    expect(s.nations[1].tech.progress).toBe(0);
    expect(s.nations[2].tech.current).toBeNull();
  });

  it('is a no-op on a current save', () => {
    const s = game(3);
    for (let d = 0; d < 100; d++) advanceDay(s);
    const copy = clone(s);
    expect(migrateState(clone(s))).toEqual(copy);
  });

  it('refuses newer, corrupt, unknown-map and changed-map saves', () => {
    const newer = v1();
    newer.version = 99;
    expect(codeOf(() => migrateState(newer))).toBe('newer');
    expect(codeOf(() => parseSave('{not json'))).toBe('corrupt');
    expect(codeOf(() => migrateState({ hello: 'world' }))).toBe('corrupt');
    expect(codeOf(() => migrateState(null))).toBe('corrupt');
    const odd = clone(game(3));
    (odd.settings as { mapId: string }).mapId = 'middle_earth';
    expect(codeOf(() => migrateState(odd))).toBe('unknownMap');
    const s: GameState = migrateState(v1());
    expect(codeOf(() => checkMapMatches(s, generateMap(s.settings.seed + 1)))).toBe('mapChanged');
  });
});
