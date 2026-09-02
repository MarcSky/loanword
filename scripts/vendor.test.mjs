import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { ENTRIES, MANIFEST, TARGET, imports, tree } from './vendor.mjs';

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));

test('the import scanner sees static and dynamic relative imports and ignores bare ones', () => {
  const source = 'import{a}from"./x.js";import "../y.js";import("./z.js");import lit from "lit";';
  assert.deepEqual(imports(source), ['./x.js', '../y.js', './z.js']);
});

test('the manifest lists exactly the vendored files', () => {
  assert.deepEqual(tree(), manifest, 'run npm run vendor');
});

test('every entry component is vendored', () => {
  for (const entry of ENTRIES) assert.ok(manifest.includes(entry), `${entry} is missing`);
});

test('every import inside the vendored tree resolves inside it', () => {
  for (const file of manifest) {
    const source = readFileSync(join(TARGET, file), 'utf8');
    for (const spec of imports(source)) {
      const target = relative(TARGET, resolve(dirname(join(TARGET, file)), spec));
      assert.ok(existsSync(join(TARGET, target)), `${file} imports ${spec}, which is not vendored`);
    }
    assert.ok(!/from\s*["']https?:|import\s*\(\s*["']https?:/.test(source), `${file} imports from the network`);
    const bare = [...source.matchAll(/(?:from\s*|import\s*\(?\s*)["']([^"'.\/][^"']*)["']/g)].map((match) => match[1]);
    assert.deepEqual(bare, [], `${file} imports a bare specifier the browser cannot resolve`);
  }
});

test('the licence travels with the code', () => {
  assert.ok(existsSync(join(TARGET, 'LICENSE.md')));
});
