// Save games and the Hall of Fame live in IndexedDB, in Warprime's own database: github.io origins
// are shared by every project page of a user, so the shared default idb-keyval store is avoided.
// Geometry is regenerated from the seed, so only the state is stored.
import { createStore, del, delMany, entries, get, keys, set, setMany, update } from 'idb-keyval';
import { SAVE_VERSION } from '../sim/version';
import { currentRank } from '../sim/leaderboard';
import { dateString, DAYS_PER_YEAR, yearOf, type Difficulty, type EndCause, type GameState, type Nation } from '../sim/state';
import { APP_VERSION } from '../version';
import { migrateState, parseSave } from './migrate';

export { SaveError } from './migrate';

export interface SaveMeta {
  slot: string;
  nation: string;
  date: string;
  difficulty: string;
  savedAt: number;
  version?: number;
  appVersion?: string;
  mapId?: string;
  year?: number;
  rank?: number;
  crown?: boolean;
  compatible?: boolean; // filled by listSaves
}

const PREFIX = 'warprime:save:';
const HOF_KEY = 'hof';
const HOF_MAX = 100;
const MOVED_FLAG = 'warprime:idb-migrated';

const store = createStore('warprime', 'saves');

let moved: Promise<void> | null = null;

/**
 * One-time move of saves written by older builds into the default idb-keyval store. Copies first and
 * deletes the originals only after the copy succeeded; a localStorage flag makes it run once.
 */
export function migrateLegacyStore(): Promise<void> {
  moved ??= (async () => {
    try {
      if (localStorage.getItem(MOVED_FLAG) === '1') return;
    } catch {
      /* no localStorage: try the move every session, it is idempotent */
    }
    // avoid creating the default database just to find it empty
    const dbs = await indexedDB.databases?.().catch(() => null);
    if (!dbs || dbs.some((d) => d.name === 'keyval-store')) {
      const old = (await entries()).filter(([k]) => typeof k === 'string' && (k.startsWith(PREFIX) || k === 'warprime:hof'));
      if (old.length) {
        const have = new Set(await keys(store));
        const copy = old.map(([k, v]) => [k === 'warprime:hof' ? HOF_KEY : k, v] as [IDBValidKey, unknown]).filter(([k]) => !have.has(k));
        if (copy.length) await setMany(copy, store);
        await delMany(old.map(([k]) => k));
      }
    }
    try {
      localStorage.setItem(MOVED_FLAG, '1');
    } catch {
      /* ignore */
    }
  })().catch(() => {
    /* best-effort: a failed move leaves the old saves where they were */
  });
  return moved;
}

export async function saveGame(state: GameState, slot = 'manual'): Promise<void> {
  await migrateLegacyStore();
  const p = state.player >= 0 ? state.nations[state.player] : null;
  const meta: SaveMeta = {
    slot,
    nation: p?.name ?? '?',
    date: dateString(state),
    difficulty: state.settings.difficulty,
    savedAt: Date.now(),
    version: state.version,
    appVersion: APP_VERSION,
    mapId: state.settings.mapId,
    year: yearOf(state),
    rank: p ? currentRank(state, p.id) : 0,
    crown: !!p && state.leaderboard.crown === p.id,
  };
  await set(PREFIX + slot, { meta, state: JSON.stringify(state) }, store);
}

export async function autosave(state: GameState): Promise<void> {
  try {
    await saveGame(state, 'autosave');
  } catch {
    /* storage may be unavailable (private mode); autosave is best-effort */
  }
}

export async function loadGame(slot: string): Promise<GameState | null> {
  await migrateLegacyStore();
  const rec = (await get(PREFIX + slot, store)) as { state: string } | undefined;
  if (!rec) return null;
  return migrateState(parseSave(rec.state));
}

