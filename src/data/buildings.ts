import type { BuildingId, Good, Resource, Terrain } from '../sim/state';

export type BuildingCategory = 'raw' | 'factory' | 'civil' | 'military';

export interface BuildingDef {
  id: BuildingId;
  name: string;
  icon: string;
  category: BuildingCategory;
  desc: string;
  cost: number; // money for level 1; scales with level
  goods?: Partial<Record<Good, number>>; // material cost per level
  work: number; // construction work (days at normal speed)
  maxLevel: number;
  tech?: string;
  resource?: Resource[]; // province must hold one of these resources
  terrain?: Terrain[]; // allowed terrains
  coastal?: boolean;
  inputs?: Partial<Record<Good, number>>; // per level per day
  outputs?: Partial<Record<Good, number>>; // per level per day (resource-matched for mines)
  workers: number; // thousands of pop per level
  upkeep: number; // money per level per day
}

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  farm: {
    id: 'farm', name: 'Farm', icon: '🌾', category: 'raw', desc: 'Grows food to feed your people.',
    cost: 120, work: 40, maxLevel: 5, terrain: ['plains', 'forest', 'hills', 'jungle'],
    outputs: { food: 3.5 }, workers: 25, upkeep: 0.2,
  },
  sawmill: {
    id: 'sawmill', name: 'Sawmill', icon: '🪵', category: 'raw', desc: 'Cuts timber for construction and consumer goods.',
    cost: 120, work: 40, maxLevel: 5, terrain: ['forest', 'jungle', 'hills', 'tundra'],
    outputs: { wood: 4 }, workers: 15, upkeep: 0.2,
  },
  mine: {
    id: 'mine', name: 'Mine', icon: '⛏️', category: 'raw', desc: 'Extracts the province\'s mineral deposit (iron, coal, uranium or rare metals).',
    cost: 250, work: 60, maxLevel: 5, resource: ['iron', 'coal', 'uranium', 'rare'],
    outputs: {}, workers: 20, upkeep: 0.4,
  },
  oil_well: {
    id: 'oil_well', name: 'Oil Well', icon: '🛢️', category: 'raw', desc: 'Pumps crude oil.',
    cost: 350, work: 70, maxLevel: 5, resource: ['oil'], tech: 'combustion',
    outputs: { oil: 3 }, workers: 10, upkeep: 0.5,
  },
  steel_mill: {
    id: 'steel_mill', name: 'Steel Mill', icon: '🔩', category: 'factory', desc: 'Iron + coal → steel. The backbone of industry.',
    cost: 500, work: 90, maxLevel: 5, inputs: { iron: 2, coal: 1 }, outputs: { steel: 2 }, workers: 30, upkeep: 0.8,
  },
  refinery: {
    id: 'refinery', name: 'Refinery', icon: '⛽', category: 'factory', desc: 'Oil → fuel for tanks and planes.',
    cost: 550, work: 90, maxLevel: 5, tech: 'combustion', inputs: { oil: 2 }, outputs: { fuel: 2 }, workers: 15, upkeep: 0.8,
  },
  munitions_plant: {
    id: 'munitions_plant', name: 'Munitions Plant', icon: '💣', category: 'factory', desc: 'Steel + coal → munitions to equip and supply armies.',
    cost: 450, work: 80, maxLevel: 5, inputs: { steel: 1, coal: 0.5 }, outputs: { munitions: 3 }, workers: 20, upkeep: 0.6,
  },
  consumer_factory: {
    id: 'consumer_factory', name: 'Consumer Goods Factory', icon: '🛋️', category: 'factory', desc: 'Wood + steel → consumer goods. Happy citizens buy them.',
    cost: 400, work: 80, maxLevel: 5, inputs: { wood: 1, steel: 0.5 }, outputs: { consumer: 3 }, workers: 25, upkeep: 0.6,
  },
  vehicle_plant: {
    id: 'vehicle_plant', name: 'Vehicle Plant', icon: '🚚', category: 'factory', desc: 'Steel + fuel → vehicles for armour and air wings.',
    cost: 800, work: 120, maxLevel: 5, tech: 'motorization', inputs: { steel: 2, fuel: 1 }, outputs: { vehicles: 1 }, workers: 30, upkeep: 1.2,
  },
  electronics_plant: {
    id: 'electronics_plant', name: 'Electronics Plant', icon: '💾', category: 'factory', desc: 'Rare metals + steel → electronics.',
    cost: 1000, work: 140, maxLevel: 5, tech: 'electronics', inputs: { rare: 1, steel: 0.5 }, outputs: { electronics: 1 }, workers: 20, upkeep: 1.5,
  },
  power_plant: {
    id: 'power_plant', name: 'Power Plant', icon: '⚡', category: 'civil', desc: 'Burns coal; +20% output per level for factories in this province.',
    cost: 600, work: 100, maxLevel: 3, tech: 'electricity', inputs: { coal: 1 }, workers: 5, upkeep: 0.5,
  },
  university: {
    id: 'university', name: 'University', icon: '🎓', category: 'civil', desc: '+3 research per day per level.',
    cost: 400, work: 100, maxLevel: 5, workers: 5, upkeep: 1.5,
  },
  market_hall: {
    id: 'market_hall', name: 'Market Hall', icon: '🏪', category: 'civil', desc: 'Earns trade money; scales with roads, population and trade bonuses.',
    cost: 300, work: 60, maxLevel: 5, workers: 10, upkeep: 0.3,
  },
  admin_office: {
    id: 'admin_office', name: 'Administration Office', icon: '🗄️', category: 'civil', desc: '+3 automatic clicks per day and +2% tax efficiency per level.',
    cost: 350, work: 70, maxLevel: 5, workers: 5, upkeep: 0.8,
  },
  barracks: {
    id: 'barracks', name: 'Barracks', icon: '🎖️', category: 'military', desc: 'Recruit divisions here; +manpower and faster training.',
    cost: 250, work: 50, maxLevel: 3, workers: 5, upkeep: 0.5,
  },
  fort: {
    id: 'fort', name: 'Fortress', icon: '🏰', category: 'military', desc: 'Garrison and defensive bonus; slows sieges.',
    cost: 300, goods: { steel: 5 }, work: 80, maxLevel: 4, workers: 2, upkeep: 0.6,
  },
  port: {
    id: 'port', name: 'Port', icon: '⚓', category: 'military', desc: 'Lets armies embark across the sea and boosts trade.',
    cost: 300, work: 70, maxLevel: 3, coastal: true, workers: 10, upkeep: 0.4,
  },
};

