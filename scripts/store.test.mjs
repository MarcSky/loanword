// Unit tests for the storage layer. Each test runs in its own data directory,
// set before store.mjs is imported, because the paths are resolved at import.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA = mkdtempSync(join(tmpdir(), 'loanword-store-'));
process.env.CLAUDE_PLUGIN_DATA = DATA;

const {
  appendJsonl,
  cardId,
  commit,
  config,
  fileSize,
  knownWords,
  loadCards,
  paths,
  readJson,
  readJsonl,
  tildify,
  writeJson,
  ymd,
} = await import('./store.mjs');

test('config falls back to sane defaults', () => {
  delete process.env.CLAUDE_PLUGIN_OPTION_NATIVE_LANG;
  delete process.env.CLAUDE_PLUGIN_OPTION_DAILY_LIMIT;
  const cfg = config();
  assert.equal(cfg.native, 'es');
  assert.equal(cfg.target, 'en');
  assert.equal(cfg.mode, 'both');
  assert.equal(cfg.dailyLimit, 15);
  assert.equal(cfg.autoBuild, true);
});

test('config rejects nonsense daily limits instead of trusting them', () => {
  for (const [value, expected] of [
    ['0', 15],
    ['-5', 15],
    ['abc', 15],
    ['', 15],
    ['7', 7],
    ['7.9', 7],
    ['99999', 500], // capped: this is a per-day review count, not a memory bomb
  ]) {
    process.env.CLAUDE_PLUGIN_OPTION_DAILY_LIMIT = value;
    assert.equal(config().dailyLimit, expected, `daily_limit=${value}`);
  }
  delete process.env.CLAUDE_PLUGIN_OPTION_DAILY_LIMIT;
});

test('readJsonl skips torn lines instead of failing the whole file', () => {
  const file = join(DATA, 'torn.jsonl');
  writeFileSync(file, '{"a":1}\nnot json at all\n\n{"b":2}\n"a bare string"\n[1,2]\n');
  assert.deepEqual(readJsonl(file), [{ a: 1 }, { b: 2 }, [1, 2]]);
});

test('readJsonl on a missing file is empty, not an error', () => {
  assert.deepEqual(readJsonl(join(DATA, 'nope.jsonl')), []);
  assert.equal(fileSize(join(DATA, 'nope.jsonl')), 0);
});

test('readJson returns the fallback for missing, corrupt and null files', () => {
  const file = join(DATA, 'broken.json');
  assert.deepEqual(readJson(join(DATA, 'missing.json'), { d: 1 }), { d: 1 });
  writeFileSync(file, '{not json');
  assert.deepEqual(readJson(file, { d: 1 }), { d: 1 });
  writeFileSync(file, 'null');
  assert.deepEqual(readJson(file, { d: 1 }), { d: 1 });
});

test('writeJson replaces the file atomically and leaves no temp behind', () => {
  const file = join(DATA, 'atomic.json');
  writeJson(file, { a: 1 });
  writeJson(file, { a: 2 });
  assert.deepEqual(readJson(file, null), { a: 2 });
  assert.equal(fileSize(`${file}.${process.pid}.tmp`), 0, 'temp file was renamed away');
});

test('appendJsonl on an empty batch touches nothing', () => {
  const file = join(DATA, 'empty.jsonl');
  appendJsonl(file, []);
  assert.equal(fileSize(file), 0);
});

test('cardId is stable, content-derived and collision-free across content', () => {
  const a = { front: 'revertir la migración', back: 'roll back the migration' };
  assert.equal(cardId(a), cardId({ ...a, example: 'irrelevant to identity' }));
  assert.notEqual(cardId(a), cardId({ ...a, back: 'revert the migration' }));
  assert.match(cardId(a), /^[0-9a-f]{10}$/);
});

test('tildify hides the username and leaves foreign paths alone', () => {
  assert.equal(tildify(join(homedir(), 'work', 'api')), '~/work/api');
  assert.equal(tildify('/opt/shared'), '/opt/shared');
  assert.equal(tildify(undefined), undefined);
});

test('ymd is a stable calendar key', () => {
  assert.equal(ymd(new Date('2026-08-17T23:59:59Z')), '2026-08-17');
  assert.match(ymd(), /^\d{4}-\d{2}-\d{2}$/);
});

