#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PLUGIN_ROOT } from './store-paths.mjs';

export const CSS_FILE = join(PLUGIN_ROOT, 'ui', 'app.css');
export const TOKENS_FILE = join(process.env.LOANWORD_DOCS || join(PLUGIN_ROOT, '..', 'docs'), 'design', 'tokens.json');

const BLOCKS = [
  ['light', /^:root\s*\{$/],
  ['dark', /^:root\[data-theme='dark'\]\s*\{$/],
];

export function readTokens(css = readFileSync(CSS_FILE, 'utf8')) {
  const out = { light: {}, dark: {} };
  const lines = css.split('\n');
  let current = null;
  let pending = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (current && trimmed === '}' && !pending) {
      current = null;
      continue;
    }
    if (!current) {
      const block = BLOCKS.find(([, pattern]) => pattern.test(trimmed));
      if (block) current = block[0];
      continue;
    }
    pending = pending ? `${pending} ${trimmed}` : trimmed;
    if (!pending.endsWith(';')) continue;
    const match = pending.match(/^--([\w-]+)\s*:\s*(.+);$/);
    if (match) out[current][match[1]] = match[2].trim();
    pending = '';
  }
  return out;
}

export function build() {
  const tokens = readTokens();
  const payload = {
    name: 'Loanword',
    source: 'ui/app.css',
    generator: 'scripts/tokens.mjs',
    themes: tokens,
  };
  mkdirSync(dirname(TOKENS_FILE), { recursive: true });
  writeFileSync(TOKENS_FILE, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

export function stored() {
  try {
    return JSON.parse(readFileSync(TOKENS_FILE, 'utf8'));
  } catch {
    return null;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const payload = build();
  const counts = Object.entries(payload.themes).map(([theme, values]) => `${theme}: ${Object.keys(values).length}`);
  console.log(`${TOKENS_FILE}\n${counts.join('\n')}`);
}
