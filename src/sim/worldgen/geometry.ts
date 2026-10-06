import { Delaunay } from 'd3-delaunay';
import { createNoise2D } from 'simplex-noise';
import { Rng } from '../rng';
import type { Resource, Terrain } from '../state';

export const MAP_W = 1600;
export const MAP_H = 1000;
const SPACING = 18;
const LAND_CELLS_PER_PROVINCE = 7;
const SEA_CELLS_PER_ZONE = 40;

export interface BorderEdge {
  a: number; // province on one side
  b: number; // province on other side
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Static map geometry. Fully derived from the seed, never saved. */
export interface WorldGeometry {
  seed: number;
  width: number;
  height: number;
  cellX: Float64Array;
  cellY: Float64Array;
  cellPolys: number[][]; // flat [x0,y0,x1,y1,...]
  cellProvince: Int32Array;
  cellTerrain: Terrain[];
  cellElevation: Float64Array;
  delaunay: Delaunay<[number, number]>;
  edges: BorderEdge[]; // every edge between two different provinces
  provinceCells: number[][];
}

export interface ProvinceSeed {
  id: number;
  terrain: Terrain;
  isSea: boolean;
  coastal: boolean;
  center: [number, number];
  area: number;
  neighbors: number[];
  resource: Resource | null;
  basePop: number;
  component: number;
}

export interface GeneratedMap {
  geo: WorldGeometry;
  provinces: ProvinceSeed[];
}

function fbm(noise: (x: number, y: number) => number, x: number, y: number, octaves: number): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * freq, y * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

export function generateMap(seed: number): GeneratedMap {
  const rng = new Rng(seed);
  const elevNoise = createNoise2D(() => rng.next());
  const moistNoise = createNoise2D(() => rng.next());
  const warpNoise = createNoise2D(() => rng.next());

  // --- cells: jittered grid ---
  const xs: number[] = [];
  const ys: number[] = [];
  for (let y = SPACING / 2; y < MAP_H; y += SPACING) {
    for (let x = SPACING / 2; x < MAP_W; x += SPACING) {
      xs.push(Math.min(MAP_W - 1, Math.max(1, x + rng.range(-0.42, 0.42) * SPACING)));
      ys.push(Math.min(MAP_H - 1, Math.max(1, y + rng.range(-0.42, 0.42) * SPACING)));
    }
  }
  const n = xs.length;
  const pts: [number, number][] = xs.map((x, i) => [x, ys[i]]);
  const delaunay = Delaunay.from(pts);
  const voronoi = delaunay.voronoi([0, 0, MAP_W, MAP_H]);

  // --- elevation & climate ---
  const elevation = new Float64Array(n);
  const moisture = new Float64Array(n);
  const blobs: { x: number; y: number; r: number }[] = [];
  const blobCount = rng.int(4, 6);
  for (let i = 0; i < blobCount; i++) {
    blobs.push({ x: rng.range(0.15, 0.85) * MAP_W, y: rng.range(0.2, 0.8) * MAP_H, r: rng.range(220, 380) });
  }
  for (let i = 0; i < n; i++) {
    const x = xs[i];
    const y = ys[i];
    const wx = x + 60 * warpNoise(x / 300, y / 300);
    const wy = y + 60 * warpNoise(y / 300 + 50, x / 300 + 50);
    let continent = 0;
    for (const b of blobs) {
      const d = Math.hypot(wx - b.x, wy - b.y) / b.r;
      continent = Math.max(continent, 1 - d);
    }
    const edge = Math.min(x, MAP_W - x, y, MAP_H - y) / 120;
    const edgeFalloff = Math.min(1, edge);
    elevation[i] = (0.65 * continent + 0.55 * fbm(elevNoise, x / 420, y / 420, 5)) * edgeFalloff - (1 - edgeFalloff) * 0.5;
    moisture[i] = fbm(moistNoise, x / 350, y / 350, 3);
  }
  const sorted = Array.from(elevation).sort((a, b) => a - b);
  const seaLevel = sorted[Math.floor(n * 0.56)];
  const landElev = sorted.filter((e) => e > seaLevel);
  const hillLevel = landElev[Math.floor(landElev.length * 0.72)];
  const mountainLevel = landElev[Math.floor(landElev.length * 0.9)];

  const terrain: Terrain[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const e = elevation[i];
    if (e <= seaLevel) {
      terrain[i] = 'ocean';
      continue;
    }
    const lat = Math.abs(ys[i] / MAP_H - 0.5) * 2; // 0 equator .. 1 pole
    const temp = 1 - lat * 1.1 - (e - seaLevel) * 0.6;
    const m = moisture[i];
    if (e >= mountainLevel) terrain[i] = 'mountains';
    else if (temp < 0.18) terrain[i] = 'tundra';
    else if (e >= hillLevel) terrain[i] = 'hills';
    else if (temp > 0.55 && m < -0.18) terrain[i] = 'desert';
    else if (temp > 0.6 && m > 0.25) terrain[i] = 'jungle';
    else if (m > 0.05) terrain[i] = 'forest';
    else terrain[i] = 'plains';
  }

  // --- neighbour lists ---
  const cellNeighbors: number[][] = [];
  for (let i = 0; i < n; i++) cellNeighbors.push(Array.from(delaunay.neighbors(i)));

  // --- connected components (land / sea separately) ---
  const component = new Int32Array(n).fill(-1);
  let compCount = 0;
  const compCells: number[][] = [];
  for (let i = 0; i < n; i++) {
    if (component[i] !== -1) continue;
    const isSea = terrain[i] === 'ocean';
    const cells: number[] = [];
    const stack = [i];
    component[i] = compCount;
    while (stack.length) {
      const c = stack.pop()!;
      cells.push(c);
      for (const nb of cellNeighbors[c]) {
        if (component[nb] === -1 && (terrain[nb] === 'ocean') === isSea) {
          component[nb] = compCount;
          stack.push(nb);
        }
      }
    }
    compCells.push(cells);
    compCount++;
  }

  // Tiny land specks (1–2 cells) become sea to avoid unplayable micro-islands.
  for (const cells of compCells) {
    if (terrain[cells[0]] !== 'ocean' && cells.length <= 2) for (const c of cells) terrain[c] = 'ocean';
  }

  // Recompute components after cleanup.
  component.fill(-1);
  compCells.length = 0;
  compCount = 0;
  for (let i = 0; i < n; i++) {
    if (component[i] !== -1) continue;
    const isSea = terrain[i] === 'ocean';
    const cells: number[] = [];
    const stack = [i];
    component[i] = compCount;
    while (stack.length) {
      const c = stack.pop()!;
      cells.push(c);
      for (const nb of cellNeighbors[c]) {
        if (component[nb] === -1 && (terrain[nb] === 'ocean') === isSea) {
          component[nb] = compCount;
          stack.push(nb);
        }
      }
    }
    compCells.push(cells);
    compCount++;
  }

  // --- group cells into provinces via randomized multi-source BFS within each component ---
  const cellProvince = new Int32Array(n).fill(-1);
  const provinceCells: number[][] = [];
  const provinceComponent: number[] = [];
  for (let ci = 0; ci < compCells.length; ci++) {
    const cells = compCells[ci];
    const isSea = terrain[cells[0]] === 'ocean';
    const per = isSea ? SEA_CELLS_PER_ZONE : LAND_CELLS_PER_PROVINCE;
    const count = Math.max(1, Math.round(cells.length / per));
    // farthest-point-ish seeding for even provinces
    const seeds: number[] = [rng.pick(cells)];
    while (seeds.length < count) {
      let best = cells[0];
      let bestD = -1;
      for (let k = 0; k < 24; k++) {
        const c = rng.pick(cells);
        let d = Infinity;
        for (const s of seeds) d = Math.min(d, (xs[c] - xs[s]) ** 2 + (ys[c] - ys[s]) ** 2);
        if (d > bestD) {
          bestD = d;
          best = c;
        }
      }
      seeds.push(best);
    }
    const frontiers: number[][] = [];
    for (const s of seeds) {
      const pid = provinceCells.length;
      provinceCells.push([s]);
      provinceComponent.push(ci);
      cellProvince[s] = pid;
      frontiers.push([s]);
    }
    let active = true;
    while (active) {
      active = false;
      for (let f = 0; f < frontiers.length; f++) {
        const frontier = frontiers[f];
        if (!frontier.length) continue;
        active = true;
        const pid = cellProvince[seeds[f]];
        // expand one random frontier cell per round for organic shapes
        const idx = Math.floor(rng.next() * frontier.length);
        const c = frontier[idx];
        let grew = false;
        for (const nb of cellNeighbors[c]) {
          if (cellProvince[nb] === -1 && component[nb] === ci) {
            cellProvince[nb] = pid;
            provinceCells[pid].push(nb);
            frontier.push(nb);
            grew = true;
            break;
          }
        }
        if (!grew) frontier.splice(idx, 1);
      }
    }
  }

  // --- province adjacency & edges ---
  const P = provinceCells.length;
  const adj: Set<number>[] = Array.from({ length: P }, () => new Set<number>());
  const edges: BorderEdge[] = [];
  const cellPolys: number[][] = [];
  for (let i = 0; i < n; i++) {
    const poly = voronoi.cellPolygon(i);
    const flat: number[] = [];
    if (poly) for (const [x, y] of poly) flat.push(x, y);
    cellPolys.push(flat);
  }
  // half-edges of the delaunay triangulation give shared voronoi edges via circumcenters
  const { halfedges, triangles } = delaunay;
  const circ = voronoi.circumcenters;
  for (let e = 0; e < halfedges.length; e++) {
    const opp = halfedges[e];
    if (opp < e) continue; // handles -1 (hull) and duplicates
    const a = triangles[e];
    const b = triangles[e % 3 === 2 ? e - 2 : e + 1];
    const pa = cellProvince[a];
    const pb = cellProvince[b];
    if (pa === pb) continue;
    adj[pa].add(pb);
    adj[pb].add(pa);
    const t1 = Math.floor(e / 3);
    const t2 = Math.floor(opp / 3);
    edges.push({ a: pa, b: pb, x1: circ[t1 * 2], y1: circ[t1 * 2 + 1], x2: circ[t2 * 2], y2: circ[t2 * 2 + 1] });
  }

  // --- province attributes ---
  const provinces: ProvinceSeed[] = [];
  for (let p = 0; p < P; p++) {
    const cells = provinceCells[p];
    let cx = 0;
    let cy = 0;
    const tCount: Partial<Record<Terrain, number>> = {};
    for (const c of cells) {
      cx += xs[c];
      cy += ys[c];
      tCount[terrain[c]] = (tCount[terrain[c]] ?? 0) + 1;
    }
    cx /= cells.length;
    cy /= cells.length;
    // label at the member cell nearest the centroid so it is always inside the province
    let best = cells[0];
    let bestD = Infinity;
    for (const c of cells) {
      const d = (xs[c] - cx) ** 2 + (ys[c] - cy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    let t: Terrain = 'plains';
    let tMax = -1;
    for (const k of Object.keys(tCount) as Terrain[]) {
      if (tCount[k]! > tMax) {
        tMax = tCount[k]!;
        t = k;
      }
    }
    const isSea = t === 'ocean';
    const neighbors = Array.from(adj[p]).sort((a, b) => a - b);
    provinces.push({
      id: p,
      terrain: t,
      isSea,
      coastal: false,
      center: [xs[best], ys[best]],
      area: cells.length,
      neighbors,
      resource: null,
      basePop: 0,
      component: provinceComponent[p],
    });
  }
  for (const p of provinces) {
    if (!p.isSea) p.coastal = p.neighbors.some((nb) => provinces[nb].isSea);
    else p.coastal = p.neighbors.some((nb) => !provinces[nb].isSea);
  }

  // resources and population
  const RES_TABLE: Record<Terrain, [Resource | null, number][]> = {
    plains: [[null, 55], ['iron', 15], ['coal', 15], ['oil', 10], ['uranium', 2], ['rare', 3]],
    forest: [[null, 60], ['coal', 15], ['iron', 10], ['oil', 5], ['rare', 5], ['uranium', 5]],
    hills: [[null, 30], ['iron', 30], ['coal', 25], ['rare', 8], ['uranium', 7]],
    mountains: [[null, 25], ['iron', 25], ['rare', 25], ['uranium', 15], ['coal', 10]],
    desert: [[null, 35], ['oil', 50], ['uranium', 8], ['rare', 7]],
    tundra: [[null, 40], ['oil', 30], ['uranium', 10], ['iron', 10], ['coal', 10]],
    jungle: [[null, 45], ['rare', 25], ['oil', 20], ['iron', 10]],
    ocean: [[null, 100]],
  };
  const POP: Record<Terrain, number> = {
    plains: 420, forest: 260, hills: 220, mountains: 90, desert: 70, tundra: 60, jungle: 200, ocean: 0,
  };
  for (const p of provinces) {
    if (p.isSea) continue;
    const table = RES_TABLE[p.terrain];
    const total = table.reduce((s, [, w]) => s + w, 0);
    let r = rng.next() * total;
    for (const [res, w] of table) {
      r -= w;
      if (r <= 0) {
        p.resource = res;
        break;
      }
    }
    p.basePop = Math.round(POP[p.terrain] * rng.range(0.55, 1.45) * (p.coastal ? 1.25 : 1) * (p.area / LAND_CELLS_PER_PROVINCE));
  }

  const geo: WorldGeometry = {
    seed,
    width: MAP_W,
    height: MAP_H,
    cellX: Float64Array.from(xs),
    cellY: Float64Array.from(ys),
    cellPolys,
    cellProvince,
    cellTerrain: terrain,
    cellElevation: elevation,
    delaunay,
    edges,
    provinceCells,
  };
  return { geo, provinces };
}

/** Province id at a map coordinate. */
export function provinceAt(geo: WorldGeometry, x: number, y: number): number {
  if (x < 0 || y < 0 || x > geo.width || y > geo.height) return -1;
  const cell = geo.delaunay.find(x, y);
  return geo.cellProvince[cell];
}
