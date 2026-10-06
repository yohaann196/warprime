// The only path from stored JSON to a playable GameState: shape check, refuse newer saves, upgrade
// old ones step by step, then run every subsystem's default filler. Pure and DOM-free (no IndexedDB).
import { TECH_BY_ID } from '../data/techs';
import { ensureDefaults } from '../sim/defaults';
import { checkEnd } from '../sim/leaderboard';
import type { GeneratedMap } from '../sim/worldgen/geometry';
import { canResearch } from '../sim/tech';
import type { GameState } from '../sim/state';
import { SAVE_VERSION } from '../sim/version';

export type SaveErrorCode = 'corrupt' | 'newer' | 'unknownMap' | 'mapChanged';

export class SaveError extends Error {
  constructor(
    public code: SaveErrorCode,
    msg: string,
  ) {
    super(msg);
    this.name = 'SaveError';
  }
}

/** Maps a save can be played on. The map registry extends this as data-defined maps arrive. */
export const KNOWN_MAPS = new Set(['random']);

type Raw = Record<string, unknown> & { version: number };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

/** Research the tech table no longer allows is dropped (its progress is lost). */
function dropInvalidResearch(state: GameState): void {
  for (const n of state.nations) {
    const id = n.tech.current;
    if (!id) continue;
    const t = TECH_BY_ID[id];
    if (!t || canResearch(state, n, t) !== null) {
      n.tech.current = null;
      n.tech.progress = 0;
    }
  }
}

/** v1 (victories, 1900–2050) -> v2 (leaderboards, the game ends in 3000). */
function v1to2(s: Loose): void {
  s.settings.mapId ??= 'random'; // every v1 save is a procedural world
  s.settings.endYear = 3000;
  for (const n of s.nations) {
    delete n.yearsGolden;
    delete n.daysHegemon;
  }
  // victories no longer end the game; a dead player gets a v2 'eliminated' ending from checkEnd once
  // migrateState has filled the defaults. The leaderboard is seeded from the prosperity histories by
  // ensureLeaderboardDefaults.
  s.gameOver = null;
  dropInvalidResearch(s);
}

const MIGRATIONS: Record<number, (s: Loose) => void> = { 1: v1to2 };

function isRaw(raw: unknown): raw is Raw {
  if (!raw || typeof raw !== 'object') return false;
  const r = raw as Loose;
  return (
    typeof r.version === 'number' &&
    Number.isInteger(r.version) &&
    r.version >= 1 &&
    !!r.settings &&
    typeof r.settings.seed === 'number' &&
    Array.isArray(r.provinces) &&
    Array.isArray(r.nations) &&
    typeof r.day === 'number'
  );
}

/** Parses save text, mapping JSON errors to SaveError('corrupt'). */
export function parseSave(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new SaveError('corrupt', 'This file is not a Warprime save.');
  }
}

/** Upgrades a parsed save to the current version. Mutates and returns it. */
export function migrateState(raw: unknown): GameState {
  if (!isRaw(raw)) throw new SaveError('corrupt', 'This file is not a Warprime save.');
  if (raw.version > SAVE_VERSION) throw new SaveError('newer', 'Saved with a newer Warprime. Reload the page to update.');
  while (raw.version < SAVE_VERSION) {
    const step = MIGRATIONS[raw.version];
    if (!step) throw new SaveError('corrupt', `No upgrade path from save version ${raw.version}.`);
    step(raw);
    raw.version++;
  }
  const state = raw as unknown as GameState;
  const mapId = (state.settings as { mapId?: string }).mapId ?? 'random';
  if (!KNOWN_MAPS.has(mapId)) throw new SaveError('unknownMap', `This save uses a map this version does not have (${mapId}).`);
  ensureDefaults(state);
  // build an ending the save is owed (a v1 game whose nation had fallen) now rather than on the next
  // day: a loaded game is paused, and a fallen player has no controls to advance it. A no-op otherwise.
  checkEnd(state);
  return state;
}

/**
 * Procedural saves store no geometry: it is rebuilt from the seed. Refuses to load when the rebuilt
 * world no longer matches the provinces in the save.
 */
export function checkMapMatches(state: GameState, map: GeneratedMap): void {
  const ok =
    map.provinces.length === state.provinces.length &&
    map.provinces.every((p, i) => {
      const q = state.provinces[i];
      return q.isSea === p.isSea && q.area === p.area && q.neighbors.length === p.neighbors.length;
    });
  if (!ok) throw new SaveError('mapChanged', 'The world of this save can no longer be rebuilt by this version.');
}
