// Movement, battles, retreats/encirclement, sieges and supply. Runs once per day.
import { TERRAIN_DEFENSE, TERRAIN_MOVE, UNITS } from '../../data/units';
import { mult } from '../modifiers';
import { rand } from '../rng';
import { atWar, canEnter, divisionsAt, index, isFriendly, log, markDirty, warBetween } from '../query';
import type { Division, GameState, Nation } from '../state';

const OCCUPATION_HOLD_DAYS = 90;

function eraMult(n: Nation): number {
  return 1 + 0.25 * n.era;
}

function inBattle(state: GameState, d: Division): boolean {
  for (const o of divisionsAt(state, d.province)) {
    if (o.owner !== d.owner && o.training === 0 && atWar(state, o.owner, d.owner)) return true;
  }
  return false;
}

export function movementDay(state: GameState): void {
  let moved = false;
  for (const d of state.divisions) {
    if (d.training > 0) {
      d.training--;
      if (d.training === 0) d.org = Math.max(d.org, 0.7);
      continue;
    }
    if (!d.path.length) continue;
    const here = state.provinces[d.province];
    // stay to siege enemy-held ground, and never walk out of a fight
    if (!here.isSea && atWar(state, d.owner, here.controller)) continue;
    if (inBattle(state, d)) continue;
    const next = d.path[0];
    const q = state.provinces[next];
    if (!q.isSea && !canEnter(state, d.owner, next)) {
      d.path = [];
      d.moveProgress = 0;
      continue;
    }
    const u = UNITS[d.type];
    const dist = Math.hypot(q.center[0] - here.center[0], q.center[1] - here.center[1]);
    const terrain = u.ignoresTerrain ? 1 : q.isSea ? 0.8 : TERRAIN_MOVE[q.terrain] ?? 1;
    const roads = 1 + 0.12 * ((here.roads + q.roads) / 2);
    const days = Math.max(1, (dist * terrain) / (u.speed * 9 * roads * mult(state, d.owner, 'moveSpeed')));
    d.moveProgress += 1 / days;
    if (d.moveProgress >= 1) {
      d.moveProgress = 0;
      d.province = next;
      d.path.shift();
      moved = true;
      if (!d.path.length) d.stance = 'hold';
    }
  }
  if (moved) markDirty();
}

interface Side {
  divs: Division[];
  power: number;
}

function sidePower(state: GameState, divs: Division[], attacking: boolean, provinceId: number): number {
  const p = state.provinces[provinceId];
  let total = 0;
  for (const d of divs) {
    const u = UNITS[d.type];
    const n = state.nations[d.owner];
    const base = attacking ? u.attack : u.defense;
    let v = base * d.strength * (0.3 + 0.7 * d.org) * eraMult(n) * (1 + Math.min(0.5, d.xp * 0.05));
    v *= mult(state, d.owner, attacking ? 'attack' : 'defense');
    if (!attacking && !u.ignoresTerrain) {
      v *= TERRAIN_DEFENSE[p.terrain] ?? 1;
      if (p.controller === d.owner || isFriendly(state, p.controller, d.owner)) v *= 1 + 0.15 * (p.buildings.fort ?? 0);
    }
    total += v;
  }
  if ((p.clickBoost ?? 0) > 0 && divs.some((d) => d.owner === p.clickBoostBy)) total *= 1 + p.clickBoost!;
  return total;
}

function applyDamage(state: GameState, side: Side, dmg: number, enemyOwner: number): void {
  const totalStr = side.divs.reduce((s, d) => s + d.strength, 0) || 1;
  for (const d of side.divs) {
    const share = dmg * (d.strength / totalStr);
    const u = UNITS[d.type];
    const toughness = 1 + u.defense * 0.12;
    const strLoss = Math.min(d.strength, (share * 0.45) / toughness);
    d.strength -= strLoss;
    d.org = Math.max(0, d.org - (share * 1.4) / toughness);
    const n = state.nations[d.owner];
    const lostMen = strLoss * u.manpower;
    const popK = Math.max(100, index(state).pop[d.owner]);
    n.warExhaustion = Math.min(100, n.warExhaustion + (lostMen / popK) * 60);
    const w = warBetween(state, d.owner, enemyOwner);
    if (w) {
      if (w.attackers.includes(d.owner)) w.casualtiesA += lostMen;
      else w.casualtiesD += lostMen;
    }
  }
}

