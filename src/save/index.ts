// Save games live in IndexedDB. Geometry is regenerated from the seed, so only the state is stored.
import { del, get, keys, set } from 'idb-keyval';
import { SAVE_VERSION } from '../sim/worldgen';
import { dateString, type GameState } from '../sim/state';

export interface SaveMeta {
  slot: string;
  nation: string;
  date: string;
  difficulty: string;
  savedAt: number;
}

const PREFIX = 'warprime:save:';

export async function saveGame(state: GameState, slot = 'manual'): Promise<void> {
  const meta: SaveMeta = {
    slot,
    nation: state.player >= 0 ? state.nations[state.player].name : '?',
    date: dateString(state),
    difficulty: state.settings.difficulty,
    savedAt: Date.now(),
  };
  await set(PREFIX + slot, { meta, state: JSON.stringify(state) });
}

export async function autosave(state: GameState): Promise<void> {
  try {
    await saveGame(state, 'autosave');
  } catch {
    /* storage may be unavailable (private mode); autosave is best-effort */
  }
}

export async function loadGame(slot: string): Promise<GameState | null> {
  const rec = (await get(PREFIX + slot)) as { state: string } | undefined;
  if (!rec) return null;
  const state = JSON.parse(rec.state) as GameState;
  if (state.version !== SAVE_VERSION) throw new Error('This save is from an incompatible version');
  return state;
}

export async function listSaves(): Promise<SaveMeta[]> {
  try {
    const all = (await keys()).filter((k) => typeof k === 'string' && k.startsWith(PREFIX)) as string[];
    const metas: SaveMeta[] = [];
    for (const k of all) {
      const rec = (await get(k)) as { meta: SaveMeta } | undefined;
      if (rec?.meta) metas.push(rec.meta);
    }
    return metas.sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

export async function deleteSave(slot: string): Promise<void> {
  await del(PREFIX + slot);
}

export function exportSave(state: GameState): string {
  return JSON.stringify(state);
}

export function importSave(text: string): GameState {
  const state = JSON.parse(text) as GameState;
  if (!state || state.version !== SAVE_VERSION || !Array.isArray(state.provinces)) throw new Error('Not a valid Warprime save');
  return state;
}
