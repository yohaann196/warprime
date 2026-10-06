// Headless AI-only balance run. Usage: npm run sim -- [--seed 1] [--years 40] [--difficulty realistic] [--every 10]
import { newGame } from '../src/sim/worldgen';
import { defaultSettings } from '../src/sim/setup';
import { advanceDay } from '../src/sim/tick';
import { ownedProvinces, nationPop } from '../src/sim/query';
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
  for (const n of [...alive].sort((a, b) => b.prosperity - a.prosperity).slice(0, 5)) {
    const net = Object.values(n.ledger).reduce((a, b) => a + b, 0);
    console.log(
      `   ${n.name.padEnd(12)} P ${n.prosperity.toFixed(1).padStart(5)}  prov ${String(ownedProvinces(state, n.id).length).padStart(3)}  pop ${(nationPop(state, n.id) / 1000).toFixed(1)}M  gdp ${n.gdp.toFixed(0)}  net ${net.toFixed(0)}/d  $ ${n.money.toFixed(0)}  hap ${n.happiness.toFixed(0)} stab ${n.stability.toFixed(0)}  era ${n.era}  ${n.econSystem}`,
    );
  }
}
const over = state.gameOver;
console.log(over ? `Game over ${yearOf(state)}: ${state.nations[over.winner]?.name} — ${over.type}` : 'No winner yet');