/** Province a beaten division can fall back to, or -1 when it is encircled. */
function retreatTarget(state: GameState, d: Division): number {
  const p = state.provinces[d.province];
  let best = -1;
  let bestScore = -Infinity;
  for (const nb of p.neighbors) {
    const q = state.provinces[nb];
    if (q.isSea) continue;
    if (!isFriendly(state, d.owner, q.controller)) continue;
    const hostile = divisionsAt(state, nb).some((o) => atWar(state, o.owner, d.owner));
    if (hostile) continue;
    const score = (q.controller === d.owner ? 2 : 1) + q.roads * 0.1;
    if (score > bestScore) {
      bestScore = score;
      best = nb;
    }
  }
  return best;
}

export function combatDay(state: GameState): void {
  const removed = new Set<number>();
  const byProvince = index(state).divsAt;
  for (const [pid, divs] of byProvince) {
    const p = state.provinces[pid];
    if (p.isSea || divs.length < 2) continue;
    const ctrl = p.controller;
    const def: Division[] = [];
    const att: Division[] = [];
    for (const d of divs) {
      if (d.training > 0) continue;
      if (d.owner === ctrl || isFriendly(state, d.owner, ctrl)) def.push(d);
      else if (atWar(state, d.owner, ctrl)) att.push(d);
    }
    if (!def.length || !att.length) continue;
    // only fight units that are actually hostile to one another
    const defHostile = def.filter((d) => att.some((a) => atWar(state, a.owner, d.owner)));
    if (!defHostile.length) continue;
    const A: Side = { divs: att, power: sidePower(state, att, true, pid) };
    const D: Side = { divs: defHostile, power: sidePower(state, defHostile, false, pid) };
    const r1 = 0.8 + rand(state) * 0.4;
    const r2 = 0.8 + rand(state) * 0.4;
    applyDamage(state, D, A.power * 0.012 * r1, att[0].owner);
    applyDamage(state, A, D.power * 0.012 * r2, defHostile[0].owner);
    for (const d of [...att, ...defHostile]) d.xp = Math.min(10, d.xp + 0.02);

    for (const side of [A, D]) {
      for (const d of side.divs) {
        if (d.strength < 0.06) {
          removed.add(d.id);
          continue;
        }
        if (d.org < 0.12) {
          const to = retreatTarget(state, d);
          if (to < 0) {
            removed.add(d.id);
            const enemy = side === A ? defHostile[0].owner : att[0].owner;
            const w = warBetween(state, d.owner, enemy);
            if (w) {
              if (w.attackers.includes(enemy)) w.battlesA += 2;
              else w.battlesD += 2;
            }
            if (d.owner === state.player || enemy === state.player)
              log(state, `An encircled ${state.nations[d.owner].adjective} ${UNITS[d.type].name} surrendered in ${p.name}!`, d.owner === state.player ? 'bad' : 'good', [d.owner, enemy]);
          } else {
            d.province = to;
            d.path = [];
            d.moveProgress = 0;
          }
        }
      }
    }
    // record a battle win when one side is wiped out or routed
    const attLeft = att.filter((d) => !removed.has(d.id) && d.province === pid).length;
    const defLeft = defHostile.filter((d) => !removed.has(d.id) && d.province === pid).length;
    if (!attLeft || !defLeft) {
      const winner = attLeft ? att[0].owner : defHostile[0].owner;
      const loser = attLeft ? defHostile[0].owner : att[0].owner;
      const w = warBetween(state, winner, loser);
      if (w) {
        if (w.attackers.includes(winner)) w.battlesA++;
        else w.battlesD++;
      }
      if (winner === state.player || loser === state.player)
        log(state, `Battle of ${p.name}: ${state.nations[winner].name} defeats ${state.nations[loser].name}.`, winner === state.player ? 'good' : 'bad', [winner, loser]);
    }
  }
  if (removed.size) {
    state.divisions = state.divisions.filter((d) => !removed.has(d.id));
  }
  markDirty();
}

function isEncircled(state: GameState, pid: number): boolean {
  const p = state.provinces[pid];
  for (const nb of p.neighbors) {
    const q = state.provinces[nb];
    if (q.isSea) {
      if ((p.buildings.port ?? 0) > 0) return false;
      continue;
    }
    if (isFriendly(state, q.controller, p.controller)) return false;
  }
  return true;
}

