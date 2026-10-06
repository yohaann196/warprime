// Read-only helpers over the game state. A per-state index is cached and rebuilt when marked dirty.
import type { Division, GameState, Pact, PactType, War } from './state';

interface Index {
  owned: number[][]; // land provinces per owner
  controlled: number[][];
  divsAt: Map<number, Division[]>;
  war: Uint8Array; // N*N matrix, 1 = at war
  friendly: Uint8Array; // allied, puppet/overlord, or co-belligerent
  pop: Float64Array;
}

let cache: { state: GameState; index: Index } | null = null;
let dirty = true;

export function markDirty(): void {
  dirty = true;
}

export function index(state: GameState): Index {
  if (cache && cache.state === state && !dirty) return cache.index;
  const N = state.nations.length;
  const owned: number[][] = Array.from({ length: N }, () => []);
  const controlled: number[][] = Array.from({ length: N }, () => []);
  const pop = new Float64Array(N);
  for (const p of state.provinces) {
    if (p.isSea) continue;
    if (p.owner >= 0) {
      owned[p.owner].push(p.id);
      pop[p.owner] += p.pop;
    }
    if (p.controller >= 0) controlled[p.controller].push(p.id);
  }
  const divsAt = new Map<number, Division[]>();
  for (const d of state.divisions) {
    let arr = divsAt.get(d.province);
    if (!arr) divsAt.set(d.province, (arr = []));
    arr.push(d);
  }
  const war = new Uint8Array(N * N);
  const friendly = new Uint8Array(N * N);
  for (const w of state.wars) {
    for (const a of w.attackers)
      for (const d of w.defenders) {
        war[a * N + d] = 1;
        war[d * N + a] = 1;
      }
    for (const side of [w.attackers, w.defenders])
      for (const a of side)
        for (const b of side) if (a !== b) friendly[a * N + b] = friendly[b * N + a] = 1;
  }
  for (const p of state.pacts) {
    if (p.type === 'alliance' || p.type === 'puppet') {
      friendly[p.a * N + p.b] = 1;
      friendly[p.b * N + p.a] = 1;
    }
  }
  const idx: Index = { owned, controlled, divsAt, war, friendly, pop };
  cache = { state, index: idx };
  dirty = false;
  return idx;
}

export function atWar(state: GameState, a: number, b: number): boolean {
  if (a < 0 || b < 0 || a === b) return false;
  return index(state).war[a * state.nations.length + b] === 1;
}

export function isFriendly(state: GameState, a: number, b: number): boolean {
  if (a === b) return true;
  if (a < 0 || b < 0) return false;
  return index(state).friendly[a * state.nations.length + b] === 1;
}

export function warsOf(state: GameState, n: number): War[] {
  return state.wars.filter((w) => w.attackers.includes(n) || w.defenders.includes(n));
}

export function sideOf(w: War, n: number): 'attackers' | 'defenders' | null {
  if (w.attackers.includes(n)) return 'attackers';
  if (w.defenders.includes(n)) return 'defenders';
  return null;
}

export function enemiesIn(w: War, n: number): number[] {
  const s = sideOf(w, n);
  if (!s) return [];
  return s === 'attackers' ? w.defenders : w.attackers;
}

export function findPact(state: GameState, type: PactType, a: number, b: number, directional = false): Pact | undefined {
  return state.pacts.find(
    (p) => p.type === type && ((p.a === a && p.b === b) || (!directional && p.a === b && p.b === a)),
  );
}

export function alliesOf(state: GameState, n: number): number[] {
  const out: number[] = [];
  for (const p of state.pacts) {
    if (p.type !== 'alliance') continue;
    if (p.a === n) out.push(p.b);
    else if (p.b === n) out.push(p.a);
  }
  return out;
}

export function puppetsOf(state: GameState, n: number): number[] {
  return state.pacts.filter((p) => p.type === 'puppet' && p.a === n).map((p) => p.b);
}

export function overlordOf(state: GameState, n: number): number {
  const p = state.pacts.find((x) => x.type === 'puppet' && x.b === n);
  return p ? p.a : -1;
}

export function ownedProvinces(state: GameState, n: number): number[] {
  return index(state).owned[n] ?? [];
}

export function divisionsAt(state: GameState, province: number): Division[] {
  return index(state).divsAt.get(province) ?? [];
}

export function nationPop(state: GameState, n: number): number {
  return index(state).pop[n] ?? 0;
}

export function neighborsOf(state: GameState, n: number): number[] {
  const set = new Set<number>();
  for (const pid of ownedProvinces(state, n)) {
    for (const nb of state.provinces[pid].neighbors) {
      const o = state.provinces[nb].owner;
      if (o >= 0 && o !== n) set.add(o);
    }
  }
  return [...set];
}

/** Can `nation`'s divisions enter this land province? */
export function canEnter(state: GameState, nation: number, province: number): boolean {
  const p = state.provinces[province];
  if (p.isSea) return true;
  const c = p.controller;
  if (c === nation || c < 0) return true;
  if (isFriendly(state, nation, c)) return true;
  if (atWar(state, nation, c)) return true;
  if (atWar(state, nation, p.owner)) return true;
  if (findPact(state, 'access', c, nation)) return true;
  return false;
}

export function hasTech(state: GameState, n: number, tech: string): boolean {
  return state.nations[n].tech.researched.includes(tech);
}

export function provinceValue(state: GameState, pid: number): number {
  const p = state.provinces[pid];
  let b = 0;
  for (const v of Object.values(p.buildings)) b += v ?? 0;
  return 10 + p.pop / 40 + b * 4 + (p.isCapital ? 40 : 0) + (p.resource ? 8 : 0);
}

export function playerNation(state: GameState) {
  return state.player >= 0 ? state.nations[state.player] : null;
}

export function log(state: GameState, text: string, kind: GameState['log'][number]['kind'], nations: number[]): void {
  state.log.push({ day: state.day, text, kind, nations });
  if (state.log.length > 400) state.log.splice(0, state.log.length - 400);
}

export function warBetween(state: GameState, a: number, b: number): War | undefined {
  return state.wars.find(
    (w) => (w.attackers.includes(a) && w.defenders.includes(b)) || (w.attackers.includes(b) && w.defenders.includes(a)),
  );
}
