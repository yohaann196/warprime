import type { Mods } from './modifiers';

export type WorldModeId = 'random' | 'avatar';

export interface WorldNation {
  name: string;
  adjective: string;
  color: string;
  perkName?: string;
  perkDesc?: string;
  perks?: Mods;
}

export interface WorldMode {
  id: WorldModeId;
  name: string;
  subtitle: string;
  description: string;
  icon: string;
  nationCount: number;
  startYear: number;
  endYear: number;
  eraNames?: [string, string, string, string, string];
  eraYears?: [number, number, number, number, number];
  nations?: WorldNation[];
  techThemes?: Record<string, { name: string; desc: string; minYear?: number }>;
  disabledTechs?: string[];
  /** Years between the Avatar's reincarnations (the Avatar appears in a new nation each time). */
  avatarYears?: number;
}

export const WORLD_MODES: Record<WorldModeId, WorldMode> = {
  random: {
    id: 'random',
    name: 'Random Fictional',
    subtitle: 'A new world every run',
    description: 'Explore a procedurally generated world of rival nations, shifting borders, and emergent history.',
    icon: '🌍',
    nationCount: 18,
    startYear: 1900,
    endYear: 3000,
  },
  avatar: {
    id: 'avatar',
    name: 'Avatar: Four Nations',
    subtitle: 'From the Hundred Year War toward Korra',
    description: 'Begin in the world of Avatar: The Last Airbender. Guide a nation through reconstruction, Republic City, and the changing age of Avatar Korra.',
    icon: '🌊',
    nationCount: 5,
    startYear: 100,
    endYear: 180,
    eraNames: ['Hundred Year War', 'Postwar Reconstruction', 'Metalbending Age', 'Republic City', 'The Korra Era'],
    eraYears: [100, 112, 124, 140, 155],
    techThemes: {
      mechanization: { name: 'Fire Nation Industrialization', desc: 'The factories and shipyards behind the Fire Nation war machine.' },
      combustion: { name: 'Steam-Powered Fleets', desc: 'Modern engines transform travel and naval logistics.' },
      rifling: { name: 'Fire Nation War Academy', desc: 'Standardized training and equipment for the imperial army.' },
      trench_warfare: { name: 'Siege Lines of Ba Sing Se', desc: 'Fortifications and logistics for a long campaign.' },
      public_schools: { name: 'Healing Arts Academies', desc: 'Expand education and the healers who serve every nation.' },
      assembly_line: { name: 'United Republic Industry', desc: 'Rebuild the nations together with mass production.' },
      motorization: { name: 'Satomobile Engineering', desc: 'Modern transport connects the growing cities.' },
      aviation: { name: 'Airship Fleets', desc: 'Adapt wartime airships for civil and military use.' },
      welfare_state: { name: 'Postwar Reconstruction', desc: 'Reconcile the nations and restore communities after the war.' },
      radio: { name: 'Republic City Radio', desc: 'A new voice links the people of Republic City.' },
      atomic_theory: { name: 'Spirit Energy Studies', desc: 'Investigate the world-changing energy found in spirit vines.' },
      computers: { name: 'Spirit-Vine Engineering', desc: 'Research the technology that will shape the age of Korra.' },
      electronics: { name: 'Metalbending Police', desc: 'Equip Republic City with a highly trained, modern police force.' },
      drones: { name: 'Pro-bending Broadcasts', desc: 'New aerial technology and mass entertainment bring the city together.' },
      internet: { name: 'Republic City Networks', desc: 'Connect a modern society across the Four Nations.' },
      robotics: { name: 'Automated Satomobiles', desc: 'Build the next generation of machines and urban transport.' },
      ai_research: { name: 'Spirit-World Research', desc: 'Explore the boundary between technology and the spirit world.' },
      singularity_project: { name: 'Harmonic Convergence Initiative', desc: 'A long-term project for a new era of human and spirit cooperation.', minYear: 158 },
    },
    disabledTechs: ['nuclear_weapons', 'missile_shield'],
    avatarYears: 4,
    nations: [
      { name: 'Fire Nation', adjective: 'Fire Nation', color: '#c84c39', perkName: 'Firebending Might', perkDesc: 'Stronger attacks and industry.', perks: { attack: 0.1, factory: 0.08 } },
      { name: 'Earth Kingdom', adjective: 'Earth Kingdom', color: '#5b9b54', perkName: 'Unyielding Earth', perkDesc: 'Tougher defenders and more manpower.', perks: { defense: 0.12, manpower: 0.15 } },
      { name: 'Northern Water Tribe', adjective: 'Northern Water Tribe', color: '#4b88c2', perkName: 'Masters of Healing', perkDesc: 'Faster population growth and research.', perks: { popGrowth: 0.12, research: 0.08 } },
      { name: 'Southern Water Tribe', adjective: 'Southern Water Tribe', color: '#70b9cf', perkName: 'Hardy Hunters', perkDesc: 'More food, happiness and click power.', perks: { food: 0.1, happiness: 4, clickPower: 0.1 } },
      { name: 'Air Nomads', adjective: 'Air Nomad', color: '#e8b84a', perkName: 'Sky Bison Riders', perkDesc: 'Armies move 60% faster; serene and stable, but few in number.', perks: { moveSpeed: 0.6, stability: 6, happiness: 5, manpower: -0.3 } },
    ],
  },
};

export function getWorldMode(id: string): WorldMode {
  return WORLD_MODES[id as WorldModeId] ?? WORLD_MODES.random;
}
