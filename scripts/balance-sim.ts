// Headless AI-only balance run. Usage: npm run sim -- [--seed 1] [--years 40] [--difficulty realistic] [--every 10]
import { newGame } from '../src/sim/worldgen';
import { defaultSettings } from '../src/sim/setup';
import { advanceDay } from '../src/sim/tick';
import { ownedProvinces, nationPop } from '../src/sim/query';
import { yearsFmt } from '../src/sim/leaderboard';
import { yearOf, type Difficulty } from '../src/sim/state';

import { num, parseArgs, str } from './args';

const args = parseArgs();
const seed = num(args, 'seed', 1, 0);
const years = num(args, 'years', 40, 1);
const difficulty = str(args, 'difficulty', 'realistic', 2) as Difficulty;
const every = num(args, 'every', 10);
const { state } = newGame(defaultSettings(seed, difficulty));
const seen = new Set<number>();
const t0 = Date.now();

for (let y = 0; y < years && !state.gameOver; y++) {
  for (let d = 0; d < 365 && !state.gameOver; d++) {
    advanceDay(state);
    for (const w of state.wars) seen.add(w.id);
  }
  if (y % every !== every - 1 && !state.gameOver) continue;
  const alive = state.nations.filter((n) => n.alive);
  console.log(`== ${yearOf(state)}  alive ${alive.length}  wars started ${seen.size} (active ${state.wars.length})  divisions ${state.divisions.length}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log(`   crown ${state.nations[state.leaderboard.crown]?.name ?? '—'}  reigns ${state.leaderboard.reigns.length}`);
  for (const n of state.leaderboard.order.slice(0, 5).map((id) => state.nations[id])) {
    const net = Object.values(n.ledger).reduce((a, b) => a + b, 0);
    console.log(
      `   ${n.name.padEnd(12)} P ${n.prosperity.toFixed(1).padStart(5)}  prov ${String(ownedProvinces(state, n.id).length).padStart(3)}  pop ${(nationPop(state, n.id) / 1000).toFixed(1)}M  gdp ${n.gdp.toFixed(0)}  net ${net.toFixed(0)}/d  $ ${n.money.toFixed(0)}  hap ${n.happiness.toFixed(0)} stab ${n.stability.toFixed(0)}  era ${n.era}  ${n.econSystem}`,
    );
  }
}
const lb = state.leaderboard;
const name = (id: number) => state.nations[id]?.name ?? '—';
console.log(`== All-time (${lb.reigns.length} reigns)`);
for (const id of lb.allTimeOrder.slice(0, 5)) {
  const r = lb.records[id];
  console.log(`   ${name(id).padEnd(12)} #1 ${yearsFmt(r.daysAtTop).padStart(10)}  top3 ${yearsFmt(r.daysTop3).padStart(10)}  pts ${r.rankPoints.toFixed(0).padStart(5)}  reigns ${r.reigns}${r.diedDay >= 0 ? `  † ${yearOf({ ...state, day: r.diedDay })}` : ''}`);
}
console.log(`== Decades: ${lb.decades.map((d) => `${d.start}s ${d.holders[0] ? name(d.holders[0][0]) : '—'}`).join(' · ') || '—'}`);
const over = state.gameOver;
console.log(over ? `Game over ${over.year}: ${over.cause}, crown ${name(over.crown)}` : `Still running in ${yearOf(state)}, crown ${name(lb.crown)}`);
