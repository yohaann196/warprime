import type { Mods } from './modifiers';

export type TechLine = 'industry' | 'military' | 'society' | 'science';

export interface TechDef {
  id: string;
  name: string;
  line: TechLine;
  era: number;
  desc: string;
  mods?: Mods;
  requires?: string[];
  costMult?: number;
  minYear?: number;
  minDays?: number; // passive research can't finish it faster than this (clicks can)
}

export const ERAS = [
  { name: 'Industrial Age', year: 1900, color: '#b08850' },
  { name: 'Mechanized Age', year: 1925, color: '#7f8c8d' },
  { name: 'Atomic Age', year: 1950, color: '#27ae60' },
  { name: 'Information Age', year: 1980, color: '#2980b9' },
  { name: 'Future Age', year: 2010, color: '#8e44ad' },
];

export const TECH_LINES: { id: TechLine; name: string }[] = [
  { id: 'industry', name: 'Industry' },
  { id: 'military', name: 'Military' },
  { id: 'society', name: 'Society' },
  { id: 'science', name: 'Science' },
];

export const TECHS: TechDef[] = [
  // Era 0 — Industrial
  { id: 'mechanization', name: 'Mechanization', line: 'industry', era: 0, desc: 'Machine tools everywhere.', mods: { factory: 0.1 } },
  { id: 'combustion', name: 'Internal Combustion', line: 'industry', era: 0, desc: 'Unlocks Oil Wells and Refineries.' },
  { id: 'rifling', name: 'Modern Rifles', line: 'military', era: 0, desc: 'Better small arms.', mods: { attack: 0.1 } },
  { id: 'trench_warfare', name: 'Trench Warfare', line: 'military', era: 0, desc: 'Dig in and hold.', mods: { defense: 0.15 } },
  { id: 'public_schools', name: 'Public Schools', line: 'society', era: 0, desc: 'Literate workers, faster research.', mods: { research: 0.1 } },
  { id: 'labor_rights', name: 'Labour Rights', line: 'society', era: 0, desc: 'Shorter hours, happier people.', mods: { happiness: 5 } },
  { id: 'electricity', name: 'Electrification', line: 'science', era: 0, desc: 'Unlocks Power Plants.', mods: { factory: 0.05 } },
  { id: 'telegraph', name: 'Telegraph Networks', line: 'science', era: 0, desc: 'Faster markets.', mods: { trade: 0.1 } },
  // Era 1 — Mechanized
  { id: 'assembly_line', name: 'Assembly Line', line: 'industry', era: 1, desc: 'Mass production.', mods: { factory: 0.15, buildCost: -0.1 }, requires: ['mechanization'] },
  { id: 'motorization', name: 'Motorization', line: 'industry', era: 1, desc: 'Unlocks Vehicle Plants.', requires: ['combustion'] },
  { id: 'armored_warfare', name: 'Armoured Warfare', line: 'military', era: 1, desc: 'Unlocks Armoured Divisions.', requires: ['motorization'] },
  { id: 'aviation', name: 'Military Aviation', line: 'military', era: 1, desc: 'Unlocks Air Wings.', requires: ['combustion'] },
  { id: 'welfare_state', name: 'Welfare State', line: 'society', era: 1, desc: 'A safety net for all.', mods: { happiness: 8, popGrowth: 0.05 } },
  { id: 'mass_media', name: 'Mass Media', line: 'society', era: 1, desc: 'Radio speeches unite the nation.', mods: { stability: 5 } },
  { id: 'radio', name: 'Radio', line: 'science', era: 1, desc: 'Instant communication.', mods: { research: 0.1, attack: 0.05 } },
  { id: 'chemistry', name: 'Industrial Chemistry', line: 'science', era: 1, desc: 'Fertilisers and synthetics.', mods: { food: 0.2, raw: 0.1 } },
  // Era 2 — Atomic
  { id: 'automation', name: 'Automation', line: 'industry', era: 2, desc: 'Machines that run themselves.', mods: { autoClick: 6, factory: 0.05 }, requires: ['assembly_line'] },
  { id: 'plastics', name: 'Plastics', line: 'industry', era: 2, desc: 'Cheap consumer goods.', mods: { consumer: 0.25 } },
  { id: 'jet_engines', name: 'Jet Engines', line: 'military', era: 2, desc: 'Faster, deadlier aircraft.', mods: { attack: 0.1 }, requires: ['aviation'] },
  { id: 'nuclear_weapons', name: 'Nuclear Weapons', line: 'military', era: 2, desc: 'Unlocks warhead production. Using them will make the whole world hate you.', requires: ['atomic_theory'], costMult: 1.5 },
  { id: 'green_revolution', name: 'Green Revolution', line: 'society', era: 2, desc: 'High-yield crops.', mods: { food: 0.3, popGrowth: 0.1 }, requires: ['chemistry'] },
  { id: 'civil_rights', name: 'Civil Rights', line: 'society', era: 2, desc: 'Equality before the law.', mods: { happiness: 5, stability: 5 } },
  { id: 'atomic_theory', name: 'Atomic Theory', line: 'science', era: 2, desc: 'Unlocks Uranium mining.', mods: { research: 0.05 } },
  { id: 'computers', name: 'Computers', line: 'science', era: 2, desc: 'Calculation at scale.', mods: { research: 0.15 } },
  // Era 3 — Information
  { id: 'electronics', name: 'Microelectronics', line: 'industry', era: 3, desc: 'Unlocks Electronics Plants.', requires: ['computers'] },
  { id: 'globalization', name: 'Globalization', line: 'industry', era: 3, desc: 'Containers and supply chains.', mods: { trade: 0.2 } },
  { id: 'drones', name: 'Drone Warfare', line: 'military', era: 3, desc: 'Unlocks Drone Swarms.', requires: ['electronics'] },
  { id: 'precision_weapons', name: 'Precision Weapons', line: 'military', era: 3, desc: 'Guided munitions.', mods: { attack: 0.2 } },
  { id: 'internet', name: 'The Internet', line: 'society', era: 3, desc: 'Everyone connected.', mods: { research: 0.15, trade: 0.1 }, requires: ['computers'] },
  { id: 'service_economy', name: 'Service Economy', line: 'society', era: 3, desc: 'Value from knowledge.', mods: { services: 0.25 } },
  { id: 'genetics', name: 'Genetics', line: 'science', era: 3, desc: 'Medicine and crops.', mods: { popGrowth: 0.1, food: 0.15 } },
  { id: 'satellites', name: 'Satellites', line: 'science', era: 3, desc: 'Eyes in the sky.', mods: { defense: 0.1, research: 0.05 } },
  // Era 4 — Future
  { id: 'robotics', name: 'Robotics', line: 'industry', era: 4, desc: 'Robot workforce.', mods: { factory: 0.3, autoClick: 10 }, requires: ['automation'] },
  { id: 'fusion_power', name: 'Fusion Power', line: 'industry', era: 4, desc: 'Limitless clean energy.', mods: { factory: 0.15, raw: 0.15, services: 0.1 } },
  { id: 'autonomous_warfare', name: 'Autonomous Warfare', line: 'military', era: 4, desc: 'AI-driven forces.', mods: { attack: 0.25 }, requires: ['drones'] },
  { id: 'missile_shield', name: 'Missile Shield', line: 'military', era: 4, desc: '60% chance to intercept incoming nukes.', requires: ['satellites'] },
  { id: 'universal_income', name: 'Universal Income', line: 'society', era: 4, desc: 'Prosperity shared.', mods: { happiness: 10 } },
  { id: 'smart_cities', name: 'Smart Cities', line: 'society', era: 4, desc: 'Efficient urban life.', mods: { services: 0.2, popGrowth: 0.05 } },
  { id: 'ai_research', name: 'Artificial Intelligence', line: 'science', era: 4, desc: 'Machines that think.', mods: { research: 0.3 } },
  { id: 'singularity_project', name: 'Singularity Project', line: 'science', era: 4, desc: 'SCIENTIFIC VICTORY: a decades-long megaproject. Complete it to win.', requires: ['ai_research', 'fusion_power'], costMult: 30, minYear: 2032, minDays: 5475 },
];

export const TECH_BY_ID: Record<string, TechDef> = Object.fromEntries(TECHS.map((t) => [t.id, t]));

export const STARTING_TECHS: string[] = [];

/** Research points needed. */
export function techCost(t: TechDef): number {
  return Math.round(400 * Math.pow(3, t.era) * (t.costMult ?? 1));
}

export const TECHS_TO_ADVANCE_ERA = 4;
