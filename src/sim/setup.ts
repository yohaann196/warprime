import type { Difficulty, EconSystemId, GameState, Institution, Settings } from './state';
import { ECON_SYSTEMS } from '../data/econSystems';
import { DIFFICULTY } from './difficulty';

export function defaultSettings(seed: number, difficulty: Difficulty = 'realistic'): Settings {
  return { seed, difficulty, nationCount: 18, mapId: 'random', startYear: 1900, endYear: 3000 };
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
    text: `You lead ${n.name}. Survive until ${state.settings.endYear} and lead the world for as long as you can.`,
    kind: 'good',
    nations: [n.id],
  });
}
