#!/usr/bin/env node
/** Captures the match screen after a few seconds of play. */
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
await page.waitForTimeout(2000);
await page.screenshot({ path: `${outDir}/match-kickoff.png` });
await page.waitForTimeout(9000);
await page.screenshot({ path: `${outDir}/match-live.png` });

console.log(errors.length ? `CONSOLE ERRORS:\n${errors.join('\n')}` : 'no console errors');
await browser.close();
