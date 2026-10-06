import type { Good, UnitType } from '../sim/state';

export interface UnitDef {
  type: UnitType;
  name: string;
  icon: string;
  attack: number;
  defense: number;
  speed: number; // provinces per ~10 days on plains with no roads
  manpower: number; // thousands
  cost: number;
  goods: Partial<Record<Good, number>>;
  upkeep: number; // money/day
  upkeepGoods: Partial<Record<Good, number>>; // per day
  training: number; // days
  tech?: string;
  ignoresTerrain?: boolean;
}

export const UNITS: Record<UnitType, UnitDef> = {
  infantry: {
    type: 'infantry', name: 'Infantry Division', icon: '🪖', attack: 2, defense: 3, speed: 1, manpower: 10,
    cost: 100, goods: { munitions: 10 }, upkeep: 0.6, upkeepGoods: { munitions: 0.05 }, training: 30,
  },
  artillery: {
    type: 'artillery', name: 'Artillery Brigade', icon: '💥', attack: 4.5, defense: 1.5, speed: 0.8, manpower: 5,
    cost: 180, goods: { steel: 8, munitions: 15 }, upkeep: 0.8, upkeepGoods: { munitions: 0.12 }, training: 40,
  },
  armor: {
    type: 'armor', name: 'Armoured Division', icon: '🛡️', attack: 6, defense: 4.5, speed: 1.7, manpower: 6,
    cost: 350, goods: { vehicles: 6, fuel: 5 }, upkeep: 1.4, upkeepGoods: { fuel: 0.15 }, training: 60, tech: 'armored_warfare',
  },
  air: {
    type: 'air', name: 'Air Wing', icon: '✈️', attack: 5.5, defense: 2, speed: 3, manpower: 3,
    cost: 400, goods: { vehicles: 4, fuel: 8 }, upkeep: 1.6, upkeepGoods: { fuel: 0.2 }, training: 60, tech: 'aviation', ignoresTerrain: true,
  },
  drone: {
    type: 'drone', name: 'Drone Swarm', icon: '🛸', attack: 8, defense: 2.5, speed: 3, manpower: 1,
    cost: 450, goods: { electronics: 5 }, upkeep: 1.2, upkeepGoods: { electronics: 0.01 }, training: 45, tech: 'drones', ignoresTerrain: true,
  },
};

export const TERRAIN_DEFENSE: Record<string, number> = {
  plains: 1, desert: 1, tundra: 1.1, forest: 1.25, jungle: 1.35, hills: 1.4, mountains: 1.8, ocean: 1,
};

export const TERRAIN_MOVE: Record<string, number> = {
  plains: 1, desert: 1.3, tundra: 1.4, forest: 1.3, jungle: 1.6, hills: 1.5, mountains: 2.2, ocean: 0.8,
};

export const NUKE_COST = { money: 2500, uranium: 15, days: 240 };
