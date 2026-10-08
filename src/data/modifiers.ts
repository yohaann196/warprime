/** Modifier keys. Multiplicative keys are fractions (+0.1 = +10%); additive keys are flat points. */
export type ModKey =
  | 'tax'
  | 'trade'
  | 'factory'
  | 'raw'
  | 'food'
  | 'consumer'
  | 'military'
  | 'services'
  | 'buildCost'
  | 'research'
  | 'unitCost'
  | 'upkeep'
  | 'popGrowth'
  | 'manpower'
  | 'attack'
  | 'defense'
  | 'diplo'
  | 'devPoints'
  | 'clickPower'
  | 'happiness'
  | 'stability'
  | 'autoClick'
  | 'partnerRelations'
  | 'moveSpeed';

export type Mods = Partial<Record<ModKey, number>>;

export const ADDITIVE_KEYS: ReadonlySet<ModKey> = new Set(['happiness', 'stability', 'autoClick', 'partnerRelations']);

export const MOD_LABELS: Record<ModKey, string> = {
  tax: 'Tax efficiency',
  trade: 'Trade income',
  factory: 'Factory output',
  raw: 'Raw resource output',
  food: 'Food output',
  consumer: 'Consumer goods output',
  military: 'Military goods output',
  services: 'Service economy',
  buildCost: 'Construction cost',
  research: 'Research speed',
  unitCost: 'Unit cost',
  upkeep: 'Upkeep',
  popGrowth: 'Population growth',
  manpower: 'Manpower',
  attack: 'Attack',
  defense: 'Defense',
  diplo: 'Diplomatic influence',
  devPoints: 'Development speed',
  clickPower: 'Click power',
  happiness: 'Happiness',
  stability: 'Stability',
  autoClick: 'Auto-clicks / day',
  partnerRelations: 'Relations with trade partners',
  moveSpeed: 'Army movement speed',
};

export function formatMod(key: ModKey, v: number): string {
  if (ADDITIVE_KEYS.has(key)) return `${v >= 0 ? '+' : ''}${Math.round(v * 10) / 10}`;
  return `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;
}

export function describeMods(m: Mods): string {
  return (Object.keys(m) as ModKey[]).map((k) => `${MOD_LABELS[k]} ${formatMod(k, m[k]!)}`).join(', ');
}
