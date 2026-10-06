// Advances the world by one day.
//
// Canonical tick order (every subsystem hooks in at its slot; keep this list in sync):
//   1. guard: a finished game stops, unless the eliminated player is spectating
//   2. beginDay: mark the query index dirty, invalidate cached modifiers
//   3. nation economy: production, construction, research, institutions, nukes, click cooling
//   4. trade and prices: auto-trade, contracts, price update
//   5. climateDay (climate subsystem): damage clamps at 100 but never ends the game itself
//   6. military: movement -> navalDay (naval subsystem) -> combat -> siege -> readiness
//   7. wars, opinion, puppets, events
//   8. runAI (planners: economy, military, navy, diplomacy, climate)
//   9. checkAlive for every nation
//  10. day++
//  11. monthly (day % 30): era update, computeProsperity, sampleLeaderboard, AI tiers, climateMonthly
//  12. history (day % state.historyStep)
//  13. yearly (day % 365): world events, climate history
//  14. checkEnd: the ONLY code that sets state.gameOver (climate_collapse | eliminated | year_limit)
import { runAI } from './ai';
import { coolClicks } from './clicks';
import { constructionDay } from './economy/build';
import { autoTrade, contractsDay, resetTradeVolume, updatePrices } from './economy/market';
import { nationEconomyDay } from './economy/production';
import { eventsDay } from './events';
import { devDay } from './institutions';
import { combatDay, movementDay, readinessDay, siegeDay } from './military/combat';
import { nukeProgramDay } from './military/nukes';
import { invalidateMods } from './modifiers';
import { puppetsDay } from './diplomacy/pacts';
import { opinionDay } from './diplomacy/relations';
import { checkAlive, warsDay } from './diplomacy/war';
import { computeProsperity, recordHistory } from './prosperity';
import { checkEnd, SAMPLE_DAYS, sampleLeaderboard } from './leaderboard';
import { markDirty } from './query';
import { researchDay, updateEra } from './tech';
import type { GameState } from './state';
import { PROFILE, profileLap, profileStart } from './profile';

export function advanceDay(state: GameState): void {
  if (state.gameOver && !state.spectating) return;
  profileStart();
  markDirty();
  invalidateMods();
  if (state.day === 0) {
    computeProsperity(state);
    sampleLeaderboard(state, { reset: true });
  }

  for (const n of state.nations) {
    if (!n.alive) continue;
    n.ledger = {};
  }
  for (const n of state.nations) {
    if (!n.alive) continue;
    nationEconomyDay(state, n);
    constructionDay(state, n);
    researchDay(state, n);
    devDay(state, n);
    nukeProgramDay(state, n.id);
    coolClicks(n);
  }
  profileLap('economy');
  for (const n of state.nations) autoTrade(state, n);
  contractsDay(state);
  updatePrices(state);
  resetTradeVolume(state);
  profileLap('market');

  movementDay(state);
  combatDay(state);
  siegeDay(state);
  readinessDay(state);
  profileLap('military');

  warsDay(state);
  opinionDay(state);
  puppetsDay(state);
  eventsDay(state);
  profileLap('diplomacy');
  runAI(state);
  profileLap('ai');

  for (const n of state.nations) checkAlive(state, n.id);
  state.day++;
  if (state.day % SAMPLE_DAYS === 0) {
    for (const n of state.nations) if (n.alive) updateEra(state, n);
    computeProsperity(state);
    sampleLeaderboard(state);
  }
  if (state.day % state.historyStep === 0) recordHistory(state);
  profileLap('monthly');
  checkEnd(state);
  if (PROFILE.now) PROFILE.days++;
}

/** Fills derived values (GDP, logistics, research, prosperity) for a fresh world without advancing time. */
export function warmUp(state: GameState): void {
  markDirty();
  invalidateMods();
  for (const n of state.nations) {
    if (!n.alive) continue;
    nationEconomyDay(state, n);
    n.money = Math.max(n.money, 0);
  }
  computeProsperity(state);
  if (state.day === 0) sampleLeaderboard(state, { reset: true });
}

/** Cools click heat in real time while paused, so clicking stays meaningful on pause. */
export function coolWhilePaused(state: GameState): void {
  if (state.player >= 0) coolClicks(state.nations[state.player]);
}