test('loadCards drops malformed rows and de-duplicates by content', () => {
  writeFileSync(
    paths.cards,
    [
      JSON.stringify({ front: 'uno', back: 'one' }),
      JSON.stringify({ front: 'uno', back: 'one' }), // exact duplicate
      JSON.stringify({ front: '   ', back: 'blank front' }),
      JSON.stringify({ front: 'dos', back: 42 }),
      JSON.stringify({ back: 'no front' }),
      'garbage',
      JSON.stringify({ front: 'dos', back: 'two' }),
    ].join('\n') + '\n',
  );
  const cards = loadCards();
  assert.deepEqual(
    cards.map((c) => c.front),
    ['uno', 'dos'],
  );
  assert.ok(cards.every((c) => /^[0-9a-f]{10}$/.test(c.id)));
});

test('loadCards reuses its parse until the file changes', () => {
  const first = loadCards();
  assert.equal(loadCards(), first, 'same array reference while the file is untouched');
  appendJsonl(paths.cards, [{ front: 'tres', back: 'three' }]);
  const second = loadCards();
  assert.notEqual(second, first, 'a changed file invalidates the cache');
  assert.equal(second.length, 3);
});

test('knownWords tolerates a corrupt or wrongly-typed file', () => {
  writeFileSync(paths.known, '{"not":"an array"}');
  assert.equal(knownWords().size, 0);
  writeFileSync(paths.known, JSON.stringify(['Alpha', 'beta', 7, null]));
  assert.deepEqual([...knownWords()].sort(), ['alpha', 'beta']);
});

test('commit refuses anything that is not an array', () => {
  for (const bad of [null, undefined, 'cards', 42, { front: 'x' }]) {
    assert.throws(() => commit(bad), TypeError);
  }
});

test('commit drops invalid cards, stamps provenance and clears the queue', () => {
  writeFileSync(paths.cards, '');
  writeFileSync(paths.known, '[]');
  appendJsonl(paths.queue, [
    { ts: '2026-08-01T00:00:00Z', project: '~/work/api', source: 'prompt', text: 'revertir la migración' },
    { ts: '2026-08-02T00:00:00Z', project: '~/work/web', source: 'session', words: ['quorum', 'stale'] },
  ]);

  const result = commit([
    { type: 'phrase', front: 'revertir la migración', back: 'roll back the migration', keywords: ['roll back', 7] },
    { type: 'word', front: 'quorum', back: 'quórum' },
    { front: '', back: 'no front' },
    { front: 'no back', back: '   ' },
    null,
    'not an object',
    { front: 'x'.repeat(5000), back: 'oversized' },
  ]);

  assert.equal(result.added, 3, 'blank, null and non-object entries never reach the deck');
  assert.equal(result.queueCleared, 2);
  assert.equal(fileSize(paths.queue), 0);

  const [phrase, word, oversized] = result.cards;
  assert.equal(phrase.project, '~/work/api', 'matched to the line it came from');
  assert.equal(phrase.ts, '2026-08-01T00:00:00Z');
  assert.deepEqual(phrase.keywords, ['roll back'], 'non-string keywords are dropped');
  assert.equal(word.project, '~/work/web');
  assert.equal(word.type, 'word');
  assert.ok(oversized.front.length <= 2000, 'fields are length-capped');

  const known = knownWords();
  assert.ok(known.has('quorum'));
  assert.ok(known.has('stale'), 'words the agent rejected still count as seen');
  assert.ok(known.has('roll back'));
});

test('commit is idempotent for identical cards', () => {
  const before = loadCards().length;
  commit([{ type: 'word', front: 'quorum', back: 'quórum' }]);
  assert.equal(loadCards().length, before, 'same content, same id, one card');
});

test('an unknown card type is normalised rather than trusted', () => {
  const { cards } = commit([{ type: 'sql; drop', front: 'nuevo', back: 'new' }]);
  assert.equal(cards[0].type, 'phrase');
});

test('commit survives a cards file that already holds junk', () => {
  writeFileSync(paths.cards, 'garbage\n{"front":"ok","back":"fine"}\n');
  const { added } = commit([{ front: 'otro', back: 'another' }]);
  assert.equal(added, 1);
  assert.deepEqual(
    loadCards().map((c) => c.front),
    ['ok', 'otro'],
  );
  assert.ok(readFileSync(paths.cards, 'utf8').endsWith('\n'));
});
