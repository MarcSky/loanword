import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA = mkdtempSync(join(tmpdir(), 'loanword-build-'));
process.env.CLAUDE_PLUGIN_DATA = DATA;
process.env.LOANWORD_NO_BUILD = '1';

const { BATCH_RECORDS, brief, buildBeforeServing, buildInBackground, chunk, locked, parseCards, promptFor } =
  await import('./build.mjs');
const { paths } = await import('./store.mjs');

test('the queue is split into batches, with the remainder kept', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 2), []);
  assert.equal(chunk(Array.from({ length: 339 }, (_, i) => i), BATCH_RECORDS).length, 6);
  assert.equal(
    chunk(Array.from({ length: 339 }, (_, i) => i), BATCH_RECORDS).flat().length,
    339,
    'no record is dropped between batches',
  );
});

test('the brief comes from the agent definition, without its frontmatter', () => {
  const text = brief();
  assert.doesNotMatch(text, /^---/, 'the YAML header is not part of the instructions');
  assert.match(text, /lexicographer/i);
  assert.match(text, /category/, 'the six domains still reach the builder');
});

test('the prompt carries the batch and the language pair', () => {
  const records = [{ source: 'prompt', text: 'откатить миграцию' }];
  const prompt = promptFor(records, { native: 'ru', target: 'en', level: '' });
  assert.match(prompt, /NATIVE = ru/);
  assert.match(prompt, /TARGET = en/);
  assert.match(prompt, /LIMIT = 1/, 'the cap is the batch, never the daily study limit');
  assert.match(prompt, /откатить миграцию/);
});

test('a reply is read whether or not it arrives in a markdown fence', () => {
  const cards = [{ front: 'a', back: 'b' }];
  assert.deepEqual(parseCards(JSON.stringify(cards)), cards);
  assert.deepEqual(parseCards('```json\n' + JSON.stringify(cards) + '\n```'), cards);
  assert.deepEqual(parseCards('Here you go:\n```\n' + JSON.stringify(cards) + '\n```\nHope that helps!'), cards);
  assert.deepEqual(parseCards('[]'), []);
});

test('an unreadable reply raises rather than committing nonsense', () => {
  assert.throws(() => parseCards('I could not do that.'), /no JSON array/);
  assert.throws(() => parseCards(''), /no JSON array/);
  assert.throws(() => parseCards('[{"front": broken}]'), SyntaxError);
});

test('a second build stands down while one is running', () => {
  writeFileSync(paths.lock, '1234');
  assert.equal(locked(), true);
  rmSync(paths.lock);
  assert.equal(locked(), false, 'and the lock is gone once it is released');
});

test('a lock left behind by a dead process does not block builds forever', () => {
  writeFileSync(paths.lock, '1234');
  const hourAgo = Date.now() / 1000 - 3600;
  utimesSync(paths.lock, hourAgo, hourAgo);
  assert.equal(locked(), false, 'a stale lock is cleared, not obeyed');
});

test('nothing captured means nothing to build', () => {
  writeFileSync(paths.queue, '');
  assert.equal(buildInBackground(), false);
});

test('only an empty deck is worth making the user wait for', () => {
  assert.equal(buildBeforeServing(0, 340, {}), true, 'a first run builds before it serves');
  assert.equal(buildBeforeServing(20, 340, {}), false, 'an existing deck opens now and fills in behind');
  assert.equal(buildBeforeServing(0, 0, {}), false, 'nothing captured, nothing to wait for');
  assert.equal(buildBeforeServing(0, 340, { LOANWORD_NO_BUILD: '1' }), false, 'tests never spend a model');
});



const { build, buildOne, locked: lockedFor, queueSizes } = await import('./build.mjs');
const { appendJsonl, config, queueFile, readJsonl, saveSettings } = await import('./store.mjs');
const { chmodSync, mkdirSync } = await import('node:fs');
const { join: joinPath } = await import('node:path');
const db = await import('./db.mjs');

const BIN = joinPath(DATA, 'bin');
mkdirSync(BIN, { recursive: true });

const fakeClaude = (script) => {
  const path = joinPath(BIN, 'claude');
  writeFileSync(path, script);
  chmodSync(path, 0o755);
  process.env.PATH = `${BIN}:${process.env.PATH}`;
};

const record = (text) => ({ ts: '2026-09-01T00:00:00Z', project: '~/work/api', source: 'prompt', text });

