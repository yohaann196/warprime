import type { Difficulty, EconSystemId, GameState, Institution, Settings } from './state';
import { ECON_SYSTEMS } from '../data/econSystems';
import { DIFFICULTY } from './difficulty';

export function defaultSettings(seed: number, difficulty: Difficulty = 'realistic'): Settings {
  return { seed, difficulty, nationCount: 18, startYear: 1900, endYear: 2050 };
}

export interface PlayerSetup {
  nation: number;
  econSystem: EconSystemId;
  goals: [Institution, Institution];
}

/** Hands a nation over to the player and applies starting choices. */
export function choosePlayerNation(state: GameState, setup: PlayerSetup): void {
  for (const n of state.nations) n.isPlayer = false;
  const n = state.nations[setup.nation];
  n.isPlayer = true;
  n.econSystem = ECON_SYSTEMS[setup.econSystem] ? setup.econSystem : 'mixed';
  n.goals = setup.goals;
  n.money += DIFFICULTY[state.settings.difficulty].playerStartMoney;
  state.player = n.id;
  state.log.push({
    day: state.day,
    text: `You lead ${n.name}. Build the most prosperous nation in the world by ${state.settings.endYear}.`,
    kind: 'good',
    nations: [n.id],
  });
}
