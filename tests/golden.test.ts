// Golden replay: two years of AI play hashed through a projection of the state. The performance
// caches (query index, opinion index, modifier split, strength cache, hot-loop rewrites) must leave
// these hashes untouched; a change here means the simulation itself changed.
import { describe, expect, it } from 'vitest';
import { newGame } from '../src/sim/worldgen';
import { defaultSettings } from '../src/sim/setup';
import { advanceDay } from '../src/sim/tick';
import { GOODS, type GameState } from '../src/sim/state';
import { game } from './helpers';

const r6 = (x: number) => Math.round(x * 1e6);

/** The parts of the state that matter for balance, with floats rounded to 1e-6. */
export function projection(s: GameState): unknown {
  return {
    day: s.day,
    provinces: s.provinces
      .filter((p) => !p.isSea)
      .map((p) => [p.owner, p.controller, r6(p.pop), Object.keys(p.buildings).sort().map((b) => `${b}${p.buildings[b as keyof typeof p.buildings]}`).join(',')]),
    nations: s.nations.map((n) => [n.alive, r6(n.money), r6(n.gdp), r6(n.debt), GOODS.map((g) => r6(n.stock[g])), n.tech.researched.join(','), n.era]),
    divisions: s.divisions.map((d) => [d.id, d.owner, d.province, r6(d.strength), r6(d.org)]),
    wars: s.wars.map((w) => [w.id, w.attackers.join(','), w.defenders.join(','), w.score]),
    pacts: s.pacts.map((p) => [p.id, p.type, p.a, p.b, p.until]),
    daysAtTop: s.leaderboard.records.map((r) => r.daysAtTop),
    pending: s.pendingEvents.map((e) => `${e.id}@${e.day}`),
  };
}

/** cyrb53: a 53-bit string hash, plenty for a golden check. */
export function hash53(text: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export function stateHash(s: GameState): number {
  return hash53(JSON.stringify(projection(s)));
}

function run(s: GameState, days: number): number {
  for (let d = 0; d < days; d++) advanceDay(s);
  return stateHash(s);
}

// Pinned from the v2 code before the Phase 3 performance work (commit 85384ca).
// seed1 and seed7 re-pinned when the climate subsystem (Clean Energy Plants in the AI build scoring) landed.
const PINNED = {
  seed1: 1771467202686094,
  seed7: 5149588031409522,
  player9: 6950282814737726,
};

describe('golden replay (730 days)', () => {
  it('seed 1, all AI', () => {
    expect(run(newGame(defaultSettings(1, 'realistic')).state, 730)).toBe(PINNED.seed1);
  }, 120_000);

  it('seed 7, all AI', () => {
    expect(run(newGame(defaultSettings(7, 'realistic')).state, 730)).toBe(PINNED.seed7);
  }, 120_000);

  it('seed 9 with a player nation', () => {
    expect(run(game(9), 730)).toBe(PINNED.player9);
  }, 120_000);
});
