// End-to-end smoke test: drives the real app in Chromium and saves screenshots.
// Usage:
//   node scripts/e2e-smoke.mjs [outDir] [url]                  (against a running dev server)
//   node scripts/e2e-smoke.mjs out --serve dist --base /warprime/  (serves the production build like GitHub Pages)
//   node scripts/e2e-smoke.mjs out https://.../warprime/ --scenario boot --retries 6   (live smoke)
// Set CHROMIUM_PATH to use a preinstalled browser.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { serveStatic } from './serve-static.mjs';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const positional = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
const out = positional[0] ?? 'screenshots';
let url = positional[1] ?? 'http://localhost:5173/';
const scenario = flag('scenario', 'full');
const retries = Number(flag('retries', '0'));
let server = null;
if (flag('serve')) {
  const s = await serveStatic(flag('serve'), flag('base', '/warprime/'));
  server = s.server;
  url = s.url;
  console.log(`serving ${flag('serve')} at ${url}`);
}
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];

async function run(viewport, tag) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('ERR_CERT') && !m.text().includes('fonts.g')) errors.push(`[${tag}] console: ${m.text()}`);
  });
  const shot = (name) => page.screenshot({ path: `${out}/${tag}-${name}.png` });
  const dismissEvents = async () => {
    for (let i = 0; i < 8; i++) {
      const opt = await page.$('.event-options button');
      if (!opt) return;
      await opt.click();
      await page.waitForTimeout(120);
    }
  };
  await page.goto(withE2e(url));
  await page.waitForTimeout(600);
  await shot('1-menu');
  await page.click('text=New game');
  await page.waitForTimeout(1000);
  await pickNation(page);
  await shot('2-setup');
  await page.click('button.start');
  await page.waitForTimeout(900);

  // jump to the capital via the nation button (opens the province panel)
  if (!(await page.$('.work-btn'))) {
    await page.click('.tb-nation');
    await page.waitForTimeout(200);
  }
  // work the capital a few times via the panel button
  for (let i = 0; i < 8; i++) await page.click('.work-btn');
  await page.waitForTimeout(200);
  await shot('3-worked');

  // try to build the first affordable building in the capital
  const builds = await page.$$('.build-list .bld:not([disabled])');
  if (builds.length) await builds[0].click();
  await page.waitForTimeout(200);

  // research
  await page.click('.tabs button:has-text("Research")');
  await page.waitForTimeout(200);
  const tech = await page.$('.tech:not([disabled])');
  if (tech) await tech.click();
  await shot('4-research');

  await dismissEvents();
  // select all forces in the capital
  const selAll = await page.$('text=Select all');
  if (selAll) await selAll.click();

  // let time run
  await page.keyboard.press('Digit4');
  await page.waitForTimeout(4000);
  await page.keyboard.press('Digit0');
  await dismissEvents();
  for (const tab of ['Economy', 'Government', 'Military', 'Diplomacy', 'Leaderboard', 'Log']) {
    await dismissEvents();
    await page.click(`.tabs button:has-text("${tab}")`);
    await page.waitForTimeout(250);
    await shot(`5-${tab.toLowerCase()}`);
  }
  // leaderboard sub-tabs
  await page.click('.tabs button:has-text("Leaderboard")');
  for (const sub of ['All-time', 'History', 'Now']) {
    await page.click(`.lb-tabs button:has-text("${sub}")`);
    await page.waitForTimeout(200);
    await shot(`5-leaderboard-${sub.toLowerCase()}`);
  }
  if ((await page.$$('.lb-list .lb-row')).length === 0) throw new Error('leaderboard shows no rows');
  for (const mode of ['Relations', 'Resources', 'Population', 'Terrain']) {
    await dismissEvents();
    const b = await page.$(`.map-modes button:has-text("${mode}")`);
    if (b) {
      await b.click();
      await page.waitForTimeout(250);
      await shot(`6-map-${mode.toLowerCase()}`);
    }
  }
  if (tag === 'desktop') await diplomacyFlow(page, shot, dismissEvents);
  await endings(page, shot, tag);
  await page.close();
}

function withE2e(u) {
  return u + (u.includes('?') ? '&' : '?') + 'e2e=1';
}

async function pickNation(page) {
  const canvas = await page.$('.preview-canvas');
  const box = await canvas.boundingBox();
  for (const [fx, fy] of [[0.5, 0.5], [0.4, 0.45], [0.6, 0.55], [0.3, 0.5], [0.7, 0.4], [0.45, 0.6]]) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    await page.waitForTimeout(120);
    if (await page.$eval('button.start', (b) => !b.disabled)) return;
  }
  throw new Error('could not pick a nation');
}