export const MINE_OUTPUT: Record<Resource, number> = {
  food: 0, wood: 0, iron: 3, coal: 3, oil: 0, uranium: 0.6, rare: 1,
};

export const BASE_PRICES: Record<Good, number> = {
  food: 2, wood: 2, iron: 3, coal: 3, oil: 5, uranium: 20, rare: 12,
  steel: 8, fuel: 9, munitions: 6, consumer: 7, vehicles: 30, electronics: 40,
};

export const GOOD_ICONS: Record<Good, string> = {
  food: '🌾', wood: '🪵', iron: '⛓️', coal: '🪨', oil: '🛢️', uranium: '☢️', rare: '💎',
  steel: '🔩', fuel: '⛽', munitions: '💣', consumer: '🛋️', vehicles: '🚚', electronics: '💾',
};

export const GOOD_NAMES: Record<Good, string> = {
  food: 'Food', wood: 'Wood', iron: 'Iron', coal: 'Coal', oil: 'Oil', uranium: 'Uranium', rare: 'Rare metals',
  steel: 'Steel', fuel: 'Fuel', munitions: 'Munitions', consumer: 'Consumer goods', vehicles: 'Vehicles', electronics: 'Electronics',
};

export function buildingCost(def: BuildingDef, currentLevel: number): number {
  return Math.round(def.cost * Math.pow(1.6, currentLevel));
}
