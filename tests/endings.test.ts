import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyCommand } from '../src/sim/commands';
import { transferProvince } from '../src/sim/diplomacy/war';
import { checkEnd } from '../src/sim/leaderboard';
import { markDirty, ownedProvinces } from '../src/sim/query';
import { advanceDay } from '../src/sim/tick';
import type { GameState } from '../src/sim/state';
import { game, landNeighbor } from './helpers';

function eliminatePlayer(s: GameState): number {
  const by = landNeighbor(s, s.player);
  for (const pid of [...ownedProvinces(s, s.player)]) transferProvince(s, pid, by);
  markDirty();
  return by;
}

describe('the end of the game', () => {
  it('ends on exactly 1 Jan of the end year, and nothing moves afterwards', () => {
    const s = game(7);
    s.settings.endYear = 1902;
    while (s.day < 729) {
      advanceDay(s);
      expect(s.gameOver).toBeNull();
    }
    advanceDay(s);
    const over = s.gameOver!;
    expect(over.cause).toBe('year_limit');
    expect(s.day).toBe(730);
    expect(over.day).toBe(730);
    expect(over.year).toBe(1902);
    expect(over.player?.survived).toBe(true);
    expect(over.player?.currentRank).toBeGreaterThan(0);
    expect(over.current.length).toBe(s.nations.filter((n) => n.alive).length);
    expect(over.allTime.length).toBe(s.nations.length);
    expect(over.allTime.reduce((a, r) => a + r.daysAtTop, 0)).toBe(730); // the last days off the monthly grid count too
    expect(over.crown).toBeGreaterThanOrEqual(0);
    expect(over.climateDamage).toBeNull();
    const snapshot = JSON.stringify(s);
    advanceDay(s);
    expect(JSON.stringify(s)).toBe(snapshot);
    expect(applyCommand(s, s.player, { type: 'workClick', province: s.nations[s.player].capital })).toEqual({ ok: false, msg: 'The game is over' });
  }, 60_000);

  it('ends when the player nation is eliminated', () => {
    const s = game(7);
    for (let d = 0; d < 40; d++) advanceDay(s);
    const by = eliminatePlayer(s);
    expect(s.gameOver).toBeNull(); // only checkEnd, at the end of a day, ends the game
    advanceDay(s);
    const over = s.gameOver!;
    expect(over.cause).toBe('eliminated');
    expect(over.player?.survived).toBe(false);
    expect(over.player?.eliminatedBy).toBe(by);
    expect(over.player?.currentRank).toBe(0);
    expect(s.leaderboard.records[s.player].diedDay).toBeGreaterThanOrEqual(0);
    expect(over.allTime.map((r) => r.nation)).toContain(s.player);
    expect(over.current.map((r) => r.nation)).not.toContain(s.player);
  });

  it('ends for everyone when Earth becomes uninhabitable, before anything else', () => {
    const s = game(7);
    for (let d = 0; d < 10; d++) advanceDay(s);
    s.climate = { damage: 100 };
    eliminatePlayer(s); // the same day: climate collapse still takes priority
    advanceDay(s);
    expect(s.gameOver?.cause).toBe('climate_collapse');
    expect(s.gameOver?.climateDamage).toBe(100);
    expect(s.gameOver?.player?.survived).toBe(false);
  });

  it('player-less worlds only end with the world', () => {
    const s = game(7);
    s.player = -1;
    for (const n of s.nations) n.isPlayer = false;
    s.settings.endYear = 1901;
    for (let d = 0; d < 365; d++) advanceDay(s);
    expect(s.gameOver?.cause).toBe('year_limit');
    expect(s.gameOver?.player).toBeNull();
  }, 60_000);

  it('lets an eliminated player spectate until the world ends', () => {
    const s = game(7);
    s.settings.endYear = 1901;
    for (let d = 0; d < 30; d++) advanceDay(s);
    eliminatePlayer(s);
    advanceDay(s);
    expect(s.gameOver?.cause).toBe('eliminated');
    const day = s.day;
    advanceDay(s);
    expect(s.day).toBe(day); // stopped
    s.spectating = true;
    advanceDay(s);
    expect(s.day).toBe(day + 1); // the world goes on
    expect(applyCommand(s, s.player, { type: 'buyClickUpgrade' }).ok).toBe(false);
    while (s.spectating) advanceDay(s);
    expect(s.day).toBe(365);
    expect(s.gameOver?.cause).toBe('eliminated');
    expect(s.gameOver?.worldEnd).toEqual({ cause: 'year_limit', day: 365 });
    expect(s.leaderboard.lastSampleDay).toBe(365);
    expect(s.leaderboard.records.reduce((a, r) => a + r.daysAtTop, 0)).toBe(365);
    advanceDay(s);
    expect(s.day).toBe(365);
  }, 60_000);

  it('checkEnd is idempotent once the game is over', () => {
    const s = game(7);
    s.climate = { damage: 100 };
    checkEnd(s);
    const first = JSON.stringify(s.gameOver);
    checkEnd(s);
    expect(JSON.stringify(s.gameOver)).toBe(first);
  });

  it('nothing but checkEnd (src/sim/leaderboard.ts) sets state.gameOver', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(f)) files.push(p);
      }
    };
    walk('src');
    const setters = files.filter((f) => /\.gameOver\s*=(?!=)(?!\s*null\b)/.test(readFileSync(f, 'utf8')));
    expect(setters).toEqual([join('src', 'sim', 'leaderboard.ts')]);
  });
});
