import type { EconSystemId } from '../sim/state';
import type { Mods } from './modifiers';

export interface EconSystemDef {
  id: EconSystemId;
  name: string;
  blurb: string;
  pros: string;
  cons: string;
  mods: Mods;
}

export const ECON_SYSTEMS: Record<EconSystemId, EconSystemDef> = {
  free_market: {
    id: 'free_market',
    name: 'Free Market',
    blurb: 'Let capital flow. Fast growth, fat trade, but booms come with busts.',
    pros: 'Big trade & service income, faster research',
    cons: 'Lower stability, prone to recessions',
    mods: { trade: 0.25, services: 0.15, research: 0.05, stability: -8 },
  },
  planned: {
    id: 'planned',
    name: 'Planned Economy',
    blurb: 'The state builds. Factories hum and costs fall, but innovation and trade suffer.',
    pros: 'Strong factories, cheap construction',
    cons: 'Slow research, weak trade, grumbling people',
    mods: { factory: 0.2, buildCost: -0.2, research: -0.15, trade: -0.25, happiness: -5 },
  },
  mixed: {
    id: 'mixed',
    name: 'Mixed Economy',
    blurb: 'A balanced social market. Nothing spectacular, nothing breaks.',
    pros: 'Stable and content population',
    cons: 'No standout bonus',
    mods: { stability: 8, happiness: 4, tax: 0.05 },
  },
  mercantilism: {
    id: 'mercantilism',
    name: 'Mercantilism',
    blurb: 'Export everything, import nothing, hoard the gold.',
    pros: 'Export income, more raw output, tariffs',
    cons: 'Trade partners resent you',
    mods: { trade: 0.15, raw: 0.1, tax: 0.05, partnerRelations: -10 },
  },
  war_economy: {
    id: 'war_economy',
    name: 'War Economy',
    blurb: 'Everything for the front. Guns over butter.',
    pros: 'Huge military output, cheap units, more manpower',
    cons: 'Few consumer goods, unhappy & slow-growing population',
    mods: { military: 0.35, unitCost: -0.25, manpower: 0.3, consumer: -0.4, happiness: -10, popGrowth: -0.2 },
  },
  cooperative: {
    id: 'cooperative',
    name: 'Cooperative Agrarian',
    blurb: 'Communities, cooperatives and full granaries. Small can be beautiful.',
    pros: 'More food, happier people, faster population growth',
    cons: 'Weak heavy industry and military production',
    mods: { food: 0.3, happiness: 10, popGrowth: 0.2, factory: -0.15, military: -0.1 },
  },
};

export const ECON_SWITCH_COOLDOWN = 365 * 5;
export const ECON_TRANSITION_DAYS = 365;
