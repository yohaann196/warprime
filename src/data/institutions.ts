import type { Institution } from '../sim/state';
import type { Mods } from './modifiers';

export interface InstitutionDef {
  id: Institution;
  name: string;
  icon: string;
  perLevel: Mods;
  reforms: string[]; // name of the reform unlocked at each level (index = level-1)
}

export const MAX_INSTITUTION_LEVEL = 10;

export const INSTITUTIONS_DEF: Record<Institution, InstitutionDef> = {
  industry: {
    id: 'industry',
    name: 'Industry',
    icon: '🏭',
    perLevel: { factory: 0.04, raw: 0.03 },
    reforms: [
      'Factory Acts', 'Standard Gauges', 'Industrial Banks', 'Labour Exchanges', 'Heavy Industry Ministry',
      'Productivity Councils', 'Industrial Parks', 'Lean Production', 'Smart Factories', 'Total Automation',
    ],
  },
  army: {
    id: 'army',
    name: 'Army',
    icon: '⚔️',
    perLevel: { attack: 0.04, defense: 0.04, manpower: 0.05 },
    reforms: [
      'General Staff', 'Conscription Law', 'Officer Academies', 'Combined Arms', 'Reserve System',
      'Logistics Corps', 'Mobile Doctrine', 'Professional Army', 'Network Warfare', 'Supreme Command',
    ],
  },
  science: {
    id: 'science',
    name: 'Science',
    icon: '🔬',
    perLevel: { research: 0.06 },
    reforms: [
      'Royal Academy', 'Public Libraries', 'Research Grants', 'Polytechnics', 'National Laboratories',
      'Science Parks', 'Open Archives', 'Big Science', 'Moonshot Agency', 'Grand Unified Programme',
    ],
  },
  trade: {
    id: 'trade',
    name: 'Trade',
    icon: '⚖️',
    perLevel: { trade: 0.05, services: 0.03 },
    reforms: [
      'Chamber of Commerce', 'Free Ports', 'Commodity Exchange', 'Shipping Lines', 'Central Bank',
      'Export Credit', 'Trade Missions', 'Container Ports', 'Financial Centre', 'Global Brand',
    ],
  },
  diplomacy: {
    id: 'diplomacy',
    name: 'Diplomacy',
    icon: '🕊️',
    perLevel: { diplo: 0.08, stability: 0.5 },
    reforms: [
      'Foreign Office', 'Embassies', 'Cultural Institutes', 'Treaty Bureau', 'Diplomatic Corps',
      'Development Aid', 'Soft Power', 'Summit Diplomacy', 'Permanent Missions', 'World Mediator',
    ],
  },
  bureaucracy: {
    id: 'bureaucracy',
    name: 'Bureaucracy',
    icon: '📜',
    perLevel: { tax: 0.04, autoClick: 2, devPoints: 0.05 },
    reforms: [
      'Civil Service Exam', 'Census Office', 'Income Tax', 'Ministries Act', 'Statistics Bureau',
      'Planning Commission', 'E-Government', 'Digital Registry', 'Algorithmic Administration', 'Frictionless State',
    ],
  },
};

/** Goal pairs give a named doctrine with its own bonus (keys are the two institutions sorted alphabetically). */
export const DOCTRINES: Record<string, { name: string; mods: Mods }> = {
  'army+industry': { name: 'Arsenal State', mods: { military: 0.15, factory: 0.1 } },
  'industry+science': { name: 'Technocracy', mods: { factory: 0.1, research: 0.15 } },
  'industry+trade': { name: 'Merchant Republic', mods: { factory: 0.1, trade: 0.15 } },
  'diplomacy+industry': { name: 'Development Partner', mods: { factory: 0.1, partnerRelations: 10 } },
  'bureaucracy+industry': { name: 'Five-Year Planner', mods: { factory: 0.15, buildCost: -0.1 } },
  'army+science': { name: 'Military-Industrial Lab', mods: { attack: 0.15, research: 0.1 } },
  'army+trade': { name: 'Mercenary Empire', mods: { trade: 0.1, unitCost: -0.15 } },
  'army+diplomacy': { name: 'Guardian Alliance', mods: { defense: 0.15, diplo: 0.2 } },
  'army+bureaucracy': { name: 'Garrison State', mods: { manpower: 0.2, stability: 5 } },
  'science+trade': { name: 'Innovation Hub', mods: { research: 0.15, trade: 0.1 } },
  'diplomacy+science': { name: 'Enlightened Republic', mods: { research: 0.1, diplo: 0.25 } },
  'bureaucracy+science': { name: 'Academic Bureaucracy', mods: { research: 0.15, autoClick: 4 } },
  'diplomacy+trade': { name: 'Trade League', mods: { trade: 0.2, partnerRelations: 5 } },
  'bureaucracy+trade': { name: 'Customs Union', mods: { tax: 0.15, trade: 0.1 } },
  'bureaucracy+diplomacy': { name: 'Concert of Nations', mods: { diplo: 0.3, stability: 5 } },
};

export function doctrineKey(a: Institution, b: Institution): string {
  return [a, b].sort().join('+');
}

/** Development points needed to raise an institution from `level` to `level + 1`. */
export function institutionCost(level: number): number {
  return level + 1;
}
