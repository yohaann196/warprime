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

  it('drops v1 victories, and a dead v1 player gets a v2 elimination after one day', () => {
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
    expect(s.gameOver).toBeNull();
    expect(s.leaderboard.records[p].diedDay).toBeGreaterThanOrEqual(0);
    advanceDay(s);
    expect(s.gameOver?.cause).toBe('eliminated');
    expect(s.gameOver?.player?.survived).toBe(false);
    expect(Array.isArray(s.gameOver?.allTime)).toBe(true);

    const won = v1();
    won.gameOver = { winner: 3, type: 'scientific', day: won.day, ranking: [] };
    expect(migrateState(won).gameOver).toBeNull();
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