/** Ends the game through the ?e2e=1 handle and checks the end screen. */
async function endWith(page, cause, expect) {
  await page.evaluate((c) => globalThis.__warprime.endGame(c), cause);
  await page.waitForSelector('[data-testid="endscreen"]', { timeout: 5000 });
  const head = await page.textContent('.end-head h1');
  if (!expect.test(head)) throw new Error(`${cause}: unexpected end screen title "${head}"`);
  if ((await page.$$('.end-boards .lb-row')).length === 0) throw new Error(`${cause}: end screen shows no leaderboard rows`);
  if (!(await page.$('.endscreen .timeline'))) throw new Error(`${cause}: end screen has no timeline`);
}

async function newGameFromEndScreen(page) {
  await page.click('.end-buttons button:has-text("New game")');
  await page.waitForSelector('.preview-canvas');
  await page.waitForTimeout(600);
  await pickNation(page);
  await page.click('button.start');
  await page.waitForTimeout(600);
  // let a couple of months pass so there is history to show
  await page.keyboard.press('Digit4');
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(300);
    for (const opt of await page.$$('.event-options button')) {
      await opt.click().catch(() => {});
      break;
    }
  }
  await page.keyboard.press('Digit0');
}

async function endings(page, shot, tag) {
  await page.keyboard.press('Escape');
  // 1. the year limit, then the Hall of Fame entry it recorded
  await endWith(page, 'year_limit', /year 3000|ends history on top/);
  await shot('10-end-year-limit');
  if (tag !== 'desktop') return;
  await page.waitForTimeout(500);
  await page.click('.end-buttons button:has-text("Hall of Fame")');
  await page.waitForSelector('[data-testid="hall-of-fame"] tbody tr.me', { timeout: 5000 });
  await shot('11-hall-of-fame');
  await page.click('[data-testid="hall-of-fame"] button:has-text("Close")');
  // 2. elimination, spectating, and the world ending while you watch
  await newGameFromEndScreen(page);
  await endWith(page, 'eliminated', /has fallen/);
  await shot('12-end-eliminated');
  await page.click('.end-buttons button:has-text("Spectate")');
  await page.waitForTimeout(800);
  if (await page.$('[data-testid="endscreen"]')) throw new Error('spectate did not close the end screen');
  if (!(await page.$('.topbar.spectator'))) throw new Error('no spectator bar');
  await shot('13-spectating');
  await endWith(page, 'climate_collapse', /uninhabitable/);
  // 3. climate collapse from a running game
  await newGameFromEndScreen(page);
  await endWith(page, 'climate_collapse', /uninhabitable/);
  await shot('14-end-climate');
}

async function diplomacyFlow(page, shot, dismissEvents) {
  page.on('dialog', (d) => d.accept());
  await dismissEvents();
  await page.click('.tabs button:has-text("Diplomacy")');
  await page.waitForTimeout(200);
  await page.click('.nation-row >> nth=0');
  await page.waitForTimeout(200);
  // treaty desk: propose a non-aggression pact and read the verdict
  await page.selectOption('.treaty select', 'nap');
  await page.waitForTimeout(150);
  await shot('7-treaty');
  if (!(await page.$('.evaluation'))) throw new Error('treaty desk shows no AI verdict');
  await page.click('.treaty button:has-text("Propose")');
  await page.waitForTimeout(200);
  // war and peace with the nation that likes us least
  await page.selectOption('.section select[aria-label="Sort nations"]', 'opinion');
  const rows = await page.$$('.nation-row');
  await rows[rows.length - 1].click();
  await page.waitForTimeout(200);
  const declare = await page.$('button:has-text("Declare war")');
  if (!declare) throw new Error('no declare war button');
  await declare.click();
  await page.waitForTimeout(300);
  await dismissEvents();
  if (!(await page.$('.war-card'))) throw new Error('war did not start');
  await shot('8-war');
  const negotiate = await page.$('button:has-text("Negotiate peace")');
  if (negotiate) {
    await negotiate.click();
    await page.waitForTimeout(200);
    await page.click('.peace-tabs button:has-text("White peace")');
    await shot('9-peace');
    await page.click('.peace button:has-text("Send proposal")');
    await page.waitForTimeout(200);
  }
}

async function boot() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => errors.push(`[boot] pageerror: ${e.message}`));
  for (let attempt = 0; ; attempt++) {
    const res = await page.goto(url).catch((e) => ({ ok: () => false, status: () => String(e) }));
    if (res && res.ok()) break;
    if (attempt >= retries) throw new Error(`could not load ${url}: ${res?.status?.()}`);
    await page.waitForTimeout(10_000);
  }
  await page.waitForSelector('text=New game', { timeout: 30_000 });
  await page.screenshot({ path: `${out}/boot-menu.png` });
  await page.close();
}

if (scenario === 'boot') await boot();
else {
  await run({ width: 1440, height: 900 }, 'desktop');
  await run({ width: 390, height: 844 }, 'mobile');
}
await browser.close();
server?.close();
console.log(errors.length ? errors.join('\n') : 'no errors');
process.exit(errors.length ? 1 : 0);
