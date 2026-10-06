// Default fillers. Every subsystem that adds state registers one idempotent ensureXDefaults here.
// newGame, save migration (src/save/migrate.ts) and the revival of a dead nation all run the same
// registry, so defaults have a single source. With a nationId only that nation's data is refreshed.
import { ensureLeaderboardDefaults } from './leaderboard';
import { HISTORY_STEP } from './prosperity';
import type { GameState } from './state';

export type DefaultsFiller = (state: GameState, nationId?: number) => void;

/** Settings and the shared notice/history fields. */
export function ensureCoreDefaults(state: GameState): void {
  const s = state.settings;
  s.mapId ??= 'random';
  s.endYear ??= 3000;
  state.notices ??= [];
  state.nextNoticeId ??= 1;
  state.noticeCooldowns ??= {};
  state.historyStep ??= HISTORY_STEP;
}

export const DEFAULTS: DefaultsFiller[] = [ensureCoreDefaults, ensureLeaderboardDefaults];

export function ensureDefaults(state: GameState, nationId?: number): void {
  for (const fill of DEFAULTS) fill(state, nationId);
}
