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
  await page.goto(url);
  await page.waitForTimeout(600);
  await shot('1-menu');
  await page.click('text=New game');
  await page.waitForTimeout(1000);
  const canvas = await page.$('.preview-canvas');
  const box = await canvas.boundingBox();
  for (const [fx, fy] of [[0.5, 0.5], [0.4, 0.45], [0.6, 0.55], [0.3, 0.5], [0.7, 0.4], [0.45, 0.6]]) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    await page.waitForTimeout(120);
    if (await page.$eval('button.start', (b) => !b.disabled)) break;
  }
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
  for (const tab of ['Economy', 'Government', 'Military', 'Diplomacy', 'Rankings', 'Log']) {
    await dismissEvents();
    await page.click(`.tabs button:has-text("${tab}")`);
    await page.waitForTimeout(250);
    await shot(`5-${tab.toLowerCase()}`);
  }
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
  await page.close();
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
