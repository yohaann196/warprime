// A* over the province graph. Land moves need permission (own/friendly/enemy territory);
// sea zones can only be entered from a friendly port, and landings can happen on any coast.
import { TERRAIN_MOVE } from '../../data/units';
import { canEnter, isFriendly } from '../query';
import type { GameState } from '../state';

function dist(state: GameState, a: number, b: number): number {
  const pa = state.provinces[a].center;
  const pb = state.provinces[b].center;
  return Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
}

export function stepCost(state: GameState, from: number, to: number, ignoresTerrain = false): number {
  const q = state.provinces[to];
  const d = dist(state, from, to);
  if (q.isSea) return d * 0.8;
  const terrain = ignoresTerrain ? 1 : TERRAIN_MOVE[q.terrain] ?? 1;
  return (d * terrain) / (1 + 0.12 * q.roads);
}

function canStep(state: GameState, nation: number, from: number, to: number): boolean {
  const p = state.provinces[from];
  const q = state.provinces[to];
  if (q.isSea) {
    if (p.isSea) return true;
    // embark only from a port held by us or a friend
    return (p.buildings.port ?? 0) > 0 && isFriendly(state, nation, p.controller);
  }
  return canEnter(state, nation, to);
}

/** Path from `from` to `to` (excluding the start), or null if unreachable. */
export function findPath(state: GameState, nation: number, from: number, to: number, ignoresTerrain = false, maxNodes = 4000): number[] | null {
  if (from === to) return [];
  const target = state.provinces[to];
  if (!target.isSea && !canEnter(state, nation, to)) return null;
  const N = state.provinces.length;
  const g = new Float64Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const open: { id: number; f: number }[] = [{ id: from, f: 0 }];
  g[from] = 0;
  let expanded = 0;
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open[bi].id;
    open[bi] = open[open.length - 1];
    open.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === to) break;
    if (++expanded > maxNodes) return null;
    for (const nb of state.provinces[cur].neighbors) {
      if (closed[nb]) continue;
      if (!canStep(state, nation, cur, nb)) continue;
      const ng = g[cur] + stepCost(state, cur, nb, ignoresTerrain);
      if (ng < g[nb]) {
        g[nb] = ng;
        came[nb] = cur;
        open.push({ id: nb, f: ng + dist(state, nb, to) * 0.5 });
      }
    }
  }
  if (came[to] === -1) return null;
  const path: number[] = [];
  for (let c = to; c !== from; c = came[c]) path.push(c);
  return path.reverse();
}
