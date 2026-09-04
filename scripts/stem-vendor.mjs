#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT } from './store-paths.mjs';
import { ALGORITHMS, VENDOR } from './stem.mjs';

export const SNOWBALL_TAG = 'v3.0.1';
export const SNOWBALL_REPO = 'https://github.com/snowballstem/snowball.git';
export const MANIFEST = join(VENDOR, 'FILES.json');
export const PACKAGE = join(VENDOR, 'package.json');
const CHECKOUT = join(PLUGIN_ROOT, '.scratch', 'snowball');

export const wanted = (map = ALGORITHMS) => Object.keys(map).sort();

export const sourceFor = (code, map = ALGORITHMS) => `algorithms/${map[code]}.sbl`;

export const manifest = (files) => [...files].filter((name) => name.endsWith('.js')).sort();

function checkout(dir = CHECKOUT) {
  if (!existsSync(join(dir, 'snowball'))) {
    if (!existsSync(join(dir, 'GNUmakefile')) && !existsSync(join(dir, 'Makefile'))) {
      mkdirSync(dir, { recursive: true });
      execFileSync('git', ['clone', '--depth', '1', '--branch', SNOWBALL_TAG, SNOWBALL_REPO, dir], {
        stdio: 'inherit',
      });
    }
    execFileSync('make', ['snowball'], { cwd: dir, stdio: 'inherit' });
  }
  return dir;
}

function generate(dir = CHECKOUT, target = VENDOR, map = ALGORITHMS) {
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  copyFileSync(join(dir, 'javascript', 'base-stemmer.js'), join(target, 'base-stemmer.js'));
  copyFileSync(join(dir, 'COPYING'), join(target, 'COPYING'));
  for (const code of wanted(map)) {
    execFileSync(join(dir, 'snowball'), [join(dir, sourceFor(code, map)), '-js', '-o', join(target, code)], {
      stdio: 'inherit',
    });
  }
  writeFileSync(PACKAGE, `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`);
  const files = manifest(readdirSync(target));
  writeFileSync(MANIFEST, `${JSON.stringify(files, null, 2)}\n`);
  return files;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const given = (process.argv.find((arg) => arg.startsWith('--snowball=')) || '').split('=')[1];
  const dir = given || process.env.LOANWORD_SNOWBALL || checkout();
  const files = generate(dir);
  console.log(`${files.length} file(s) in ${VENDOR}`);
}
