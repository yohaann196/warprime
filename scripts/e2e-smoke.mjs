// End-to-end smoke test: drives the real app in Chromium and saves screenshots.
// Usage: start `npm run dev`, then `node scripts/e2e-smoke.mjs [outDir] [baseUrl]`.
// Set CHROMIUM_PATH to use a preinstalled browser.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'screenshots';
const url = process.argv[3] ?? 'http://localhost:5173/';
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
  await page.close();
}

await run({ width: 1440, height: 900 }, 'desktop');
await run({ width: 390, height: 844 }, 'mobile');
await browser.close();
console.log(errors.length ? errors.join('\n') : 'no errors');
process.exit(errors.length ? 1 : 0);
