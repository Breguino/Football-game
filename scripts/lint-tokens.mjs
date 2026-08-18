#!/usr/bin/env node
/**
 * Enforces PROMPT.md's first acceptance criterion: every colour in the UI
 * resolves through src/ui/tokens/theme.css. A literal anywhere else means the
 * design system has a hole in it.
 *
 * Escape hatch, used sparingly and always with a reason:
 *   /* token-exempt: why *\/      (CSS)
 *   // token-exempt: why          (TS/TSX)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');
const TOKENS = join('src', 'ui', 'tokens', 'theme.css');

const PATTERNS = [
  [/#[0-9a-fA-F]{3,8}\b/g, 'hex colour'],
  [/\brgba?\s*\(/g, 'rgb()/rgba()'],
  [/\bhsla?\s*\(/g, 'hsl()/hsla()'],
];

/** Named CSS colours that slip past the patterns above. */
const NAMED = /(?:^|[\s:,(])(?:white|black|red|blue|green|yellow|orange|purple|grey|gray|silver|gold)(?:[\s;,)]|$)/i;

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
  const rel = relative(ROOT, file).split(sep).join('/');
  if (rel === TOKENS.split(sep).join('/')) continue;

  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (/token-exempt:/.test(line)) return;
    // Ignore the previous line's exemption applying to a block.
    if (i > 0 && /token-exempt:/.test(lines[i - 1] ?? '')) return;

    for (const [re, kind] of PATTERNS) {
      re.lastIndex = 0;
      const match = re.exec(line);
      if (match) violations.push({ rel, line: i + 1, kind, text: match[0], src: line.trim() });
    }
    if (rel.endsWith('.css') && NAMED.test(line) && /:\s*[^;]*$/.test(line)) {
      const named = line.match(NAMED);
      if (named) violations.push({ rel, line: i + 1, kind: 'named colour', text: named[0].trim(), src: line.trim() });
    }
  });
}

if (violations.length === 0) {
  console.log('token lint: clean — every colour resolves through theme.css');
  process.exit(0);
}

console.error(`token lint: ${violations.length} literal colour${violations.length === 1 ? '' : 's'} outside theme.css\n`);
for (const v of violations) {
  console.error(`  ${v.rel}:${v.line}  ${v.kind} "${v.text}"`);
  console.error(`    ${v.src.slice(0, 110)}`);
}
console.error('\nMove the value into src/ui/tokens/theme.css and reference it as a custom property,');
console.error('or add a `token-exempt: <reason>` comment if it genuinely is not a theme colour.');
process.exit(1);
