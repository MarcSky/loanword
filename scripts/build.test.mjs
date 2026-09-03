import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA = mkdtempSync(join(tmpdir(), 'loanword-build-'));
process.env.CLAUDE_PLUGIN_DATA = DATA;
process.env.LOANWORD_NO_BUILD = '1';

const {
  BATCH_RECORDS,
  brief,
  buildBeforeServing,
  buildInBackground,
  runDetached,
  cardsSoFar,
  chunk,
  heldBy,
  jsonArray,
  progressIn,
  locked,
  parseCards,
  promptFor,
  modelFor,
  readProgress,
  replyText,
  running,
  STREAM_ARGS,
  unknownFlag,
} = await import('./build.mjs');
const { lockFile, paths, progressFile, writeJson } = await import('./store.mjs');

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
  writeFileSync(paths.lock, String(process.pid));
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

test('one place decides whether a background run may spawn at all', () => {
  assert.equal(runDetached(import.meta.url), false, 'the build and the filing run share this switch');
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

  writeFileSync(joinPath(DATA, 'build.ka.lock'), String(process.pid));
  assert.equal(queueSizes().find((row) => row.target === 'ka').building, true);
  assert.equal(queueSizes().find((row) => row.target === 'en').building, false, 'one lock is not the other');
  rmSync(joinPath(DATA, 'build.ka.lock'), { force: true });
});

test('a locked language stands down instead of building twice', async () => {
  writeFileSync(joinPath(DATA, 'build.en.lock'), String(process.pid));
  const result = await buildOne('en', {});
  assert.match(result.skipped, /already running/);
  assert.equal(readJsonl(queueFile('en')).length, 1, 'and the queue is left for the build that holds the lock');
  rmSync(joinPath(DATA, 'build.en.lock'), { force: true });
});

test.after(() => {
  db.close();
  rmSync(DATA, { recursive: true, force: true });
});

test('the build says how far it has got while the cards are still being written', () => {
  assert.equal(cardsSoFar(''), 0);
  assert.equal(cardsSoFar('[{"fro'), 0, 'half a key is not a card');
  assert.equal(cardsSoFar('[{"front":"roll back","back":"откатить"},{ "front" : "ship it"'), 2, 'a card counts the moment its front arrives');

  const target = 'is';
  writeJson(progressFile(target), { target, total: 59, done: 12, startedAt: '2026-09-03T10:00:00.000Z' });
  const seen = readProgress(target);
  assert.equal(seen.total, 59);
  assert.equal(seen.done, 12);
  rmSync(progressFile(target), { force: true });
  assert.equal(readProgress(target), null, 'a finished build leaves nothing behind to report');
});

test('the reply is read back from a stream, and from plain output when there is no stream', () => {
  const stream = [
    '{"type":"system","subtype":"init"}',
    'a hook printed this, and it is not JSON',
    '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"text":"[{\\"front\\":\\"roll back\\","}}}',
    '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"text":"\\"back\\":\\"откатить\\"}]"}}}',
    '{"type":"result","subtype":"success","result":"the deltas win over this"}',
  ].join('\n');
  assert.equal(replyText(stream), '[{"front":"roll back","back":"откатить"}]');
  assert.deepEqual(parseCards(replyText(stream)), [{ front: 'roll back', back: 'откатить' }]);

  assert.equal(replyText('{"type":"result","subtype":"success","result":"[{\\"front\\":\\"a\\"}]"}'), '[{"front":"a"}]');
  assert.equal(
    replyText('{"type":"assistant","message":{"content":[{"type":"text","text":"[{}]"}]}}'),
    '[{}]',
    'the finished message answers when nothing streamed',
  );
  assert.equal(replyText('[{"front":"plain"}]'), '[{"front":"plain"}]', 'plain output passes straight through');
});

test('an older command line falls back to a build without progress', () => {
  assert.equal(unknownFlag({ stderr: 'error: unknown option --include-partial-messages' }), true);
  assert.equal(unknownFlag({ stderr: 'rate limited' }), false);
  assert.equal(unknownFlag({}), false);
  assert.ok(STREAM_ARGS.includes('stream-json'));
});

test('a lock whose process is gone is not a build in progress', () => {
  const target = 'lv';
  writeFileSync(lockFile(target), String(process.pid));
  writeJson(progressFile(target), { target, total: 10, done: 3, batch: 1, batches: 1, startedAt: 'now' });
  assert.equal(locked(target), true, 'our own process is alive, so the lock stands');

  writeFileSync(lockFile(target), '999999');
  assert.equal(locked(target), false, 'a dead pid means the build died with it');
  assert.equal(readProgress(target), null, 'and the progress it left behind is cleared');

  writeFileSync(lockFile(target), 'not a pid');
  assert.equal(locked(target), false);
  assert.equal(running(process.pid), true);
  assert.equal(running(999999), false);
});

test('the model that writes the cards comes from the settings, with a fallback', () => {
  assert.equal(modelFor({}), 'haiku');
  assert.equal(modelFor({ model: 'sonnet' }), 'sonnet');
  assert.equal(modelFor({ model: 'opus' }), 'opus');
  assert.equal(modelFor({ model: 'gpt-4' }), 'haiku', 'a name we do not offer never reaches the command line');
});

test('the batch tells the lexicographer which categories this learner studies', () => {
  const prompt = promptFor([{ text: 'x' }], { native: 'ru', target: 'es', categories: ['marketing', 'seo'] });
  assert.match(prompt, /CATEGORIES = phrasing, connectors, everyday, marketing, seo/);
  assert.doesNotMatch(prompt.split('## This batch')[1], /engineering/, 'a category not chosen is not offered');

  const bare = promptFor([{ text: 'x' }], { native: 'ru', target: 'es' });
  assert.match(bare, /CATEGORIES = engineering, process, collaboration, phrasing, connectors, everyday/);
  assert.match(brief(), /`everyday` — general vocabulary/, 'the three that never change stay in the brief');
});

test('a lock is held by a living process, whatever wrote it', () => {
  const plain = joinPath(DATA, 'plain.lock');
  const structured = joinPath(DATA, 'structured.lock');
  const progress = joinPath(DATA, 'held.progress');

  writeFileSync(plain, String(process.pid));
  assert.equal(heldBy(plain), true, 'a build writes its pid as text');

  writeJson(structured, { pid: process.pid });
  assert.equal(heldBy(structured), true, 'the filing pass writes it as JSON');

  writeJson(progress, { total: 5, done: 1 });
  writeFileSync(structured, JSON.stringify({ pid: 999999 }));
  assert.equal(heldBy(structured, progress), false, 'a dead pid releases the lock');
  assert.equal(progressIn(progress), null, 'and takes its progress with it');
  assert.equal(progressIn(joinPath(DATA, 'nothing.json')), null);

  rmSync(plain, { force: true });
  assert.equal(heldBy(plain), false, 'no lock, no build');
});
