import { describe, expect, it } from 'vitest';
import { annexEnclave, buyPrice, canAnnexEnclave, isEnclave, proposeTreaty } from '../src/sim/diplomacy/pacts';
import { defaultSettings } from '../src/sim/setup';
import { newGame } from '../src/sim/worldgen';

describe('land diplomacy', () => {
  it('annexes a surrounded enclave cheaply', () => {
    const { state } = newGame(defaultSettings(11));
    const [a, b] = [state.nations[0], state.nations[1]];
    const target = state.provinces.find((p) => p.owner === b.id && !p.isCapital && !p.isSea && !(p.buildings.port ?? 0))!;
    expect(isEnclave(state, a.id, target.id)).toBe(false);
    for (const nb of target.neighbors) if (!state.provinces[nb].isSea) state.provinces[nb].controller = a.id;
    a.money = 1e6;
    expect(isEnclave(state, a.id, target.id)).toBe(true);
    expect(canAnnexEnclave(state, a.id, target.id)).toBeNull();
    expect(annexEnclave(state, a.id, target.id)).toBeNull();
    expect(target.owner).toBe(a.id);
  });

  it('buying land costs a lot and a bribe makes the target accept war', () => {
    const { state } = newGame(defaultSettings(12));
    const a = state.nations[0];
    const b = state.nations[1];
    a.money = 1e7;
    const p = state.provinces.find((q) => q.owner === b.id && !q.isCapital && !q.isSea)!;
    p.neighbors.forEach((nb) => { if (!state.provinces[nb].isSea) state.provinces[nb].owner = a.id; });
    const ask = buyPrice(state, p.id);
    expect(ask).toBeGreaterThan(300);
    expect(proposeTreaty(state, a.id, b.id, [{ k: 'buy_province', province: p.id, price: Math.round(ask * 0.3) }]).accepted).toBe(false);
    expect(proposeTreaty(state, a.id, b.id, [{ k: 'buy_province', province: p.id, price: ask * 2 }]).accepted).toBe(true);
    expect(p.owner).toBe(a.id);
  });
});
