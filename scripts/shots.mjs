#!/usr/bin/env node
/**
 * Captures the screen set used to eyeball the build against the aesthetic
 * spec, and as the baseline for screenshot regression.
 *
 *   node scripts/shots.mjs [outDir] [baseUrl]
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const outDir = process.argv[2] ?? 'shots';
const base = process.argv[3] ?? 'http://localhost:5173/';

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));

await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(1400);

/** Each shot: a name, and the key presses that get us there from the hub. */
const SHOTS = [
  ['hub', []],
  ['hub-online', ['KeyE']],
  ['squad', ['KeyQ', 'ArrowRight', 'Enter']],
  ['settings', ['Escape', 'Tab']],
];

for (const [name, keys] of SHOTS) {
  for (const key of keys) {
    await page.keyboard.press(key);
    await page.waitForTimeout(320);
  }
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log(`shot: ${name}`);
  // Return to the hub between shots.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(320);
}

console.log(errors.length ? `CONSOLE ERRORS:\n${errors.join('\n')}` : 'no console errors');
await browser.close();
