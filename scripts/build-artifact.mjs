#!/usr/bin/env node
/**
 * Builds the game as one self-contained HTML file.
 *
 * An Artifact is served under a strict CSP with no external requests allowed,
 * so everything — script, styles, fonts — has to be inlined. That is the
 * opposite of what the normal build wants (Three.js is most of the bundle and
 * only the match needs it, so the menus do not wait for it), which is why this
 * is its own build rather than a flag on that one.
 *
 * Two files come out of it, because they are opened in different ways:
 *
 *   game.html            body content only, for an Artifact — the platform
 *                        supplies the doctype, head and charset, and serves it
 *                        over HTTP.
 *   game-standalone.html a complete document, for opening from disk. It
 *                        declares its own charset: with no HTTP header a
 *                        browser reads a page as Latin-1, and every accented
 *                        name comes out as mojibake — "MARIMÃ³N" for "Marimón".
 *
 *   node scripts/build-artifact.mjs [outFile]
 */
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { join } from 'node:path';

const out = process.argv[2] ?? 'dist-artifact/game.html';
const work = 'dist-artifact/build';

await rm('dist-artifact', { recursive: true, force: true });

await build({
  configFile: false,
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  build: {
    outDir: work,
    target: 'es2022',
    sourcemap: false,
    // One chunk: a dynamic import cannot be inlined as a script tag, and the
    // match screen is loaded through React.lazy.
    rolldownOptions: { output: { inlineDynamicImports: true } },
  },
});

const assets = await readdir(join(work, 'assets'));
const read = async (name) => readFile(join(work, 'assets', name), 'utf8');

let css = '';
for (const name of assets.filter((f) => f.endsWith('.css')).sort()) css += await read(name);

let js = '';
for (const name of assets.filter((f) => f.endsWith('.js'))) js += await read(name);

// Fonts are referenced as /fonts/x.woff2, which the CSP will not fetch.
const fonts = await readdir('public/fonts');
let inlined = 0;
for (const file of fonts) {
  const data = await readFile(join('public/fonts', file));
  const uri = `data:font/woff2;base64,${data.toString('base64')}`;
  const before = css;
  css = css.split(`/fonts/${file}`).join(uri);
  if (css !== before) inlined += 1;
}

const remaining = [...css.matchAll(/url\((['"]?)(?!data:)([^)'"]+)\1\)/g)].map((m) => m[2]);
if (remaining.length > 0) {
  throw new Error(`CSS still points outside the page: ${[...new Set(remaining)].join(', ')}`);
}

const shell = `<style>
  html, body { margin: 0; height: 100%; background: #000; }
  #root { height: 100%; }
</style>
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`;

const html = `<title>Boot Room FC</title>\n${shell}`;

const standalone = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<title>Boot Room FC</title>
</head>
<body>
${shell}</body>
</html>
`;

const standaloneOut = out.replace(/\.html$/, '-standalone.html');
await writeFile(out, html);
await writeFile(standaloneOut, standalone);
await rm(work, { recursive: true, force: true });

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(`fonts inlined: ${inlined}/${fonts.length}`);
console.log(`css ${kb(css.length)}  js ${kb(js.length)}`);
console.log(`wrote ${out} (${kb(html.length)}) — for an Artifact`);
console.log(`wrote ${standaloneOut} (${kb(standalone.length)}) — opens from disk`);
