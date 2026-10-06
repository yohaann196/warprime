// Advances the world by one day.
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
import { checkVictory, computeProsperity, recordHistory } from './prosperity';
import { markDirty } from './query';
import { researchDay, updateEra } from './tech';
import type { GameState } from './state';
import { PROFILE, profileLap, profileStart } from './profile';

export function advanceDay(state: GameState): void {
  if (state.gameOver) return;
  profileStart();
  markDirty();
  invalidateMods();
  if (state.day === 0) computeProsperity(state);

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
  if (state.day % 30 === 0) {
    for (const n of state.nations) if (n.alive) updateEra(state, n);
    computeProsperity(state);
    checkVictory(state);
  }
  if (state.day % 90 === 0) recordHistory(state);
  profileLap('monthly');
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
}

/** Cools click heat in real time while paused, so clicking stays meaningful on pause. */
export function coolWhilePaused(state: GameState): void {
  if (state.player >= 0) coolClicks(state.nations[state.player]);
}
