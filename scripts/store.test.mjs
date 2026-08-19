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
  cardsForPair,
  deckPairs,
  fallbackPair,
  normalizeCategory,
  normalizeCefr,
  saveKnownWords,
  sanitizeSettings,
  saveSettings,
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

// ── Settings written from the browser ──────────────────────────────────
// The trainer POSTs these, so they are untrusted input like any other.

test('sanitizeSettings keeps well-formed values and drops everything else', () => {
  const clean = sanitizeSettings({
    native: 'DE',
    target: 'en',
    mode: 'active',
    dailyLimit: 22.7,
    autoBuild: false,
    level: 'B2',
    theme: 'dark',
    studyMode: 'learn',
    somethingElse: 'ignored',
  });
  assert.deepEqual(clean, {
    native: 'de',
    target: 'en',
    mode: 'active',
    dailyLimit: 22,
    autoBuild: false,
    level: 'B2',
    theme: 'dark',
    studyMode: 'learn',
  });
});

test('sanitizeSettings refuses malformed values rather than storing them', () => {
  const clean = sanitizeSettings({
    native: '../etc/passwd',
    target: 'english',
    mode: 'everything',
    dailyLimit: -5,
    autoBuild: 'yes',
    level: 'D1',
    theme: 'neon',
    studyMode: 'match',
    __proto__: { polluted: true },
  });
  assert.deepEqual(clean, {});
  assert.equal({}.polluted, undefined);
});

test('sanitizeSettings survives a body that is not an object', () => {
  for (const value of [null, undefined, 'string', 42, [1, 2]]) {
    assert.deepEqual(sanitizeSettings(value), {});
  }
});

test('saveSettings overrides the install-time answers and merges across writes', () => {
  process.env.CLAUDE_PLUGIN_OPTION_TARGET_LANG = 'en';
  process.env.CLAUDE_PLUGIN_OPTION_DAILY_LIMIT = '15';

  assert.equal(config().target, 'en');

  saveSettings({ target: 'ja' });
  assert.equal(config().target, 'ja');
  assert.equal(config().dailyLimit, 15, 'an untouched key still falls back to the env answer');

  saveSettings({ dailyLimit: 30 });
  assert.equal(config().target, 'ja', 'the earlier write survives the second one');
  assert.equal(config().dailyLimit, 30);

  writeJson(paths.settings, {});
  delete process.env.CLAUDE_PLUGIN_OPTION_TARGET_LANG;
  delete process.env.CLAUDE_PLUGIN_OPTION_DAILY_LIMIT;
});

// ── Card taxonomy ──────────────────────────────────────────────────────

test('an unknown or missing category falls back to everyday', () => {
  assert.equal(normalizeCategory('engineering'), 'engineering');
  assert.equal(normalizeCategory('  Process '), 'process');
  assert.equal(normalizeCategory('vocabulary'), 'everyday');
  assert.equal(normalizeCategory(undefined), 'everyday');
  assert.equal(normalizeCategory(42), 'everyday');
});

test('cefr is constrained to the six levels and never guessed', () => {
  assert.equal(normalizeCefr('b1'), 'B1');
  assert.equal(normalizeCefr('C2'), 'C2');
  assert.equal(normalizeCefr('B1+'), 'B1');
  assert.equal(normalizeCefr('D1'), '');
  assert.equal(normalizeCefr('intermediate'), '');
  assert.equal(normalizeCefr(undefined), '');
});

test('commit stamps a category and a level onto every card it writes', () => {
  writeFileSync(paths.queue, '');
  writeFileSync(paths.cards, '');
  const { cards } = commit([
    { type: 'word', front: 'bottleneck', back: 'cuello de botella', category: 'engineering', cefr: 'b2' },
    { type: 'phrase', front: 'ir al grano', back: 'get to the point', category: 'nonsense', cefr: 'X9' },
  ]);
  assert.deepEqual(
    cards.map((card) => [card.category, card.cefr]),
    [
      ['engineering', 'B2'],
      ['everyday', ''],
    ],
  );
});

test('cards written before categories existed still load into a real bucket', () => {
  writeFileSync(paths.cards, '');
  appendJsonl(paths.cards, [{ type: 'word', front: 'legacy', back: 'heredado' }]);
  const [card] = loadCards();
  assert.equal(card.category, 'everyday');
  assert.equal(card.cefr, '');
});

