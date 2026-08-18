#!/usr/bin/env node
/**
 * Screenshots a running dev server. Used for eyeballing the build against the
 * aesthetic spec and as the basis for screenshot regression.
 *
 *   node scripts/shot.mjs <out.png> [url] [selector-to-wait-for]
 */
import { chromium } from 'playwright';
const out = process.argv[2] ?? '/tmp/shot.png';
const url = process.argv[3] ?? 'http://localhost:5173/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(1600);
await page.screenshot({ path: out });
console.log(errors.length ? 'CONSOLE ERRORS:\n' + errors.join('\n') : 'no console errors');
await browser.close();
