import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MANIFEST, PACKAGE, SNOWBALL_REPO, SNOWBALL_TAG, manifest, sourceFor, wanted } from './stem-vendor.mjs';
import { ALGORITHMS, VENDOR } from './stem.mjs';

test('the generator is pinned to one Snowball release', () => {
  assert.match(SNOWBALL_TAG, /^v\d+\.\d+\.\d+$/);
  assert.equal(SNOWBALL_REPO, 'https://github.com/snowballstem/snowball.git');
  assert.equal(MANIFEST, join(VENDOR, 'FILES.json'));
  assert.equal(PACKAGE, join(VENDOR, 'package.json'));
});

test('every language in the map names a Snowball algorithm file', () => {
  assert.deepEqual(wanted(), Object.keys(ALGORITHMS).sort());
  assert.equal(sourceFor('en'), 'algorithms/english.sbl');
  assert.equal(sourceFor('no'), 'algorithms/norwegian.sbl');
  assert.equal(sourceFor('hy'), 'algorithms/armenian.sbl');
});

test('the manifest lists the generated modules and nothing else', () => {
  assert.deepEqual(manifest(['b.js', 'COPYING', 'a.js', 'package.json']), ['a.js', 'b.js']);
  assert.deepEqual(JSON.parse(readFileSync(MANIFEST, 'utf8')), manifest(JSON.parse(readFileSync(MANIFEST, 'utf8'))));
});

test('the vendored code is what Snowball generated, untouched', () => {
  const english = readFileSync(join(VENDOR, 'en.js'), 'utf8');
  assert.match(english, /Generated from english\.sbl by Snowball/);
  assert.match(english, /require\('\.\/base-stemmer\.js'\)/, 'the CommonJS shape is why package.json says commonjs');
  assert.match(readFileSync(join(VENDOR, 'COPYING'), 'utf8'), /Redistribution and use in source and binary forms/);
});