// ── One deck per language pair ─────────────────────────────────────────
// Changing target language must open a second deck, never rewrite the first.

function resetDecks() {
  writeJson(paths.settings, {});
  writeJson(paths.known, {});
  writeFileSync(paths.cards, '');
  writeFileSync(paths.queue, '');
  delete process.env.CLAUDE_PLUGIN_OPTION_NATIVE_LANG;
  delete process.env.CLAUDE_PLUGIN_OPTION_TARGET_LANG;
}

test('cards are stamped with the pair they were built for', () => {
  resetDecks();
  saveSettings({ native: 'es', target: 'en' });
  commit([{ type: 'word', front: 'bottleneck', back: 'cuello de botella' }]);
  saveSettings({ target: 'pl' });
  commit([{ type: 'word', front: 'wdrożenie', back: 'despliegue' }]);

  const pairs = deckPairs().sort((a, b) => a.target.localeCompare(b.target));
  assert.deepEqual(pairs, [
    { native: 'es', target: 'en', total: 1 },
    { native: 'es', target: 'pl', total: 1 },
  ]);
  assert.equal(loadCards().length, 2, 'both decks live in the same file');
});

test('opening one deck hides the others without touching them', () => {
  const before = readFileSync(paths.cards, 'utf8');

  const polish = cardsForPair({ native: 'es', target: 'pl' });
  assert.deepEqual(polish.map((card) => card.front), ['wdrożenie']);

  const english = cardsForPair({ native: 'es', target: 'en' });
  assert.deepEqual(english.map((card) => card.front), ['bottleneck']);

  assert.equal(readFileSync(paths.cards, 'utf8'), before, 'reading a deck never rewrites the file');
});

test('the two decks get distinct ids, so their schedules cannot collide', () => {
  const same = { type: 'word', front: 'ok', back: 'ok' };
  assert.notEqual(
    cardId({ ...same, native: 'es', target: 'en' }),
    cardId({ ...same, native: 'es', target: 'pl' }),
  );
  assert.equal(
    cardId(same),
    cardId({ ...same, target: '' }),
    'a card with no pair keeps the id it already had on disk',
  );
});

test('cards written before decks existed are pinned to the pair open at the first switch', () => {
  resetDecks();
  appendJsonl(paths.cards, [{ type: 'word', front: 'legacy', back: 'heredado' }]);
  saveSettings({ native: 'es', target: 'en' });

  // Still the only pair: nothing has been recorded yet.
  assert.deepEqual(fallbackPair(), { native: 'es', target: 'en' });

  saveSettings({ target: 'de' });
  assert.deepEqual(fallbackPair(), { native: 'es', target: 'en' }, 'the outgoing pair is remembered');
  assert.equal(cardsForPair({ native: 'es', target: 'de' }).length, 0);
  assert.equal(cardsForPair({ native: 'es', target: 'en' }).length, 1);

  saveSettings({ target: 'it' });
  assert.deepEqual(fallbackPair(), { native: 'es', target: 'en' }, 'and never overwritten by a later switch');
});

test('legacyPair cannot be set from a request body', () => {
  resetDecks();
  saveSettings({ native: 'es', target: 'en', legacyPair: { native: 'zz', target: 'zz' } });
  assert.deepEqual(fallbackPair(), { native: 'es', target: 'en' });
});

test('known words are tracked per target language', () => {
  resetDecks();
  saveKnownWords('en', new Set(['however', 'bottleneck']));
  assert.ok(knownWords('en').has('however'));
  assert.equal(knownWords('pl').size, 0, 'meeting a word in English says nothing about Polish');

  saveKnownWords('pl', new Set(['wdrożenie']));
  assert.ok(knownWords('en').has('however'), 'the second language does not evict the first');
  assert.ok(knownWords('pl').has('wdrożenie'));
});

test('a v0.1 flat known-words list is read as belonging to the original target', () => {
  resetDecks();
  saveSettings({ native: 'es', target: 'en' });
  writeJson(paths.known, ['however', 'deadline']);
  assert.ok(knownWords('en').has('however'));
  assert.equal(knownWords('pl').size, 0);
});
