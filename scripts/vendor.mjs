#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { PLUGIN_ROOT } from './store-paths.mjs';

const SOURCE = join(PLUGIN_ROOT, 'node_modules', '@awesome.me', 'webawesome');
const DIST = join(SOURCE, 'dist-cdn');
export const TARGET = join(PLUGIN_ROOT, 'ui', 'vendor', 'webawesome');
export const MANIFEST = join(TARGET, 'FILES.json');

export const ENTRIES = [
  'components/drawer/drawer.js',
  'components/tooltip/tooltip.js',
  'components/select/select.js',
  'components/option/option.js',
];

const IMPORT = /(?:from\s*|import\s*\(?\s*)["']([^"']+)["']/g;

export function imports(source) {
  return [...source.matchAll(IMPORT)].map((match) => match[1]).filter((spec) => spec.startsWith('.'));
}

function graph(root = DIST, entries = ENTRIES) {
  const seen = new Set();
  const queue = [...entries];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(join(root, file), 'utf8');
    for (const spec of imports(source)) {
      const next = relative(root, resolve(dirname(join(root, file)), spec));
      queue.push(next);
    }
  }
  return [...seen].sort();
}

export function tree(dir = TARGET, base = dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) tree(path, base, out);
    else if (name.endsWith('.js')) out.push(relative(base, path));
  }
  return out.sort();
}

export function vendor() {
  const files = graph();
  rmSync(TARGET, { recursive: true, force: true });
  for (const file of files) {
    mkdirSync(dirname(join(TARGET, file)), { recursive: true });
    copyFileSync(join(DIST, file), join(TARGET, file));
  }
  copyFileSync(join(SOURCE, 'LICENSE.md'), join(TARGET, 'LICENSE.md'));
  writeFileSync(MANIFEST, `${JSON.stringify(files, null, 2)}\n`);
  return files;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`${vendor().length} files → ui/vendor/webawesome`);
}
