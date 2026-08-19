#!/usr/bin/env node
/**
 * Enforces PROMPT.md's first acceptance criterion: every colour the interface
 * paints resolves through src/ui/tokens/theme.css. A literal anywhere else
 * means the design system has a hole in it.
 *
 * Precision matters more than reach here — a linter that cries wolf gets
 * switched off. So:
 *   - In CSS, any colour literal is a violation.
 *   - In TS/TSX, only colour literals *inside string values* count. A call to
 *     our own `hsl(h, s, l)` helper is code, not a hard-coded colour.
 *   - Tests are exempt: asserting on a specific colour is the point of them.
 *
 * Escape hatch, used sparingly and always with a reason:
 *   / * token-exempt: why * /   (CSS)
 *   // token-exempt: why        (TS/TSX)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');

const norm = (p) => p.split(sep).join('/');
const TOKENS_FILE = 'src/ui/tokens/theme.css';
const GENERATED = new Set(['src/ui/tokens/fonts.css']);

/** Hex, rgb()/rgba(), hsl()/hsla() — the CSS forms. */
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const FUNC = /\b(?:rgba?|hsla?)\s*\(/;
const NAMED =
  /(?:^|[\s:,(])(?:white|black|red|blue|green|yellow|orange|purple|grey|gray|silver|gold)(?:[\s;,)]|$)/i;

/** String literals in TS/TSX: '...', "...", `...`. */
const STRINGS = /'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)"|`([^`\\]*(?:\\.[^`\\]*)*)`/g;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(css|ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const violations = [];

for (const file of walk(SRC)) {
  const rel = norm(relative(ROOT, file));
  if (rel === TOKENS_FILE || GENERATED.has(rel)) continue;
  if (rel.includes('__tests__') || /\.test\.tsx?$/.test(rel)) continue;

  const isCss = rel.endsWith('.css');
  const lines = readFileSync(file, 'utf8').split('\n');

  lines.forEach((line, i) => {
    if (/token-exempt:/.test(line)) return;
    if (i > 0 && /token-exempt:/.test(lines[i - 1] ?? '')) return;

    const report = (kind, text) =>
      violations.push({ rel, line: i + 1, kind, text, src: line.trim() });

    if (isCss) {
      const hex = HEX.exec(line);
      if (hex) report('hex colour', hex[0]);
      const fn = FUNC.exec(line);
      if (fn) report('colour function', fn[0]);
      // Only property values, not selectors or comments.
      if (/:\s*[^;]*$/.test(line) && !line.trimStart().startsWith('/*')) {
        const named = NAMED.exec(line);
        if (named) report('named colour', named[0].trim());
      }
      return;
    }

    // TS/TSX: a colour only counts when it is baked into a string.
    STRINGS.lastIndex = 0;
    let match;
    while ((match = STRINGS.exec(line)) !== null) {
      const value = match[1] ?? match[2] ?? match[3] ?? '';
      const hex = HEX.exec(value);
      if (hex) report('hex colour in string', hex[0]);
      const fn = FUNC.exec(value);
      if (fn) report('colour function in string', fn[0]);
    }
  });
}

if (violations.length === 0) {
  console.log('token lint: clean — every painted colour resolves through theme.css');
  process.exit(0);
}

console.error(
  `token lint: ${violations.length} literal colour${violations.length === 1 ? '' : 's'} outside theme.css\n`,
);
for (const v of violations) {
  console.error(`  ${v.rel}:${v.line}  ${v.kind} "${v.text}"`);
  console.error(`    ${v.src.slice(0, 110)}`);
}
console.error('\nMove the value into src/ui/tokens/theme.css and reference it as a custom property,');
console.error('or add a `token-exempt: <reason>` comment if it genuinely is not a theme colour.');
process.exit(1);
