import { Rng } from '../rng';
import {
  emptyStock,
  INSTITUTIONS,
  type EconSystemId,
  type GameState,
  type Institution,
  type Nation,
  type Province,
  type Settings,
} from '../state';
import { generateMap, type GeneratedMap } from './geometry';
import { cityName, nationName, seaName } from './names';
import { BASE_PRICES } from '../../data/buildings';
import { FOOD_PER_POP, FOOD_TERRAIN } from '../economy/production';
import { ensureDefaults } from '../defaults';
import { emptyLeaderboard } from '../leaderboard';
import { HISTORY_STEP } from '../prosperity';
import { SAVE_VERSION } from '../version';
import { getWorldMode } from '../../data/worlds';

export { SAVE_VERSION };

function hsl(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

const AI_SYSTEMS: EconSystemId[] = ['free_market', 'planned', 'mixed', 'mercantilism', 'war_economy', 'cooperative'];

/** Builds a brand-new game state (all nations AI-controlled until a player nation is chosen). */
export function newGame(settings: Settings, map?: GeneratedMap): { state: GameState; map: GeneratedMap } {
  const gm = map ?? generateMap(settings.seed, settings.mapId);
  const rng = new Rng(settings.seed ^ 0x9e3779b9);
  const usedNames = new Set<string>();

  const provinces: Province[] = gm.provinces.map((p) => ({
    id: p.id,
    name: p.isSea ? seaName(rng, usedNames) : cityName(rng, usedNames),
    terrain: p.terrain,
    isSea: p.isSea,
    coastal: p.coastal,
    center: p.center,
    area: p.area,
    neighbors: p.neighbors,
    owner: -1,
    controller: -1,
    pop: p.basePop,
    resource: p.resource,
    buildings: {},
    construction: null,
    roads: 0,
    devastation: 0,
    fallout: 0,
    siege: 0,
    siegeBy: -1,
    isCapital: false,
    unrest: 0,
  }));

  const land = provinces.filter((p) => !p.isSea);

  // --- choose capitals: spread out, prefer populous land ---
  const count = Math.min(settings.nationCount, Math.floor(land.length / 4));
  const capitals: number[] = [];
  const candidates = land.filter((p) => p.terrain !== 'mountains' && p.terrain !== 'tundra');
  if (settings.mapId === 'avatar') {
    const regions: [number, number][] = [[410, 500], [1010, 500], [800, 155], [850, 865], [180, 185]];
    for (const [x, y] of regions.slice(0, count)) {
      const nearest = candidates
        .filter((p) => !capitals.includes(p.id))
        .sort((a, b) => Math.hypot(a.center[0] - x, a.center[1] - y) - Math.hypot(b.center[0] - x, b.center[1] - y))[0];
      if (nearest) capitals.push(nearest.id);
    }
  } else {
    capitals.push(rng.pick(candidates).id);
    while (capitals.length < count) {
      let best = -1;
      let bestScore = -Infinity;
      for (let k = 0; k < 40; k++) {
        const c = rng.pick(candidates);
        if (capitals.includes(c.id)) continue;
        let d = Infinity;
        for (const cap of capitals) {
          const o = provinces[cap];
          d = Math.min(d, Math.hypot(o.center[0] - c.center[0], o.center[1] - c.center[1]));
        }
        const score = d + c.pop * 0.05;
        if (score > bestScore) {
          bestScore = score;
          best = c.id;
        }
      }
      if (best === -1) break;
      capitals.push(best);
    }
  }

  // --- grow nations with a weighted Dijkstra over land (+ short sea hops) ---
  const weight = capitals.map(() => rng.range(0.6, 1.6));
  const cost = new Float64Array(provinces.length).fill(Infinity);
  const owner = new Int32Array(provinces.length).fill(-1);
  const open: { id: number; c: number; n: number }[] = [];
  capitals.forEach((cap, i) => {
    cost[cap] = 0;
    owner[cap] = i;
    open.push({ id: cap, c: 0, n: i });
  });
  const terrainCost: Record<string, number> = { plains: 1, forest: 1.3, hills: 1.6, mountains: 3, desert: 1.8, tundra: 2, jungle: 1.7 };
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].c < open[bi].c) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur.c > cost[cur.id]) continue;
    const pc = provinces[cur.id];
    const visit = (nbId: number, extra: number) => {
      const nb = provinces[nbId];
      const d = Math.hypot(nb.center[0] - pc.center[0], nb.center[1] - pc.center[1]);
      const c = cur.c + ((d * (terrainCost[nb.terrain] ?? 1) + extra) / weight[cur.n]) * rng.range(0.85, 1.15);
      if (c < cost[nbId]) {
        cost[nbId] = c;
        owner[nbId] = cur.n;
        open.push({ id: nbId, c, n: cur.n });
      }
    };
    for (const nbId of pc.neighbors) {
      if (!provinces[nbId].isSea) visit(nbId, 0);
      else {
        // hop across a sea zone to reach islands, at a premium
        for (const far of provinces[nbId].neighbors) if (!provinces[far].isSea && far !== cur.id) visit(far, 260);
      }
    }
  }

  // remote islands the flood never reached join the nation of the nearest claimed province
  for (const p of land) {
    if (owner[p.id] !== -1) continue;
    let best = -1;
    let bestD = Infinity;
    for (const q of land) {
      if (owner[q.id] === -1) continue;
      const d = Math.hypot(q.center[0] - p.center[0], q.center[1] - p.center[1]);
      if (d < bestD) {
        bestD = d;
        best = owner[q.id];
      }
    }
    owner[p.id] = best;
  }

  // --- nations ---
  const usedNationNames = new Set<string>();
  const hueBase = rng.next() * 360;
  const world = getWorldMode(settings.mapId);
  const nations: Nation[] = capitals.map((cap, i) => {
    const authored = world.nations?.[i];
    const nm = authored ? { name: authored.name, adjective: authored.adjective } : nationName(rng, usedNationNames);
    const hue = (hueBase + i * 137.508) % 360;
    const color = authored?.color ?? hsl(hue, 45 + rng.next() * 25, 48 + rng.next() * 12);
    const flagColors = [color, hsl((hue + 180) % 360, 55, 50), rng.chance(0.5) ? '#f4f1e8' : '#1d1d1d'];
    const goalsPool = [...INSTITUTIONS];
    rng.shuffle(goalsPool);
    const institutions = {} as Record<Institution, number>;
    for (const k of INSTITUTIONS) institutions[k] = 0;
    const focus = rng.pick(['economy', 'military', 'science', 'trade'] as const);
    return {
      id: i,
      name: nm.name,
      adjective: nm.adjective,
      color,
      flag: { colors: flagColors, pattern: rng.pick(['vertical', 'horizontal', 'cross', 'diagonal', 'circle'] as const) },
      isPlayer: false,
      alive: true,
      capital: cap,
      money: 600,
      debt: 0,
      stock: { ...emptyStock(), food: 60, wood: 40, iron: 30, coal: 30, steel: 20, munitions: 60, consumer: 20 },
      reserve: { food: 30, wood: 20, iron: 20, coal: 20, steel: 20, munitions: 60, consumer: 0, fuel: 20, vehicles: 10, oil: 10, electronics: 5, uranium: 15, rare: 5 },
      autoTrade: true,
      taxRate: 0.25,
      econSystem: rng.pick(AI_SYSTEMS),
      econSwitchCooldown: 0,
      transition: 0,
      goals: [goalsPool[0], goalsPool[1]] as [Institution, Institution],
      institutions,
      devPoints: 1,
      devProgress: 0,
      tech: { researched: [], current: null, progress: 0 },
      era: 0,
      stability: 65,
      happiness: 60,
      warExhaustion: 0,
      trust: 70,
      manpower: 0,
      clicks: { power: 1, heat: 0, combo: 0, comboTimer: 0, totalClicks: 0, autoRate: 0, upgrades: 0 },
      personality: {
        aggression: rng.range(0.1, 0.9),
        greed: rng.range(0.2, 0.9),
        loyalty: rng.range(0.2, 1),
        focus,
      },
      nukes: 0,
      nukeProgress: -1,
      aiTimer: i % 10,
      gdp: 0,
      income: 0,
      expenses: 0,
      prosperity: 0,
      prosperityParts: {},
      militaryStrength: 0,
      tradeVolume: 0,
      history: [],
      sabotageCooldown: 0,
      tempMods: [],
      ledger: {},
      netGoods: {},
      research: 0,
      foodShortage: false,
      consumerSat: 1,
      connected: [],
    };
  });

  for (const p of provinces) {
    if (p.isSea) continue;
    const o = owner[p.id];
    p.owner = o;
    p.controller = o;
    if (o === -1) continue;
    // starting infrastructure
    if (['plains', 'forest', 'hills', 'jungle'].includes(p.terrain)) p.buildings.farm = 1;
    if (p.terrain === 'forest' || p.terrain === 'jungle') p.buildings.sawmill = 1;
    p.roads = 1;
  }
  for (const n of nations) {
    const cap = provinces[n.capital];
    cap.isCapital = true;
    if (settings.mapId === 'avatar' && n.name === 'Air Nomads') cap.name = 'Western Air Temple';
    cap.pop = Math.round(cap.pop * 1.8 + 300);
    cap.roads = 2;
    cap.buildings.barracks = 1;
    cap.buildings.market_hall = 1;
    cap.buildings.farm = Math.max(cap.buildings.farm ?? 0, 1);
    const owned = provinces.filter((p) => p.owner === n.id);
    // give everyone at least one mine on a deposit if they have one
    const dep = owned.find((p) => p.resource === 'iron' || p.resource === 'coal');
    if (dep) dep.buildings.mine = 1;
    const steelSite = owned.find((p) => p.isCapital);
    if (steelSite && owned.length > 4) steelSite.buildings.munitions_plant = 1;
    n.manpower = Math.round(owned.reduce((s, p) => s + p.pop, 0) * 0.01);
    // enough farms to roughly feed the population (barren nations will still need imports)
    const need = owned.reduce((s, p) => s + p.pop, 0) * FOOD_PER_POP * 1.05;
    const farmable = owned.filter((p) => ['plains', 'forest', 'hills', 'jungle'].includes(p.terrain)).sort((a, b) => (FOOD_TERRAIN[b.terrain] ?? 0) * b.pop - (FOOD_TERRAIN[a.terrain] ?? 0) * a.pop);
    const made = () => owned.reduce((s, p) => s + (p.buildings.farm ?? 0) * 3.5 * (FOOD_TERRAIN[p.terrain] ?? 0.6) * 0.9, 0);
    for (let guard = 0; guard < 60 && farmable.length && made() < need; guard++) {
      const p = farmable[guard % farmable.length];
      if ((p.buildings.farm ?? 0) < 3) p.buildings.farm = (p.buildings.farm ?? 0) + 1;
    }
  }

  const N = nations.length;
  const relations: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let a = 0; a < N; a++)
    for (let b = a + 1; b < N; b++) {
      const v = Math.round(rng.range(-25, 35));
      relations[a][b] = v;
      relations[b][a] = v;
    }

  const prices = { ...BASE_PRICES };
  const priceHistory = {} as GameState['priceHistory'];
  for (const g of Object.keys(prices) as (keyof typeof prices)[]) priceHistory[g] = [prices[g]];

  const state: GameState = {
    version: SAVE_VERSION,
    settings,
    day: 0,
    rngState: (settings.seed * 2654435761) >>> 0,
    provinces,
    nations,
    divisions: [],
    pacts: [],
    wars: [],
    relations,
    opinion: [],
    prices,
    priceHistory,
    pendingEvents: [],
    log: [],
    nextId: 1,
    player: -1,
    gameOver: null,
    tutorialStep: 0,
    leaderboard: emptyLeaderboard(0, settings.startYear),
    notices: [],
    nextNoticeId: 1,
    noticeCooldowns: {},
    historyStep: HISTORY_STEP,
  };

  // starting armies
  for (const n of nations) {
    const owned = provinces.filter((p) => p.owner === n.id).length;
    const divs = Math.max(2, Math.round(owned / 4));
    for (let i = 0; i < divs; i++) {
      state.divisions.push({
        id: state.nextId++,
        owner: n.id,
        type: i % 4 === 3 ? 'artillery' : 'infantry',
        province: n.capital,
        strength: 1,
        org: 1,
        xp: 0,
        path: [],
        moveProgress: 0,
        training: 0,
        stance: 'hold',
      });
    }
  }
  ensureDefaults(state);
  return { state, map: gm };
}
