import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, utimesSync } from 'node:fs';
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
  roleOf,
  effortFor,
  running,
  STREAM_ARGS,
  ARGS,
  costOf,
  dedupe,
  repairPrompt,
  triage,
} = await import('./build.mjs');
const { lockFile, paths, progressFile, writeJson } = await import('./store.mjs');

test('the queue is split into batches, with the remainder kept', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 2), []);
  assert.equal(chunk(Array.from({ length: 339 }, (_, i) => i), BATCH_RECORDS).length, 17);
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
  assert.match(text, /\bn\b/, 'every card names the record it came from');
  assert.match(text, /verbatim/);
  assert.match(text, /equivalent/);
  assert.match(text, /## Repair/);
  assert.match(text, /## Lexicographer/);
  assert.match(text, /"form"/, 'the card carries the form the learner met');
  assert.match(text, /"context"/, 'and the clause it was met in');
  assert.match(text, /"ipa"/);
  assert.match(text, /WINDOW/, 'and aims at the band the learner is in');
  assert.match(text, /loanword/i);
  assert.match(text, /zadeployit/, 'a target word in native letters is named as a candidate');
});

test('a role gets the shared sections and its own, never another role\'s', () => {
  const lexicographer = brief('lexicographer');
  assert.match(lexicographer, /## Lexicographer/);
  assert.match(lexicographer, /## Fields/);
  assert.match(lexicographer, /## Read it back/);
  assert.match(lexicographer, /## Repair/);
  assert.doesNotMatch(lexicographer, /## Cloner/);
  assert.doesNotMatch(lexicographer, /## Rewriter/);
  assert.doesNotMatch(lexicographer, /## Alphabet/);
  assert.doesNotMatch(lexicographer, /## Picker/);
  assert.match(brief('cloner'), /## Cloner/);
  assert.doesNotMatch(brief('cloner'), /## Lexicographer/);
  assert.match(brief('alphabet'), /## Alphabet/);
  assert.match(brief('picker'), /## Picker/);
  assert.doesNotMatch(brief('picker'), /## Lexicographer/, 'a tapped word does not pay for the whole segmenting brief');
  assert.match(brief('picker'), /## Fields/);
  assert.equal(brief('nonsense'), brief(), 'an unknown role gets everything');
  assert.deepEqual(
    [roleOf({ source: 'prompt' }), roleOf({ source: 'session' }), roleOf({ source: 'clone' }), roleOf({ source: 'rewrite' }), roleOf({ source: 'alphabet' }), roleOf({ source: 'pick' }), roleOf({})],
    ['lexicographer', 'lexicographer', 'cloner', 'rewriter', 'alphabet', 'picker', 'lexicographer'],
  );
});

test('the prompt carries the batch and the language pair', () => {
  const records = [{ source: 'prompt', text: 'откатить миграцию' }];
  const prompt = promptFor(records, { native: 'ru', target: 'en', level: '' });
  assert.match(prompt, /NATIVE = ru/);
  assert.match(prompt, /TARGET = en/);
  assert.match(prompt, /LIMIT = 3/, 'a prompt record earns up to three picks, never one per record');
  assert.match(prompt, /откатить миграцию/);
  assert.match(prompt, /"n":0/, 'every record is numbered so the card can point back at it');
  assert.match(prompt, /^## This batch/, 'the brief is the system prompt, not part of the batch');
  assert.doesNotMatch(prompt, /You are a lexicographer/);
  assert.match(prompt, /TOPICS = \(none yet\)/);
  assert.match(prompt, /^LEVEL = \(no floor\)$/m, 'no floor and no estimate is what B1 used to mean');
  assert.match(prompt, /^WINDOW = B1-B2$/m, 'the window is the band the learner is in and the one above');
  assert.match(prompt, /^IPA = no$/m, 'the model writes a transcription only when eSpeak cannot');

  const levelled = promptFor(records, { native: 'ru', target: 'en', levelLine: 'C1', window: ['C1', 'C2'], ipa: true });
  assert.match(levelled, /^LEVEL = C1$/m);
  assert.match(levelled, /^WINDOW = C1-C2$/m);
  assert.match(levelled, /^IPA = yes$/m);

  const session = promptFor([{ source: 'session', words: Array.from({ length: 40 }, (_, i) => `w${i}`) }], { native: 'ru', target: 'en' });
  assert.match(session, /LIMIT = 40/, 'one session record with forty words is forty chances');

  const long = 'Первое предложение про откат миграции, которое тянется довольно долго и заканчивается точкой. '.repeat(8);
  const trimmed = promptFor([{ n: 4, source: 'prompt', text: long }], { native: 'ru', target: 'en' });
  const line = JSON.parse(trimmed.split('\n').at(-1));
  assert.equal(line.n, 4, 'the number given wins over the position');
  assert.ok(line.text.length <= 400, `a record is cut to 400 characters, got ${line.text.length}`);
  assert.match(line.text, /\.$/, 'and the cut lands on a sentence boundary');

  const topics = promptFor([{ text: 'x' }], {
    native: 'ru',
    target: 'en',
    topics: [{ category: 'engineering', topic: 'code review', n: 4 }, { category: 'engineering', topic: 'deploys', n: 2 }],
  });
  assert.match(topics, /TOPICS =\n  engineering: code review, deploys/);
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



const { build, buildOne, dropQueued, locked: lockedFor, queuePreview, queueSizes } = await import('./build.mjs');
const { forgetTuning } = await import('./tune.mjs');
const { appendJsonl, config, knownWords, queueFile, readJsonl, saveSettings } = await import('./store.mjs');
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
  forgetTuning();
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

test('an older command line falls back to a build without progress', async () => {
  const { unknownFlag } = await import('./tune.mjs');
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
  assert.equal(modelFor({}), 'sonnet');
  assert.equal(modelFor({ model: 'haiku' }), 'haiku');
  assert.equal(modelFor({ model: 'opus' }), 'opus');
  assert.equal(modelFor({ model: 'gpt-4' }), 'sonnet', 'a name we do not offer never reaches the command line');
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

const usageFile = paths.usage;

test('a reply is costed from the result event, and plain output costs nothing', () => {
  const stream = [
    '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"text":"[]"}}}',
    '{"type":"result","subtype":"success","result":"[]","total_cost_usd":0.0123,"duration_ms":4000,"usage":{"input_tokens":273,"cache_read_input_tokens":10,"cache_creation_input_tokens":5,"output_tokens":200,"output_tokens_details":{"thinking_tokens":170}}}',
  ].join('\n');
  assert.deepEqual(costOf(stream), { input: 273, cacheRead: 10, cacheWrite: 5, output: 200, thinking: 170, cost: 0.0123, ms: 4000 });
  assert.deepEqual(costOf('[{"front":"plain"}]'), { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, thinking: 0, cost: 0, ms: 0 });
  assert.ok(ARGS.lean.includes('--tools') && ARGS.lean.includes('--no-session-persistence'));
});

test('repeated prompts are sent once, and the copies are consumed with the original', () => {
  const rows = [
    { source: 'prompt', text: 'Roll it back' },
    { source: 'session', words: ['stale'] },
    { source: 'prompt', text: 'roll  it BACK' },
    { source: 'prompt', text: 'ship it' },
  ];
  const { unique, twins, skipped } = dedupe(rows);
  assert.equal(skipped, 1);
  assert.deepEqual(unique.map((row) => row.text ?? 'session'), ['Roll it back', 'session', 'ship it']);
  assert.deepEqual(twins.get(rows[0]), [rows[2]]);
});

test('the gate sorts a reply into kept, repair and rejected', () => {
  const pair = { native: 'en', target: 'ka' };
  const records = [{ n: 0, source: 'prompt', text: 'Review all logic, remove duplicate or unnecessary code.' }];
  const out = triage(
    [
      { n: 0, front: 'დუბლირებული კოდი', back: 'code that appears in more than one place' },
      { n: 0, front: 'გადამოწმება', back: 'verification', example: 'გადამოწმება საჭიროა.' },
      { n: 0, front: 'კოდი [x]', back: 'code' },
      { n: 0, front: 'კოდი', back: 'code', example: 'ეს არის მაგალითი.' },
      null,
    ],
    records,
    pair,
  );
  assert.equal(out.kept.length, 1);
  assert.equal(out.needsRepair.length, 2);
  assert.match(out.needsRepair[0].reasons[0], /definition/);
  assert.equal(out.needsRepair[1].soft, true, 'an example without the front only asks for a repair, it does not sink the card');
  assert.equal(out.rejected.length, 1);
  assert.equal(out.rejected[0].reason, 'a bracketed front');

  const prompt = repairPrompt(out.needsRepair, pair);
  assert.match(prompt, /^## Repair/);
  assert.match(prompt, /"n":0/);
  assert.match(prompt, /"reasons":\["a back that reads like a definition/);
  assert.match(prompt, /"record":"Review all logic/);
  assert.doesNotMatch(prompt, /"native"/, 'the pair is stated once, not on every card');
});

test('the lexicographer is run as a bare completion, with the brief as the system prompt', async () => {
  saveSettings({ native: 'ru', target: 'en', targets: ['en', 'ka'] });
  writeFileSync(queueFile('en'), '');
  writeFileSync(queueFile('ka'), '');
  appendJsonl(queueFile('en'), [record('откатить индекс')]);
  rmSync(joinPath(DATA, 'argv.txt'), { force: true });
  fakeClaude(`#!/bin/sh
printf '%s\\n' "$@" > "${DATA}/argv.txt"
cat > "${DATA}/stdin.txt"
printf '[{"n":0,"type":"phrase","front":"roll back the index","back":"откатить индекс","example":"We roll back the index tonight.","cefr":"B1","category":"engineering"}]'
`);
  const result = await build({ target: 'en' });
  assert.deepEqual(result.failures, []);
  assert.equal(result.added, 1);
  const argv = readFileSync(joinPath(DATA, 'argv.txt'), 'utf8').split('\n');
  for (const flag of ['--tools', '--system-prompt', '--setting-sources', '--no-session-persistence', '--strict-mcp-config', '--max-turns']) {
    assert.ok(argv.includes(flag), `${flag} is on the command line`);
  }
  assert.equal(argv[argv.indexOf('--max-turns') + 1], '1');
  assert.equal(argv[argv.indexOf('--model') + 1], 'sonnet', 'sonnet writes the cards by default');
  assert.equal(argv[argv.indexOf('--effort') + 1], 'medium', 'the brief is precise, so the model need not deliberate at length');
  assert.equal(effortFor('filer'), 'low', 'filing is classification, not composition');
  assert.equal(effortFor('alphabet'), 'low');
  const stdin = readFileSync(joinPath(DATA, 'stdin.txt'), 'utf8');
  assert.ok(stdin.startsWith('## This batch'), 'stdin carries the batch only');
  assert.doesNotMatch(stdin, /You are a lexicographer/, 'the brief travels as the system prompt');
  const system = readFileSync(joinPath(DATA, 'argv.txt'), 'utf8');
  assert.match(system, /## Lexicographer/);
  assert.doesNotMatch(system, /## Cloner/, 'a prompt batch gets the lexicographer role only');
});

test('an older command line that rejects the lean flags falls back to the old shape', async () => {
  writeFileSync(queueFile('en'), '');
  appendJsonl(queueFile('en'), [record('вынести это в отдельный сервис')]);
  rmSync(joinPath(DATA, 'argv-all.txt'), { force: true });
  fakeClaude(`#!/bin/sh
printf '%s\\n' "$@" >> "${DATA}/argv-all.txt"
printf -- '----\\n' >> "${DATA}/argv-all.txt"
cat > /dev/null
case " $* " in *" --tools "*) echo "error: unknown option '--tools'" >&2; exit 1 ;; esac
printf '[{"n":0,"type":"phrase","front":"split out a service","back":"вынести сервис","example":"We split out a service for billing.","cefr":"B1","category":"engineering"}]'
`);
  const result = await build({ target: 'en' });
  assert.deepEqual(result.failures, []);
  assert.equal(result.added, 1);
  const calls = readFileSync(joinPath(DATA, 'argv-all.txt'), 'utf8').split('----\n').filter((part) => part.trim());
  assert.equal(calls.length, 2, 'one refusal, one answer');
  assert.match(calls[0], /--tools/);
  assert.doesNotMatch(calls[1], /--tools/, 'the second try drops the lean flags');
  assert.match(calls[1], /stream-json/, 'but still streams');
});

test('every call is accounted for', async () => {
  writeFileSync(queueFile('en'), '');
  appendJsonl(queueFile('en'), [record('выкатить под флагом')]);
  rmSync(usageFile, { force: true });
  fakeClaude(`#!/bin/sh
cat > /dev/null
cat <<'JSON'
{"type":"stream_event","event":{"type":"content_block_delta","delta":{"text":"[{\\"n\\":0,\\"type\\":\\"phrase\\",\\"front\\":\\"behind a flag\\",\\"back\\":\\"выкатить под флагом\\",\\"example\\":\\"We ship it behind a flag first.\\",\\"cefr\\":\\"B2\\",\\"category\\":\\"engineering\\"}]"}}}
{"type":"result","subtype":"success","result":"[]","total_cost_usd":0.0123,"duration_ms":4000,"usage":{"input_tokens":273,"cache_read_input_tokens":0,"cache_creation_input_tokens":0,"output_tokens":200,"output_tokens_details":{"thinking_tokens":170}}}
JSON
`);
  const result = await build({ target: 'en' });
  assert.deepEqual(result.failures, []);
  assert.equal(result.added, 1);
  const lines = readJsonl(usageFile);
  assert.equal(lines.length, 1, 'a clean batch is one call, one line');
  const [line] = lines;
  assert.equal(line.kind, 'lexicographer');
  assert.equal(line.model, 'sonnet');
  assert.equal(line.target, 'en');
  assert.equal(line.records, 1);
  assert.equal(line.cards, 1);
  assert.equal(line.input, 273);
  assert.equal(line.output, 200);
  assert.equal(line.thinking, 170);
  assert.equal(line.cost, 0.0123);
  assert.equal(line.effort, 'medium', 'the line says how hard the model was asked to think');
  assert.ok(line.ts);
});

const georgianQueue = () => {
  saveSettings({ native: 'en', target: 'ka' });
  writeFileSync(queueFile('ka'), '');
  appendJsonl(queueFile('ka'), [record('Review all logic, remove duplicate or unnecessary code.')]);
  rmSync(joinPath(DATA, 'calls.txt'), { force: true });
};

const calls = () => (readFileSync(joinPath(DATA, 'calls.txt'), 'utf8').match(/call/g) || []).length;

const BROKEN = '[{"n":0,"type":"phrase","front":"დუბლირებული კოდი","back":"code that appears in more than one place","keywords":["review"],"example":"კოდის მიმოხილვისას ეკიპაჟმა იპოვა დუბლირებული კოდი.","cefr":"B2","category":"engineering"}]';
const FIXED = '[{"n":0,"type":"phrase","front":"დუბლირებული კოდი","back":"duplicated code","keywords":["მიმოხილვა"],"example":"კოდის მიმოხილვისას ეკიპაჟმა იპოვა დუბლირებული კოდი.","cefr":"B2","category":"engineering"}]';

test('a broken card goes back once for repair and comes back fixed', async () => {
  georgianQueue();
  fakeClaude(`#!/bin/sh
prompt=$(cat)
echo call >> "${DATA}/calls.txt"
case "$prompt" in
  *"## Repair"*) printf '%s' '${FIXED}' ;;
  *) printf '%s' '${BROKEN}' ;;
esac
`);
  const result = await build({ target: 'ka' });
  assert.deepEqual(result.failures, []);
  assert.equal(result.added, 1);
  assert.equal(result.repaired, 1);
  assert.equal(calls(), 2, 'one build call, one repair call');
  const [card] = db.cardsOfDeck(db.deckId('en', 'ka')).filter((row) => row.front === 'დუბლირებული კოდი');
  assert.equal(card.back, 'duplicated code');
  assert.deepEqual(card.keywords, ['მიმოხილვა'], "keywords in the learner's language never reach the deck");
  assert.match(card.source, /Review all logic/, 'provenance points at the record by number');
  assert.match(readFileSync(paths.log, 'utf8'), /repaired 1 of 1/);
});

test('a card the repair cannot fix is dropped, not committed', async () => {
  georgianQueue();
  fakeClaude(`#!/bin/sh
cat > /dev/null
echo call >> "${DATA}/calls.txt"
printf '%s' '${BROKEN}'
`);
  const before = db.countCards(db.deckId('en', 'ka'));
  const result = await build({ target: 'ka' });
  assert.deepEqual(result.failures, []);
  assert.equal(result.added, 0);
  assert.ok(result.rejected >= 1);
  assert.equal(calls(), 2);
  assert.equal(db.countCards(db.deckId('en', 'ka')), before, 'a definition never reaches the deck');
  assert.equal(readJsonl(queueFile('ka')).length, 0, 'the record was read and is not sent a third time');
  assert.match(readFileSync(paths.log, 'utf8'), /build dropped a back that reads like a definition/);
});

test('a clean batch never triggers a repair call', async () => {
  georgianQueue();
  fakeClaude(`#!/bin/sh
cat > /dev/null
echo call >> "${DATA}/calls.txt"
printf '%s' '${FIXED}'
`);
  const result = await build({ target: 'ka' });
  assert.deepEqual(result.failures, []);
  assert.equal(calls(), 1);
  assert.equal(result.repaired, 0);
});

test('records are routed to roles, each with its own system prompt', async () => {
  saveSettings({ native: 'ru', target: 'en' });
  writeFileSync(queueFile('en'), '');
  appendJsonl(queueFile('en'), [
    record('роль лексикографа'),
    { ts: '2026-09-01T00:00:01Z', source: 'clone', lang: 'ru', text: 'привет', phrase: 'hola', phrase_lang: 'es', origin: 'abcdef0001' },
    { ts: '2026-09-01T00:00:02Z', source: 'rewrite', lang: 'ru', text: 'откатить', wrong: 'roll', origin: 'abcdef0002' },
    { ts: '2026-09-01T00:00:03Z', source: 'alphabet', letters: ['a', 'b'] },
  ]);
  rmSync(joinPath(DATA, 'roles.txt'), { force: true });
  fakeClaude(`#!/bin/sh
cat > /dev/null
for arg in "$@"; do
  case "$arg" in
    *"## Lexicographer"*) echo lexicographer >> "${DATA}/roles.txt" ;;
    *"## Cloner"*) echo cloner >> "${DATA}/roles.txt" ;;
    *"## Rewriter"*) echo rewriter >> "${DATA}/roles.txt" ;;
    *"## Alphabet"*) echo alphabet >> "${DATA}/roles.txt" ;;
  esac
done
printf '[]'
`);
  const result = await build({ target: 'en' });
  assert.deepEqual(result.failures, []);
  assert.equal(result.batches, 4, 'four kinds of record, four batches');
  const roles = readFileSync(joinPath(DATA, 'roles.txt'), 'utf8').split('\n').filter(Boolean).sort();
  assert.deepEqual(roles, ['alphabet', 'cloner', 'lexicographer', 'rewriter'], 'each role heading was seen exactly once');
  assert.equal(readJsonl(queueFile('en')).length, 0, 'an empty answer still consumes the records it read');
});

test('batches run a few at a time, never all at once', async () => {
  writeFileSync(queueFile('en'), '');
  appendJsonl(queueFile('en'), Array.from({ length: 61 }, (_, i) => record(`запрос номер ${i}`)));
  rmSync(joinPath(DATA, 'active'), { force: true });
  rmSync(joinPath(DATA, 'max'), { force: true });
  rmSync(joinPath(DATA, 'calls.txt'), { force: true });
  fakeClaude(`#!/bin/sh
cat > /dev/null
echo call >> "${DATA}/calls.txt"
n=$(cat "${DATA}/active" 2>/dev/null || echo 0); n=$((n+1)); echo $n > "${DATA}/active"
m=$(cat "${DATA}/max" 2>/dev/null || echo 0); [ $n -gt $m ] && echo $n > "${DATA}/max"
sleep 0.3
n=$(cat "${DATA}/active"); echo $((n-1)) > "${DATA}/active"
printf '[]'
`);
  const result = await build({ target: 'en' });
  assert.deepEqual(result.failures, []);
  assert.equal(result.batches, 4);
  assert.equal(calls(), 4);
  assert.ok(Number(readFileSync(joinPath(DATA, 'max'), 'utf8')) <= 3, 'the pool caps how many lexicographers run together');
  assert.equal(result.queueCleared, 61);
  assert.equal(readJsonl(queueFile('en')).length, 0);
});

test('a batch that fails leaves exactly its records, and the other batch is committed', async () => {
  writeFileSync(queueFile('en'), '');
  appendJsonl(queueFile('en'), [
    ...Array.from({ length: 20 }, (_, i) => record(`первая партия ${i}`)),
    record('вторая партия падает'),
  ]);
  fakeClaude(`#!/bin/sh
prompt=$(cat)
case "$prompt" in
  *"вторая партия падает"*) echo "the lexicographer fell over" >&2; exit 3 ;;
  *) printf '[{"n":0,"type":"phrase","front":"stale index","back":"устаревший индекс","example":"A stale index slows every query.","cefr":"B1","category":"engineering"}]' ;;
esac
`);
  const result = await build({ target: 'en' });
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0].error, /batch 2 of 2/);
  assert.equal(result.added, 1, 'the batch that answered is in the deck');
  const left = readJsonl(queueFile('en'));
  assert.equal(left.length, 1);
  assert.equal(left[0].text, 'вторая партия падает');
  assert.equal(lockedFor('en'), false);
});

test('the preview lists what every language is about to spend a model call on', () => {
  writeFileSync(queueFile('en'), '');
  writeFileSync(queueFile('ka'), '');
  const shared = record('давай откатим миграцию');
  const heard = { ts: '2026-09-02T00:00:00Z', project: '~/work/api', source: 'session', lang: 'en', words: ['rollback', 'staging'] };
  appendJsonl(queueFile('en'), [shared, shared, heard]);
  appendJsonl(queueFile('ka'), [shared]);

  const preview = queuePreview();
  const english = preview.find((row) => row.target === 'en');
  assert.equal(english.rows.length, 2, 'the same prompt twice is one row, as the build would dedupe it');
  assert.equal(english.queued, 2);
  assert.equal(english.rows[0].text, 'давай откатим миграцию');
  assert.equal(english.rows[0].project, '~/work/api');
  assert.equal(english.rows[1].text, 'rollback, staging', 'a heard word list reads as one line');
  assert.equal(preview.find((row) => row.target === 'ka').rows.length, 1);
});

test('dropping one record clears it from every language, and its words go to the stop-list', () => {
  const [prompt, heard] = queuePreview().find((row) => row.target === 'en').rows;

  assert.deepEqual(dropQueued(prompt.key), { dropped: 3, stopped: 0 }, 'one click takes both copies and both queues');
  assert.equal(readJsonl(queueFile('ka')).length, 0, 'the Georgian copy went with it');

  assert.deepEqual(dropQueued([heard.key]), { dropped: 1, stopped: 2 });
  assert.equal(readJsonl(queueFile('en')).length, 0);
  assert.ok(knownWords('en').has('rollback'), 'a word thrown away is never captured again');
  assert.ok(knownWords('en').has('staging'));

  assert.deepEqual(dropQueued([]), { dropped: 0, stopped: 0 }, 'nothing asked for, nothing written');
  assert.deepEqual(dropQueued(['not a key']), { dropped: 0, stopped: 0 });
});

test('every call carries a ceiling, and the lean flags collapse into --bare where the CLI has it', async () => {
  const { ARGS: SHAPE_ARGS, MAX_CALL_USD, firstShape, forgetHelp, supportsFlag } = await import('./build.mjs');
  assert.ok(SHAPE_ARGS.lean.includes('--max-budget-usd'));
  assert.equal(SHAPE_ARGS.lean[SHAPE_ARGS.lean.indexOf('--max-budget-usd') + 1], String(MAX_CALL_USD));
  assert.ok(SHAPE_ARGS.bare.includes('--max-budget-usd'), 'the ceiling is on every shape of the call');
  assert.ok(SHAPE_ARGS.bare.includes('--bare'));
  assert.ok(!SHAPE_ARGS.bare.includes('--mcp-config'), '--bare is what those three flags were for');

  const { rememberTuning } = await import('./tune.mjs');
  rmSync(paths.tuning, { force: true });
  fakeClaude('#!/bin/sh\ncat > /dev/null\necho "  --tools <names>   restrict the tools"\n');
  forgetHelp();
  assert.equal(supportsFlag('--bare'), false);
  assert.equal(firstShape(), 'lean', 'an older command line starts at the long shape');

  fakeClaude('#!/bin/sh\ncat > /dev/null\necho "  --bare   minimal mode"\n');
  forgetHelp();
  assert.equal(supportsFlag('--bare'), true);
  assert.equal(firstShape(), 'lean', 'a bare call reads no login, so a subscription never starts there');

  const key = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  assert.equal(firstShape(), 'bare', 'with a key in the environment the short call is the cheap one');

  rememberTuning({ shape: 'plain' });
  assert.equal(firstShape(), 'plain', 'and what worked last time wins over the probe');
  if (key === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = key;
  rmSync(paths.tuning, { force: true });
  forgetHelp();
});

test('a shape that cannot carry the login is never remembered into the next build', async () => {
  const { apiKeyed, firstShape, forgetHelp, shapeUsable } = await import('./build.mjs');
  const { rememberTuning } = await import('./tune.mjs');
  const key = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;

  assert.equal(apiKeyed({}), false);
  assert.equal(apiKeyed({ ANTHROPIC_API_KEY: 'sk-test' }), true);
  assert.equal(apiKeyed({ ANTHROPIC_AUTH_TOKEN: 'token' }), true, 'a gateway token is a key too');
  assert.equal(shapeUsable('bare', {}), false);
  assert.equal(shapeUsable('lean', {}), true, 'every other shape carries whatever login the runner has');

  fakeClaude('#!/bin/sh\ncat > /dev/null\necho "  --bare   minimal mode"\n');
  forgetHelp();
  rememberTuning({ shape: 'bare' });
  assert.equal(firstShape(), 'lean', 'a remembered bare is dropped when there is no key to go with it');

  rmSync(paths.tuning, { force: true });
  if (key !== undefined) process.env.ANTHROPIC_API_KEY = key;
  forgetHelp();
});

test('the pronunciation is written on this machine when eSpeak is here, and asked for when it is not', async () => {
  const { fillIpa } = await import('./build.mjs');
  const speech = await import('./speech.mjs');
  const before = process.env.PATH;

  process.env.PATH = joinPath(DATA, 'nothing');
  speech.forgetProviders();
  const untouched = await fillIpa([{ front: 'roll back', ipa: '' }], 'en', { phonetics: 'auto' });
  assert.equal(untouched[0].ipa, '', 'no eSpeak, nothing local to write it');

  writeFileSync(joinPath(BIN, 'espeak-ng'), '#!/bin/sh\ncat > /dev/null\nprintf " ˈɹoʊl bæk\\n"\n');
  chmodSync(joinPath(BIN, 'espeak-ng'), 0o755);
  process.env.PATH = `${BIN}:${process.env.PATH}`;
  speech.forgetProviders();
  const filled = await fillIpa([{ front: 'roll back', ipa: '' }, { front: 'deadline', ipa: 'ˈdɛdlaɪn' }], 'en', {
    phonetics: 'auto',
  });
  assert.equal(filled[0].ipa, 'ˈɹoʊl bæk');
  assert.equal(filled[1].ipa, 'ˈdɛdlaɪn', 'a transcription the model already wrote is not asked for twice');

  const off = await fillIpa([{ front: 'roll back', ipa: '' }], 'en', { phonetics: 'off' });
  assert.equal(off[0].ipa, '', 'phonetics off spends nothing, local or otherwise');

  process.env.PATH = before;
  speech.forgetProviders();
});

test('a link or an address in a record left over from before is cleaned on the way out', async () => {
  const { queuePreview } = await import('./build.mjs');
  writeFileSync(queueFile('en'), '');
  appendJsonl(queueFile('en'), [
    {
      ts: '2026-09-04T12:00:00Z',
      project: '~/work/api',
      source: 'prompt',
      text: 'mira https://mlaccessible.medium.com/stemming-37d429da33ec y escribe a alguien@example.com',
    },
    { ts: '2026-09-04T13:00:00Z', source: 'session', lang: 'en', words: ['rollback', 'www.example.com'] },
  ]);

  const rows = queuePreview().find((row) => row.target === 'en').rows;
  for (const row of rows) {
    assert.doesNotMatch(row.text, /medium\.com|example\.com|https?:/, `the preview shows ${row.text}`);
    assert.match(row.text, /▮/, 'and says something was taken out');
  }

  const prompt = promptFor(readJsonl(queueFile('en')), { native: 'ru', target: 'en' });
  assert.doesNotMatch(prompt, /medium\.com|example\.com|https?:/, 'and the model is never sent the link either');
  writeFileSync(queueFile('en'), '');
});

test('a build that fell over says why, and the next one clears the mark', async () => {
  const { forgetFailure, queueSizes: sizes, readFailure } = await import('./build.mjs');
  writeFileSync(queueFile('en'), '');
  appendJsonl(queueFile('en'), [record('вынести это в отдельный сервис')]);
  forgetFailure('en');

  fakeClaude(`#!/bin/sh
cat > /dev/null
echo "Credit balance is too low" >&2
exit 1
`);
  await assert.rejects(() => buildOne('en', {}));

  const failure = readFailure('en');
  assert.ok(failure, 'the reason outlives the process that hit it');
  assert.match(failure.reason, /Credit balance is too low/);
  assert.equal(failure.records, 1);
  assert.ok(failure.ts);

  const row = sizes().find((entry) => entry.target === 'en');
  assert.match(row.failed, /Credit balance is too low/, 'and the trainer serves it beside the queue');
  assert.equal(row.queued, 1, 'the records are still there to try again');

  fakeClaude(`#!/bin/sh
cat > /dev/null
printf '[{"n":0,"type":"phrase","front":"split out a service","back":"вынести сервис","example":"We split out a service for billing.","cefr":"B1","category":"engineering"}]'
`);
  await buildOne('en', {});
  assert.equal(readFailure('en'), null, 'a build that works forgets the last one that did not');
  assert.equal(sizes().find((entry) => entry.target === 'en').failed, '');
});

test('a call that costs more than the ceiling is halved rather than abandoned', async () => {
  const { forgetTuning, readTuning } = await import('./tune.mjs');
  writeFileSync(queueFile('en'), '');
  appendJsonl(queueFile('en'), Array.from({ length: 4 }, (_, i) => record(`слишком дорогая запись ${i}`)));
  forgetTuning();
  rmSync(joinPath(DATA, 'sizes.txt'), { force: true });

  fakeClaude(`#!/bin/sh
prompt=$(cat)
n=$(printf '%s' "$prompt" | grep -c '"source":"prompt"')
echo "$n" >> "${DATA}/sizes.txt"
if [ "$n" -gt 2 ]; then
  printf '{"type":"result","is_error":true,"subtype":"error_max_budget_usd","errors":["Reached maximum budget ($3)"]}\\n'
  exit 1
fi
printf '[{"n":0,"type":"phrase","front":"too dear a call","back":"слишком дорого","example":"That was too dear a call to make twice.","cefr":"B1","category":"process"}]'
`);

  const result = await build({ target: 'en' });
  assert.deepEqual(result.failures, [], 'the halves went through, so the batch did not fail');
  assert.ok(result.added >= 1);
  const sizes = readFileSync(joinPath(DATA, 'sizes.txt'), 'utf8').split('\n').filter(Boolean).map(Number);
  assert.equal(sizes[0], 4, 'the first call carried the whole batch');
  assert.ok(sizes.slice(1).every((size) => size <= 2), 'and the retry carried halves');
  assert.equal(readTuning().records, 2, 'the smaller batch is remembered for next time');
  forgetTuning();
});

test('a silent refusal walks down the ladder instead of stopping the build', async () => {
  const { forgetTuning, readTuning } = await import('./tune.mjs');
  writeFileSync(queueFile('en'), '');
  appendJsonl(queueFile('en'), [record('тихий отказ командной строки')]);
  forgetTuning();
  rmSync(joinPath(DATA, 'shapes.txt'), { force: true });

  fakeClaude(`#!/bin/sh
case " $* " in
  *" --system-prompt "*) echo refused >> "${DATA}/shapes.txt"; cat > /dev/null; exit 1 ;;
esac
echo accepted >> "${DATA}/shapes.txt"
cat > /dev/null
printf '[{"n":0,"type":"phrase","front":"walk it down","back":"спуститься по лестнице","example":"We walk it down one rung at a time.","cefr":"B2","category":"process"}]'
`);

  const result = await build({ target: 'en' });
  assert.deepEqual(result.failures, [], 'a command line the runner refuses is not a build that failed');
  assert.equal(result.added, 1);
  const shapes = readFileSync(joinPath(DATA, 'shapes.txt'), 'utf8').split('\n').filter(Boolean);
  assert.equal(shapes.at(-1), 'accepted');
  assert.ok(shapes.length >= 2, 'it took at least one refused shape to get there');
  assert.ok(['stream', 'plain'].includes(readTuning().shape), 'and the shape that works is remembered');
  forgetTuning();
});

test('the reason a call stopped is read from the stream, where the runner writes it', async () => {
  const { failureOf } = await import('./build.mjs');
  const line = (fields) => JSON.stringify({ type: 'result', is_error: true, ...fields });

  assert.deepEqual(failureOf(line({ subtype: 'error_max_budget_usd', errors: ['Reached maximum budget ($3)'] })), {
    reason: 'Reached maximum budget ($3)',
    subtype: 'error_max_budget_usd',
  });
  assert.equal(failureOf(line({ subtype: 'error', result: 'Not logged in · Please run /login' })).reason, 'Not logged in · Please run /login');
  assert.equal(failureOf(line({ subtype: 'error_during_execution' })).reason, 'error_during_execution');
  assert.deepEqual(failureOf('{"type":"result","is_error":false,"result":"[]"}'), { reason: '', subtype: '' });
  assert.deepEqual(failureOf('not json at all'), { reason: '', subtype: '' });
});

test('a cause the learner has to fix stops the build and says what to do', async () => {
  const { forgetTuning, readTuning } = await import('./tune.mjs');
  const { readFailure } = await import('./build.mjs');
  writeFileSync(queueFile('en'), '');
  appendJsonl(queueFile('en'), [record('запись для вышедшего из аккаунта')]);
  forgetTuning();
  rmSync(joinPath(DATA, 'calls.txt'), { force: true });

  fakeClaude(`#!/bin/sh
cat > /dev/null
echo call >> "${DATA}/calls.txt"
printf '{"type":"result","is_error":true,"subtype":"error","result":"Not logged in · Please run /login"}\\n'
exit 1
`);

  await assert.rejects(() => buildOne('en', {}));
  assert.equal(calls(), 1, 'a runner that is signed out is not asked three more times');
  const failure = readFailure('en');
  assert.match(failure.reason, /Not logged in/);
  assert.equal(failure.hint, 'login', 'and the interface is told which line to show');
  assert.equal(readTuning().shape, '', 'nothing about the command line was to blame, so nothing is remembered');
  forgetTuning();
});

test('every shape the tuner can name is one the runner knows how to build', async () => {
  const { ARGS } = await import('./build.mjs');
  const { SHAPES } = await import('./tune.mjs');
  assert.deepEqual(Object.keys(ARGS).sort(), ['bare', 'lean'], 'only the two shapes that carry flags');
  for (const shape of SHAPES) {
    assert.ok(['bare', 'lean', 'stream', 'plain'].includes(shape), `${shape} has no call to build`);
  }
});
