// Climate: industry emits, clean energy abates, and Earth damage (state.climate.damage, 0..100)
// builds slowly. At 100 the game ends (checkEnd). Not used in the Avatar world (state.climate absent).
import type { BuildingId, GameState, Nation } from './state';
import { notice, ownedProvinces } from './query';

/** Emissions per building level per day. */
export const EMISSION_SOURCES: Partial<Record<BuildingId, number>> = {
  steel_mill: 1.2,
  refinery: 1.6,
  power_plant: 1.8,
  munitions_plant: 0.7,
  vehicle_plant: 0.9,
  oil_well: 0.8,
  consumer_factory: 0.35,
  electronics_plant: 0.3,
  mine: 0.3,
};
export const GREEN_ABATEMENT = 2.2; // emissions removed per Clean Energy Plant level per day
export const DAMAGE_PER_UNIT = 0.00000007; // Earth damage (points) per net world emission unit per day
export const DAMAGE_RECOVERY = 0.0004; // points per day of natural healing while the world is net-clean
const WARN_AT = [25, 50, 75, 90];

export function climateEnabled(mapId: string): boolean {
  return mapId !== 'avatar';
}

export function ensureClimateDefaults(state: GameState): void {
  if (climateEnabled(state.settings.mapId)) state.climate ??= { damage: 0 };
}

function nationClimateDay(state: GameState, n: Nation): void {
  let e = 0;
  let green = 0;
  for (const pid of ownedProvinces(state, n.id)) {
    const p = state.provinces[pid];
    if (p.controller !== n.id) continue;
    for (const [b, lvl] of Object.entries(p.buildings) as [BuildingId, number][]) {
      e += (EMISSION_SOURCES[b] ?? 0) * lvl;
      if (b === 'green_plant') green += lvl;
    }
  }
  n.emissions = e;
  n.abated = Math.min(e, green * GREEN_ABATEMENT); // clean energy cannot scrub more than you emit
  n.greenSpend = green * 2;
}

export function climateDay(state: GameState): void {
  const c = state.climate;
  if (!c) return;
  let net = 0;
  for (const n of state.nations) {
    if (!n.alive) continue;
    nationClimateDay(state, n);
    net += (n.emissions ?? 0) - (n.abated ?? 0);
  }
  if (c.damage >= 100) return; // collapse is final
  const before = c.damage;
  c.damage = Math.max(0, Math.min(100, c.damage + net * DAMAGE_PER_UNIT - (net < 20 ? DAMAGE_RECOVERY : 0)));
  for (const w of WARN_AT) {
    if (before < w && c.damage >= w) notice(state, `🌍 Earth damage has reached ${w}%. Build Clean Energy Plants before it is too late.`, 'bad', [], `climate-${w}`);
  }
}

/** Slow penalties as the Earth degrades: food and happiness suffer. */
export function climateMods(state: GameState): { food: number; happiness: number } | null {
  const d = state.climate?.damage ?? 0;
  if (d < 20) return null;
  return { food: -(d - 20) / 400, happiness: -(d - 20) / 12 };
}
