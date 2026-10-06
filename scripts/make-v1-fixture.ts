// Generates tests/fixtures/save-v1.json from the v1 simulation (commit b4e8996).
// Kept for reference: the fixture is committed and must not be regenerated after the v2 schema change.
import { writeFileSync } from 'node:fs';
import { newGame } from '../src/sim/worldgen';
import { choosePlayerNation, defaultSettings } from '../src/sim/setup';
import { advanceDay } from '../src/sim/tick';

const { state } = newGame(defaultSettings(4242));
choosePlayerNation(state, { nation: 0, econSystem: 'mixed', goals: ['industry', 'trade'] });
for (let d = 0; d < 240; d++) advanceDay(state);
writeFileSync('tests/fixtures/save-v1.json', JSON.stringify(state));
console.log('day', state.day, 'bytes', JSON.stringify(state).length, 'version', state.version);
