// Every player action goes through applyCommand so the UI never mutates state directly.
import { buildClick, battleClick, researchClick, upgradeCost, workClick, type ClickResult } from './clicks';
import { cancelBuilding, startBuilding, upgradeRoad } from './economy/build';
import { marketBuy, marketSell } from './economy/market';
import { raiseInstitution, switchEconSystem } from './institutions';
import { findPath } from './military/pathfinding';
import { disband, recruit } from './military/units';
import { launchNuke, sabotage, startNuke } from './military/nukes';
import { annexEnclave, annexPuppet, breakPact, proposeTreaty, type Clause, type Evaluation } from './diplomacy/pacts';
import { improveRelations, insult } from './diplomacy/relations';
import {
  aiAcceptsTerms,
  callToArms,
  declareWar,
  makePeace,
  validateTerms,
  withdrawFromWar,
  type PeaceTerms,
  type WarSide,
} from './diplomacy/war';
import { resolveEvent } from './events';
import { invalidateMods } from './modifiers';
import { markDirty, sideOf } from './query';
import { checkResearchDone, setResearch } from './tech';
import { UNITS } from '../data/units';
import type { BuildingId, EconSystemId, GameState, Good, Institution, UnitType } from './state';

export type Command =
  | { type: 'workClick'; province: number }
  | { type: 'buildClick'; province: number }
  | { type: 'researchClick' }
  | { type: 'battleClick'; province: number }
  | { type: 'buyClickUpgrade' }
  | { type: 'build'; province: number; building: BuildingId }
  | { type: 'cancelBuild'; province: number }
  | { type: 'upgradeRoad'; province: number }
  | { type: 'setTax'; rate: number }
  | { type: 'setResearch'; tech: string }
  | { type: 'raiseInstitution'; institution: Institution }
  | { type: 'switchEcon'; system: EconSystemId }
  | { type: 'setReserve'; good: Good; amount: number }
  | { type: 'toggleAutoTrade' }
  | { type: 'marketBuy'; good: Good; amount: number }
  | { type: 'marketSell'; good: Good; amount: number }
  | { type: 'recruit'; province: number; unit: UnitType }
  | { type: 'move'; divisions: number[]; target: number }
  | { type: 'stop'; divisions: number[] }
  | { type: 'disband'; division: number }
  | { type: 'declareWar'; target: number }
  | { type: 'proposeTreaty'; target: number; clauses: Clause[] }
  | { type: 'breakPact'; pact: number }
  | { type: 'callToArms'; ally: number; war: number }
  | { type: 'proposePeace'; war: number; receiver: WarSide; terms: PeaceTerms }
  | { type: 'withdrawWar'; war: number }
  | { type: 'improveRelations'; target: number }
  | { type: 'insult'; target: number }
  | { type: 'buildNuke' }
  | { type: 'launchNuke'; province: number }
  | { type: 'sabotage'; province: number }
  | { type: 'eventChoice'; index: number; option: number }
  | { type: 'annexPuppet'; puppet: number }
  | { type: 'annexEnclave'; province: number };

export interface CommandResult {
  ok: boolean;
  msg?: string;
  click?: ClickResult;
  evaluation?: Evaluation;
}

const fail = (msg: string): CommandResult => ({ ok: false, msg });
const okMsg = (msg?: string): CommandResult => ({ ok: true, msg });

export function applyCommand(state: GameState, nationId: number, cmd: Command): CommandResult {
  const n = state.nations[nationId];
  if (!n || !n.alive) return fail('No nation');
  if (state.gameOver) return fail('The game is over');
  const res = run(state, nationId, cmd);
  markDirty();
  invalidateMods();
  return res;
}

