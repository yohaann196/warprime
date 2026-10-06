// Test handle for end-to-end runs. Present in production builds too (CI tests the real dist), but only
// installed when the page URL has ?e2e=1. It changes the world the same way the sim would and then
// lets checkEnd decide, so the endings it triggers are the real ones.
import { transferProvince } from '../sim/diplomacy/war';
import { checkEnd, dayOfYear } from '../sim/leaderboard';
import { ownedProvinces } from '../sim/query';
import type { EndCause } from '../sim/state';
import type { Game } from './game';

export interface DebugHandle {
  game: Game;
  /** Brings about an ending: kills the player, ruins the climate, or moves time to the last day. */
  endGame(cause: EndCause): void;
  /** Moves the calendar to a day (no simulation in between). */
  jumpToDay(day: number): void;
}

function killPlayer(g: Game): void {
  const s = g.state;
  const me = s.player;
  const heir = s.nations.find((n) => n.alive && n.id !== me);
  if (me < 0 || !heir) return;
  for (const pid of [...ownedProvinces(s, me)]) transferProvince(s, pid, heir.id);
}

export function installDebugHandle(g: Game): void {
  if (typeof window === 'undefined' || new URLSearchParams(window.location.search).get('e2e') !== '1') return;
  const handle: DebugHandle = {
    game: g,
    endGame(cause) {
      const s = g.state;
      if (!s || g.screen !== 'playing') return;
      if (cause === 'eliminated') killPlayer(g);
      else if (cause === 'climate_collapse') s.climate = { ...s.climate, damage: 100 };
      else s.day = Math.max(s.day, dayOfYear(s, s.settings.endYear));
      checkEnd(s);
      g.refresh();
    },
    jumpToDay(day) {
      if (!g.state || g.screen !== 'playing') return;
      g.state.day = Math.max(0, Math.floor(day));
      g.refresh();
    },
  };
  (window as unknown as { __warprime: DebugHandle }).__warprime = handle;
}
