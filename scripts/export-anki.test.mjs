import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA = mkdtempSync(join(tmpdir(), 'loanword-export-'));
process.env.CLAUDE_PLUGIN_DATA = DATA;

const { toCsv, writeCsv } = await import('./export-anki.mjs');
const { paths } = await import('./store-paths.mjs');

const CFG = { native: 'ru', target: 'en' };

const card = (overrides = {}) => ({
  front: 'roll back',
  back: 'откатить',
  reading: '',
  example: 'We roll back the migration tonight.',
  cefr: 'B1',
  category: 'engineering',
  type: 'phrase',
  project: '~/work/api',
  ...overrides,
});

const lines = (csv) => csv.split('\n').filter(Boolean);

test('the header names every column, in the order Anki is told to map', () => {
  assert.equal(lines(toCsv([], CFG))[0], 'front;back;reading;example;tags');
});

test('a card becomes one row with its romanisation in place', () => {
  const [, row] = lines(toCsv([card({ reading: 'rol bek' })], CFG));
  assert.equal(row.split(';')[0], 'roll back');
  assert.equal(row.split(';')[1], 'откатить');
  assert.equal(row.split(';')[2], 'rol bek');
  assert.equal(lines(toCsv([card(), card({ front: 'ship it' })], CFG)).length, 3, 'a header and two cards');
});

test('a card with no reading leaves the column empty rather than shifting it', () => {
  const [, row] = lines(toCsv([card()], CFG));
  assert.equal(row.split(';').length >= 5, true);
  assert.equal(row.split(';')[2], '', 'the empty reading holds its place');
});

test('a separator, a quote or a newline inside a field never breaks the row', () => {
  const csv = toCsv([card({ front: 'a; b', back: 'he said "no"', example: 'first\nsecond' })], CFG);
  assert.equal(lines(csv).length, 2, 'a newline inside a field does not start a new row');
  assert.ok(csv.includes('"a; b"'), 'a field holding the separator is quoted');
  assert.ok(csv.includes('""no""'), 'and a quote is doubled, the way CSV asks');
  assert.ok(csv.includes('first second'), 'the newline becomes a space');
});

test('the tags say which deck, level and domain a card came from', () => {
  const [, row] = lines(toCsv([card()], CFG));
  const tags = row.split(';').pop();
  assert.ok(tags.startsWith('loanword '));
  assert.ok(tags.includes('lang:en'));
  assert.ok(tags.includes('cefr:B1'));
  assert.ok(tags.includes('cat:engineering'));
  assert.ok(tags.includes('type:phrase'));
  assert.ok(tags.includes('project:api'), 'the last path segment, not the whole path');
});

test('a card carrying its own pair is tagged with that, not with the open deck', () => {
  const [, row] = lines(toCsv([card({ native: 'es', target: 'ka' })], CFG));
  const tags = row.split(';').pop();
  assert.ok(tags.includes('lang:ka') && tags.includes('from:es'));
});

test('a card missing everything optional still exports', () => {
  const csv = toCsv([{ front: 'bare', back: 'голый' }], CFG);
  assert.equal(lines(csv).length, 2);
  assert.ok(!csv.includes('undefined'), 'nothing leaks the word undefined');
  assert.ok(!csv.includes('cefr:'), 'and an absent level is simply not a tag');
});

test('a project name with spaces stays one tag', () => {
  const [, row] = lines(toCsv([card({ project: '~/work/my big api' })], CFG));
  assert.ok(row.includes('project:my_big_api'));
});

test('writeCsv puts the file where the trainer says it lives', () => {
  const csv = toCsv([card()], CFG);
  const file = writeCsv(csv);
  assert.equal(file, paths.exportCsv);
  assert.equal(readFileSync(file, 'utf8'), csv);
});

test.after(() => {
  rmSync(DATA, { recursive: true, force: true });
});