export function siegeDay(state: GameState): void {
  const byProvince = index(state).divsAt;
  let changed = false;
  for (const p of state.provinces) {
    if (p.isSea) continue;
    if ((p.clickBoost ?? 0) > 0) {
      p.clickBoost! *= 0.9;
      if (p.clickBoost! < 0.01) p.clickBoost = 0;
    }
    const divs = (byProvince.get(p.id) ?? []).filter((d) => d.training === 0);
    const ctrl = p.controller;
    const hostile = divs.filter((d) => atWar(state, d.owner, ctrl));
    const defenders = divs.filter((d) => d.owner === ctrl || isFriendly(state, d.owner, ctrl));
    if (!hostile.length || defenders.some((d) => hostile.some((h) => atWar(state, h.owner, d.owner)))) {
      if (!hostile.length && p.siege > 0) {
        p.siege = Math.max(0, p.siege - 5);
        if (p.siege === 0) p.siegeBy = -1;
      }
      continue;
    }
    // strongest hostile nation present leads the siege
    const byOwner = new Map<number, number>();
    for (const d of hostile) byOwner.set(d.owner, (byOwner.get(d.owner) ?? 0) + UNITS[d.type].attack * d.strength * d.org);
    let leader = hostile[0].owner;
    let best = -1;
    for (const [o, v] of byOwner) {
      if (v > best) {
        best = v;
        leader = o;
      }
    }
    if (p.siegeBy !== leader) {
      p.siegeBy = leader;
      p.siege = 0;
    }
    let power = 0;
    for (const d of hostile) power += UNITS[d.type].attack * d.strength * (0.4 + 0.6 * d.org) * eraMult(state.nations[d.owner]);
    const fort = p.buildings.fort ?? 0;
    let rate = (power * 3) / (1 + fort * 1.3 + (p.isCapital ? 1.2 : 0) + ((TERRAIN_DEFENSE[p.terrain] ?? 1) - 1) * 2);
    if (isEncircled(state, p.id)) rate *= 2.5;
    // a fresh conquest is hard to take back at once, so advancing armies are not cut off by raids behind them
    if (p.controller !== p.owner && p.heldSince !== undefined && state.day - p.heldSince < OCCUPATION_HOLD_DAYS) rate *= 0.3;
    // liberating your own or an ally's land is quick
    if (p.owner === leader || isFriendly(state, p.owner, leader)) rate *= 2;
    if ((p.clickBoost ?? 0) > 0 && hostile.some((d) => d.owner === p.clickBoostBy)) rate *= 1 + p.clickBoost! * 1.5;
    if (fort > 0) for (const d of hostile) d.org = Math.max(0.05, d.org - 0.004 * fort);
    p.siege += rate;
    if (p.siege >= 100) {
      const newCtrl = p.owner === leader || isFriendly(state, p.owner, leader) ? p.owner : leader;
      const oldCtrl = p.controller;
      p.controller = newCtrl;
      p.heldSince = state.day;
      p.siege = 0;
      p.siegeBy = -1;
      p.devastation = Math.min(1, p.devastation + 0.15);
      // units still training there are captured
      state.divisions = state.divisions.filter((d) => !(d.province === p.id && d.training > 0 && d.owner === oldCtrl));
      changed = true;
      if (newCtrl === state.player || oldCtrl === state.player || p.owner === state.player) {
        const good = newCtrl === state.player || (state.player >= 0 && isFriendly(state, newCtrl, state.player));
        log(state, `${p.name}${p.isCapital ? ' (capital)' : ''} ${newCtrl === p.owner ? 'liberated by' : 'occupied by'} ${state.nations[newCtrl].name}.`, good ? 'good' : 'bad', [newCtrl, oldCtrl]);
      }
    }
  }
  if (changed) markDirty();
}

/** Recovery, reinforcement and supply attrition for divisions not in battle. */
export function readinessDay(state: GameState): void {
  for (const d of state.divisions) {
    if (d.training > 0) continue;
    const p = state.provinces[d.province];
    const n = state.nations[d.owner];
    if (inBattle(state, d)) continue;
    let supplied = p.isSea ? false : isFriendly(state, d.owner, p.controller);
    if (!supplied && !p.isSea) {
      supplied = p.neighbors.some((nb) => {
        const q = state.provinces[nb];
        return !q.isSea && isFriendly(state, d.owner, q.controller);
      });
    }
    if (p.isSea) supplied = true; // short crossings
    if (!supplied) {
      d.org = Math.max(0, d.org - 0.02);
      d.strength = Math.max(0.05, d.strength - 0.002);
      continue;
    }
    d.org = Math.min(1, d.org + 0.035);
    if (d.strength < 1 && p.controller === d.owner && n.manpower > 0.5) {
      const u = UNITS[d.type];
      const add = Math.min(0.02, 1 - d.strength);
      const men = add * u.manpower;
      if (n.manpower >= men) {
        n.manpower -= men;
        n.money -= add * u.cost * 0.3;
        d.strength += add;
      }
    }
  }
}