function run(state: GameState, nationId: number, cmd: Command): CommandResult {
  const n = state.nations[nationId];
  switch (cmd.type) {
    case 'workClick': {
      const r = workClick(state, n, cmd.province);
      return r ? { ok: true, click: r } : fail('Click your own provinces to work them');
    }
    case 'buildClick': {
      const r = buildClick(state, n, cmd.province);
      return r ? { ok: true, click: r } : fail('Nothing under construction');
    }
    case 'researchClick': {
      const r = researchClick(state, n);
      if (r) checkResearchDone(state, n);
      return r ? { ok: true, click: r } : fail('Pick a technology first');
    }
    case 'battleClick': {
      const r = battleClick(state, n, cmd.province);
      return r ? { ok: true, click: r } : fail('No battle here');
    }
    case 'buyClickUpgrade': {
      const cost = upgradeCost(n);
      if (n.money < cost) return fail(`Need ${cost} money`);
      n.money -= cost;
      n.clicks.upgrades++;
      n.clicks.power += 0.6;
      return okMsg('Click power increased');
    }
    case 'build': {
      const err = startBuilding(state, n, state.provinces[cmd.province], cmd.building);
      return err ? fail(err) : okMsg();
    }
    case 'cancelBuild':
      cancelBuilding(n, state.provinces[cmd.province]);
      return okMsg();
    case 'upgradeRoad': {
      const err = upgradeRoad(n, state.provinces[cmd.province]);
      return err ? fail(err) : okMsg();
    }
    case 'setTax':
      n.taxRate = Math.max(0, Math.min(0.6, Math.round(cmd.rate * 100) / 100));
      return okMsg();
    case 'setResearch': {
      const err = setResearch(state, n, cmd.tech);
      return err ? fail(err) : okMsg();
    }
    case 'raiseInstitution': {
      const err = raiseInstitution(state, n, cmd.institution);
      return err ? fail(err) : okMsg();
    }
    case 'switchEcon': {
      const err = switchEconSystem(state, n, cmd.system);
      return err ? fail(err) : okMsg();
    }
    case 'setReserve':
      n.reserve[cmd.good] = Math.max(0, cmd.amount);
      return okMsg();
    case 'toggleAutoTrade':
      n.autoTrade = !n.autoTrade;
      return okMsg(n.autoTrade ? 'Auto-trade on' : 'Auto-trade off');
    case 'marketBuy': {
      const spent = marketBuy(state, n, cmd.good, cmd.amount);
      return spent > 0 ? okMsg(`Bought for ${Math.round(spent)}`) : fail('Could not buy');
    }
    case 'marketSell': {
      const got = marketSell(state, n, cmd.good, cmd.amount);
      return got > 0 ? okMsg(`Sold for ${Math.round(got)}`) : fail('Nothing to sell');
    }
    case 'recruit': {
      const r = recruit(state, n, cmd.unit, cmd.province);
      return typeof r === 'string' ? fail(r) : okMsg(`${UNITS[cmd.unit].name} in training`);
    }
    case 'move': {
      let moved = 0;
      let reason = 'No route';
      for (const id of cmd.divisions) {
        const d = state.divisions.find((x) => x.id === id && x.owner === nationId);
        if (!d) continue;
        if (d.training > 0) {
          reason = 'Still training';
          continue;
        }
        const path = findPath(state, nationId, d.province, cmd.target, UNITS[d.type].ignoresTerrain);
        if (!path) {
          reason = 'No route (need access, war, or a port to embark)';
          continue;
        }
        d.path = path;
        d.moveProgress = 0;
        d.stance = 'move';
        moved++;
      }
      return moved ? okMsg(`${moved} division${moved > 1 ? 's' : ''} on the move`) : fail(reason);
    }
    case 'stop':
      for (const id of cmd.divisions) {
        const d = state.divisions.find((x) => x.id === id && x.owner === nationId);
        if (d) {
          d.path = [];
          d.moveProgress = 0;
          d.stance = 'hold';
        }
      }
      return okMsg();
    case 'disband':
      disband(state, n, cmd.division);
      return okMsg();
    case 'declareWar': {
      const r = declareWar(state, nationId, cmd.target);
      return typeof r === 'string' ? fail(r) : okMsg(`War declared: ${r.name}`);
    }
    case 'proposeTreaty': {
      const r = proposeTreaty(state, nationId, cmd.target, cmd.clauses);
      if (r.error) return { ok: false, msg: r.error, evaluation: r.evaluation };
      return { ok: r.accepted, msg: r.accepted ? 'Treaty accepted!' : 'Treaty rejected', evaluation: r.evaluation };
    }
    case 'breakPact': {
      const pact = state.pacts.find((p) => p.id === cmd.pact && (p.a === nationId || p.b === nationId));
      if (!pact) return fail('No such agreement');
      breakPact(state, nationId, pact);
      return okMsg();
    }
    case 'callToArms': {
      const war = state.wars.find((w) => w.id === cmd.war);
      if (!war) return fail('No such war');
      const err = callToArms(state, nationId, cmd.ally, war);
      return err ? fail(err) : okMsg(`${state.nations[cmd.ally].name} joins the war!`);
    }
    case 'proposePeace': {
      const war = state.wars.find((w) => w.id === cmd.war);
      if (!war) return fail('No such war');
      const side = sideOf(war, nationId);
      if (!side || war[side][0] !== nationId) return fail('Only war leaders can negotiate peace');
      const err = validateTerms(state, war, cmd.receiver, cmd.terms);
      if (err) return fail(err);
      const other: WarSide = side === 'attackers' ? 'defenders' : 'attackers';
      const otherLeader = war[other][0];
      // if we are conceding, the AI always takes it; if demanding, it weighs the war score
      const accepts = cmd.receiver === other || aiAcceptsTerms(state, war, cmd.receiver, cmd.terms);
      if (!accepts || state.nations[otherLeader].isPlayer) return fail(`${state.nations[otherLeader].name} rejects the terms`);
      makePeace(state, war, cmd.receiver, cmd.terms);
      return okMsg('Peace signed');
    }
    case 'withdrawWar': {
      const war = state.wars.find((w) => w.id === cmd.war);
      if (!war) return fail('No such war');
      const err = withdrawFromWar(state, war, nationId);
      return err ? fail(err) : okMsg();
    }
    case 'improveRelations': {
      const err = improveRelations(state, nationId, cmd.target);
      return err ? fail(err) : okMsg('Relations improved');
    }
    case 'insult':
      insult(state, nationId, cmd.target);
      return okMsg('They will not forget that');
    case 'buildNuke': {
      const err = startNuke(state, nationId);
      return err ? fail(err) : okMsg('Warhead programme started');
    }
    case 'launchNuke': {
      const r = launchNuke(state, nationId, cmd.province);
      if (typeof r === 'string') return fail(r);
      return okMsg(r.intercepted ? 'The missile was intercepted!' : `Detonation. ${Math.round(r.deaths)}k dead.`);
    }
    case 'sabotage':
      return okMsg(sabotage(state, nationId, cmd.province));
    case 'eventChoice': {
      const ev = state.pendingEvents[cmd.index];
      if (!ev || ev.nation !== nationId) return fail('No such event');
      state.pendingEvents.splice(cmd.index, 1);
      resolveEvent(state, ev, cmd.option);
      return okMsg();
    }
    case 'annexEnclave': {
      const err = annexEnclave(state, nationId, cmd.province);
      return err ? fail(err) : okMsg('Enclave annexed');
    }
    case 'annexPuppet': {
      const err = annexPuppet(state, nationId, cmd.puppet);
      return err ? fail(err) : okMsg();
    }
  }
}
