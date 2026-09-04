import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALGORITHMS, STEM, VENDOR, prefix, stem, stemKey, stemmerFor, wordsOf } from './stem.mjs';
import { isKnownLanguage } from './languages.mjs';

test('every vendored stemmer is a language the trainer knows', () => {
  const strays = Object.keys(ALGORITHMS).filter((code) => !isKnownLanguage(code));
  assert.deepEqual(strays, [], 'a stemmer for a language nobody can choose is dead weight');
});

test('the manifest on disk is the set of files beside it', () => {
  const files = JSON.parse(readFileSync(join(VENDOR, 'FILES.json'), 'utf8'));
  assert.ok(files.includes('base-stemmer.js'));
  for (const code of Object.keys(ALGORITHMS)) {
    assert.ok(files.includes(`${code}.js`), `${code} is in the map but not vendored — run npm run stem`);
    assert.ok(existsSync(join(VENDOR, `${code}.js`)));
  }
  assert.equal(files.length, Object.keys(ALGORITHMS).length + 1);
  const pkg = JSON.parse(readFileSync(join(VENDOR, 'package.json'), 'utf8'));
  assert.equal(pkg.type, 'commonjs', 'the generated files are CommonJS and load without a transform');
  assert.ok(existsSync(join(VENDOR, 'COPYING')), 'the Snowball licence travels with the code');
});

test('an inflection stems to its lemma and a derivation does not', () => {
  assert.equal(stem('program', 'en'), 'program');
  assert.equal(stem('programs', 'en'), 'program');
  assert.equal(stem('programming', 'en'), 'program');
  assert.notEqual(stem('programmer', 'en'), stem('program', 'en'), 'a person is not the thing');
  assert.notEqual(stem('progress', 'en'), stem('program', 'en'), 'a four-letter prefix could not tell these apart');
  assert.equal(stem('code', 'en'), stem('codes', 'en'));
  assert.equal(stem('duplicate', 'en'), stem('duplicated', 'en'));
  assert.notEqual(stem('duplicate', 'en'), stem('duplex', 'en'));
});

test('the stemmer follows the language, not the alphabet', () => {
  assert.equal(stem('программы', 'ru'), stem('программа', 'ru'));
  assert.equal(stem('программу', 'ru'), stem('программа', 'ru'));
  assert.notEqual(stem('программист', 'ru'), stem('программа', 'ru'));
  assert.equal(stem('duplizierter', 'de'), 'dupliziert');
  assert.notEqual(stem('doppelter', 'de'), stem('duplizierter', 'de'));
});

test('a language with no Snowball algorithm falls back to the first four letters', () => {
  assert.equal(stemmerFor('ka'), null);
  assert.equal(stem('romelic', 'ka'), 'rome');
  assert.equal(stem('ab', 'ka'), 'ab', 'a short word is its own stem');
  assert.equal(stem('anything', ''), prefix('anything'));
  assert.equal(prefix('anything').length, STEM);
  assert.equal(stem('', 'en'), '');
  assert.equal(stem(null, 'en'), '');
});

test('a key is the stems of a phrase in order, and words are split on anything but letters', () => {
  assert.equal(stemKey('duplicate code', 'en'), stemKey('duplicated codes', 'en'));
  assert.notEqual(stemKey('duplicate code', 'en'), stemKey('duplicate', 'en'));
  assert.equal(stemKey('Hamburger-meniu', 'lt'), stemKey('hamburger meniu', 'lt'));
  assert.equal(stemKey('', 'en'), '');
  assert.deepEqual(wordsOf('«грубая» оценка!'), ['грубая', 'оценка']);
});

test('a stemmer is built once per process', () => {
  assert.equal(stemmerFor('en'), stemmerFor('en'));
  assert.equal(stemmerFor('ka'), null, 'and a language without one is remembered as none');
});