test('a build fills every active language at once, and clears each queue after its own commit', async () => {
  saveSettings({ native: 'ru', target: 'en', targets: ['en', 'ka'] });
  writeFileSync(queueFile('en'), '');
  writeFileSync(queueFile('ka'), '');
  appendJsonl(queueFile('en'), [record('откатить миграцию')]);
  appendJsonl(queueFile('ka'), [record('откатить миграцию')]);

  fakeClaude(`#!/bin/sh
prompt=$(cat)
case "$prompt" in
  *"TARGET = ka"*) printf '[{"type":"phrase","front":"მიგრაციის დაბრუნება","back":"откатить миграцию","reading":"migraciis dabruneba","cefr":"B1","category":"engineering"}]' ;;
  *) printf '[{"type":"phrase","front":"roll back the migration","back":"откатить миграцию","cefr":"B1","category":"engineering"}]' ;;
esac
`);

  const result = await build({});
  assert.deepEqual(result.failures, []);
  assert.equal(result.runs.length, 2);
  assert.equal(result.added, 2, 'one card in each language');
  assert.equal(readJsonl(queueFile('en')).length, 0);
  assert.equal(readJsonl(queueFile('ka')).length, 0);

  const cfg = config();
  const english = db.cardsOfDeck(db.deckId(cfg.native, 'en'));
  const georgian = db.cardsOfDeck(db.deckId(cfg.native, 'ka'));
  assert.equal(english.length, 1);
  assert.equal(georgian.length, 1);
  assert.equal(georgian[0].reading, 'migraciis dabruneba', 'the romanisation survives the commit');
  assert.equal(english[0].reading, '', 'and a Latin target is left without one');
});

test('a language whose build fails keeps its queue while the other one is committed', async () => {
  writeFileSync(queueFile('en'), '');
  writeFileSync(queueFile('ka'), '');
  appendJsonl(queueFile('en'), [record('нужно перестроить индекс')]);
  appendJsonl(queueFile('ka'), [record('нужно перестроить индекс')]);

  fakeClaude(`#!/bin/sh
prompt=$(cat)
case "$prompt" in
  *"TARGET = ka"*) echo "the lexicographer fell over" >&2; exit 3 ;;
  *) printf '[{"type":"phrase","front":"rebuild the index","back":"нужно перестроить индекс","cefr":"B1","category":"engineering"}]' ;;
esac
`);

  const result = await build({});
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].target, 'ka');
  assert.equal(readJsonl(queueFile('ka')).length, 1, 'nothing captured in Georgian was lost');
  assert.equal(readJsonl(queueFile('en')).length, 0, 'and English still went through');
  assert.equal(lockedFor('ka'), false, 'the lock is released even when the build fell over');
});

test('two commits for two languages in one process both land', async () => {
  const cfg = config();
  assert.ok(db.countCards(db.deckId(cfg.native, 'en')) >= 2);
  assert.ok(db.countCards(db.deckId(cfg.native, 'ka')) >= 1);
  assert.notEqual(db.deckId(cfg.native, 'en'), db.deckId(cfg.native, 'ka'));
});

test('one language can be built on its own', async () => {
  writeFileSync(queueFile('en'), '');
  writeFileSync(queueFile('ka'), '');
  appendJsonl(queueFile('ka'), [record('давай выкатим под флагом')]);
  appendJsonl(queueFile('en'), [record('давай выкатим под флагом')]);

  fakeClaude(`#!/bin/sh
cat > /dev/null
printf '[{"type":"phrase","front":"ფლაგით გაშვება","back":"давай выкатим под флагом","cefr":"B2","category":"engineering"}]'
`);

  const result = await build({ target: 'ka' });
  assert.equal(result.runs.length, 1);
  assert.equal(result.runs[0].target, 'ka');
  assert.equal(readJsonl(queueFile('ka')).length, 0);
  assert.equal(readJsonl(queueFile('en')).length, 1, 'the language nobody asked for is untouched');
});

test('the build status reports what is queued and what is running, per language', () => {
  const sizes = queueSizes();
  assert.deepEqual(sizes.map((row) => row.target).sort(), ['en', 'ka']);
  const english = sizes.find((row) => row.target === 'en');
  assert.equal(english.queued, 1);
  assert.equal(english.building, false);

  writeFileSync(joinPath(DATA, 'build.ka.lock'), '999');
  assert.equal(queueSizes().find((row) => row.target === 'ka').building, true);
  assert.equal(queueSizes().find((row) => row.target === 'en').building, false, 'one lock is not the other');
  rmSync(joinPath(DATA, 'build.ka.lock'), { force: true });
});

test('a locked language stands down instead of building twice', async () => {
  writeFileSync(joinPath(DATA, 'build.en.lock'), '999');
  const result = await buildOne('en', {});
  assert.match(result.skipped, /already running/);
  assert.equal(readJsonl(queueFile('en')).length, 1, 'and the queue is left for the build that holds the lock');
  rmSync(joinPath(DATA, 'build.en.lock'), { force: true });
});

test.after(() => {
  db.close();
  rmSync(DATA, { recursive: true, force: true });
});