export async function listSaves(): Promise<SaveMeta[]> {
  try {
    await migrateLegacyStore();
    const all = (await keys(store)).filter((k) => typeof k === 'string' && k.startsWith(PREFIX)) as string[];
    const metas: SaveMeta[] = [];
    for (const k of all) {
      const rec = (await get(k, store)) as { meta: SaveMeta } | undefined;
      if (rec?.meta) metas.push({ ...rec.meta, compatible: (rec.meta.version ?? 1) <= SAVE_VERSION });
    }
    return metas.sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

export async function deleteSave(slot: string): Promise<void> {
  await migrateLegacyStore();
  await del(PREFIX + slot, store);
}

export function exportSave(state: GameState): string {
  return JSON.stringify(state);
}

export function importSave(text: string): GameState {
  return migrateState(parseSave(text));
}

// ------------------------------------------------------------------ Hall of Fame

export interface HallOfFameEntry {
  runId: string;
  recordedAt: number;
  appVersion: string;
  mapId: string;
  seed: number;
  difficulty: Difficulty;
  nationName: string;
  flag: Nation['flag'];
  color: string;
  cause: EndCause;
  endYear: number; // calendar year the game ended
  survived: boolean;
  diedYear: number | null;
  finalRank: number | null; // monthly rank at the end, null if eliminated
  aliveCount: number;
  allTimeRank: number;
  nationCount: number;
  yearsAtTop: number;
  yearsTop3: number;
  bestRank: number;
  peakProsperity: number;
  legacy: number;
  allTimeLeader: string;
  crownAtEnd: string;
}

/** The Hall of Fame row for a finished game with a player (null otherwise). */
export function buildHallEntry(state: GameState): HallOfFameEntry | null {
  const over = state.gameOver;
  const pf = over?.player;
  if (!over || !pf || !state.runId) return null;
  const n = state.nations[pf.nation];
  const name = (id: number | undefined) => (id !== undefined && id >= 0 ? state.nations[id].name : '—');
  return {
    runId: state.runId,
    recordedAt: Date.now(),
    appVersion: APP_VERSION,
    mapId: state.settings.mapId,
    seed: state.settings.seed,
    difficulty: state.settings.difficulty,
    nationName: n.name,
    flag: n.flag,
    color: n.color,
    cause: over.cause,
    endYear: over.year,
    survived: pf.survived,
    diedYear: pf.diedDay >= 0 ? state.settings.startYear + Math.floor(pf.diedDay / DAYS_PER_YEAR) : null,
    finalRank: pf.survived ? pf.currentRank : null,
    aliveCount: pf.aliveCount,
    allTimeRank: pf.allTimeRank,
    nationCount: pf.nationCount,
    yearsAtTop: Math.round((pf.daysAtTop / DAYS_PER_YEAR) * 10) / 10,
    yearsTop3: Math.round((pf.daysTop3 / DAYS_PER_YEAR) * 10) / 10,
    bestRank: pf.bestRank,
    peakProsperity: pf.peakProsperity,
    legacy: pf.legacy,
    allTimeLeader: name(over.allTime[0]?.nation),
    crownAtEnd: name(over.crown),
  };
}

const byLegacy = (a: HallOfFameEntry, b: HallOfFameEntry) => b.legacy - a.legacy || b.recordedAt - a.recordedAt;

/** Adds or replaces (by runId) a finished run; keeps the best HOF_MAX runs. Best-effort. */
export async function recordRun(entry: HallOfFameEntry): Promise<void> {
  try {
    await migrateLegacyStore();
    await update(
      HOF_KEY,
      (old: HallOfFameEntry[] | undefined) => {
        const list = (old ?? []).filter((e) => e.runId !== entry.runId);
        list.push(entry);
        list.sort(byLegacy);
        return list.slice(0, HOF_MAX);
      },
      store,
    );
  } catch {
    /* storage may be unavailable (private mode) */
  }
}

export async function listHallOfFame(): Promise<HallOfFameEntry[]> {
  try {
    await migrateLegacyStore();
    return (((await get(HOF_KEY, store)) as HallOfFameEntry[] | undefined) ?? []).slice().sort(byLegacy);
  } catch {
    return [];
  }
}

export async function clearHallOfFame(): Promise<void> {
  try {
    await del(HOF_KEY, store);
  } catch {
    /* ignore */
  }
}
