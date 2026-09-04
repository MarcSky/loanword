#!/usr/bin/env node

import { readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DATA, paths } from './store-paths.mjs';

export const KEEP_BACKUPS = 3;

const size = (path) => {
  try {
    const info = statSync(path);
    if (!info.isDirectory()) return info.size;
    return readdirSync(path).reduce((sum, name) => sum + size(join(path, name)), 0);
  } catch {
    return 0;
  }
};

const list = (dir) => {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
};

export function leftovers(data = DATA) {
  const found = [];

  for (const name of list(data)) {
    if (/\.migrated$/.test(name) || /\.migrated-/.test(name) || /\.moving\.\d+$/.test(name)) {
      found.push({ path: join(data, name), why: 'migrated leftover' });
    }
  }

  const backups = list(paths.backups).sort();
  for (const name of backups.slice(0, Math.max(0, backups.length - KEEP_BACKUPS))) {
    found.push({ path: join(paths.backups, name), why: 'old backup' });
  }

  if (size(paths.logRotated)) found.push({ path: paths.logRotated, why: 'rotated log' });
  if (size(paths.tuning)) found.push({ path: paths.tuning, why: 'what the builder learned about this runner' });

  return found.map((entry) => ({ ...entry, bytes: size(entry.path) }));
}

export function tidy({ remove = false, data = DATA } = {}) {
  const found = leftovers(data);
  if (remove) for (const entry of found) rmSync(entry.path, { recursive: true, force: true });
  return {
    removed: remove,
    count: found.length,
    bytes: found.reduce((sum, entry) => sum + entry.bytes, 0),
    entries: found,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = tidy({ remove: process.argv.includes('--remove') });
  console.log(JSON.stringify(result, null, 2));
  if (!result.removed && result.count) console.log('\nNothing was removed. Run again with --remove.');
}
