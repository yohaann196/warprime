// Measures simulation cost per day, by phase. Usage: npm run perf -- [--seed 1] [--years 20] [--difficulty realistic]
import { performance } from 'node:perf_hooks';
import { newGame } from '../src/sim/worldgen';
import { defaultSettings } from '../src/sim/setup';
import { advanceDay } from '../src/sim/tick';
import { PROFILE, resetProfile } from '../src/sim/profile';
import type { Difficulty } from '../src/sim/state';
import { num, parseArgs, str } from './args';

const args = parseArgs();
const seed = num(args, 'seed', 1, 0);
const years = num(args, 'years', 20, 1);
const difficulty = str(args, 'difficulty', 'realistic', 2) as Difficulty;
const { state } = newGame(defaultSettings(seed, difficulty));

PROFILE.now = () => performance.now();
const perDay: number[] = [];
const days = years * 365;
for (let d = 0; d < days && !state.gameOver; d++) {
  if (d === 365) resetProfile(); // skip the first year (cold caches, start-up)
  const t0 = performance.now();
  advanceDay(state);
  if (d >= 365) perDay.push(performance.now() - t0);
}
perDay.sort((a, b) => a - b);
const q = (p: number) => perDay[Math.min(perDay.length - 1, Math.floor(perDay.length * p))] ?? 0;
console.log(`nations ${state.nations.length} (alive ${state.nations.filter((n) => n.alive).length}), provinces ${state.provinces.length}, divisions ${state.divisions.length}`);
console.log(`ms/day  p50 ${q(0.5).toFixed(3)}  p95 ${q(0.95).toFixed(3)}  max ${q(1).toFixed(3)}  (${perDay.length} days)`);
const total = Object.values(PROFILE.ms).reduce((a, b) => a + b, 0);
for (const [k, v] of Object.entries(PROFILE.ms).sort((a, b) => b[1] - a[1]))
  console.log(`  ${k.padEnd(10)} ${(v / Math.max(1, PROFILE.days)).toFixed(3)} ms/day  ${((v / total) * 100).toFixed(0)}%`);
