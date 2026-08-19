#!/usr/bin/env node
/** Captures the match presentation sequence and live play. */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const outDir = process.argv[2] ?? 'shots';
const base = process.argv[3] ?? 'http://localhost:5173/';
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));

await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.keyboard.press('Enter');          // Kick Off tile

await page.waitForSelector('.pres--walkout', { timeout: 8000 });
await page.waitForTimeout(900);
await page.screenshot({ path: `${outDir}/pres-walkout.png` });
console.log('shot: walkout');

// Screenshotting a WebGL canvas under software rendering takes seconds, so
// capture as soon as the beat appears rather than settling into it first.
await page.waitForSelector('.pres--teamsheet', { timeout: 14000 });
await page.waitForTimeout(400);
await page.screenshot({ path: `${outDir}/pres-teamsheet.png` });
console.log('shot: teamsheet');

await page.waitForSelector('.hud', { timeout: 12000 });
await page.waitForTimeout(8000);
await page.screenshot({ path: `${outDir}/match-live.png` });
console.log('shot: live');

console.log(errors.length ? `CONSOLE ERRORS:\n${errors.join('\n')}` : 'no console errors');
await browser.close();
