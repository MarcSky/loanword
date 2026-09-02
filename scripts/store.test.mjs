import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { isLanguage } from './lang.mjs';

const DATA = mkdtempSync(join(tmpdir(), 'loanword-store-'));
process.env.CLAUDE_PLUGIN_DATA = DATA;

const {
  adoptStranded,
  appendJsonl,
  bucketStats,
  cardId,
  cardWords,
  CATEGORIES,
  commit,
  config,
  cardsForPair,
  deckPairs,
  fallbackPair,
  normalizeCategory,
  normalizeCefr,
  saveKnownWords,
  sanitizeSettings,
  seedSettings,
  saveSettings,
  fileSize,
  frequentWords,
  isLearned,
  knownSnapshot,
  knownWords,
  loadCards,
  peekFile,
  frontsFile,
  forgetSnapshots,
  readLines,
  queueFile,
  readingWanted,
  writeSnapshots,
  PEEK_ROWS,
  FRONTS_ROWS,
  CODES,
  masteryOf,
  paths,
  decksOnDisk,
  facing,
  readJson,
  readJsonl,
  resolveData,
  retireKey,
  tildify,
  writeJson,
  ymd,
} = await import('./store.mjs');

const db = await import('./db.mjs');
const { migrate } = await import('./migrate.mjs');

const scratch = [];
const temp = (prefix) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratch.push(dir);
  return dir;
};

function wipeDeck() {
  db.close();
  for (const suffix of ['', '-wal', '-shm']) rmSync(`${paths.db}${suffix}`, { force: true });
  rmSync(paths.cards, { force: true });
  rmSync(`${paths.cards}.migrated`, { force: true });
  rmSync(paths.state, { force: true });
  rmSync(`${paths.state}.migrated`, { force: true });
}

function seedDeck(rows, state = {}) {
  wipeDeck();
  appendJsonl(paths.cards, rows);
  if (Object.keys(state).length) writeJson(paths.state, state);
  return migrate();
}

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
    ['99999', 500],
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

test('migration drops malformed rows and de-duplicates by content', () => {
  wipeDeck();
  writeFileSync(
    paths.cards,
    [
      JSON.stringify({ front: 'uno', back: 'one' }),
      JSON.stringify({ front: 'uno', back: 'one' }),
      JSON.stringify({ front: '   ', back: 'blank front' }),
      JSON.stringify({ front: 'dos', back: 42 }),
      JSON.stringify({ back: 'no front' }),
      'garbage',
      JSON.stringify({ front: 'dos', back: 'two' }),
    ].join('\n') + '\n',
  );
  migrate();
  const cards = loadCards();
  assert.deepEqual(cards.map((c) => c.front).sort(), ['dos', 'uno']);
  assert.ok(cards.every((c) => /^[0-9a-f]{10}$/.test(c.id)));
});

test('a second migration run is a no-op, and the JSONL is moved aside', () => {
  assert.equal(existsSync(paths.cards), false, 'the source file is renamed once it is imported');
  assert.ok(existsSync(`${paths.cards}.migrated`), 'and kept, never deleted');
  const before = loadCards().length;
  assert.deepEqual(migrate(), { migrated: false, reason: 'nothing to migrate' });
  assert.equal(loadCards().length, before);
});

test('knownWords ignores rubbish and lowercases what it keeps', () => {
  saveKnownWords('zz', new Set(['Alpha', 'beta', 7, null, '  ']));
  assert.deepEqual([...knownWords('zz')].sort(), ['alpha', 'beta']);
  assert.equal(knownWords('qq').size, 0, 'a language with nothing learned is simply empty');
});

test('the hook reads a plain-text snapshot, never the database', () => {
  saveKnownWords('zz', new Set(['gamma']));
  const snapshot = knownSnapshot('zz');
  assert.ok(snapshot.has('alpha') && snapshot.has('gamma'));
  assert.deepEqual([...snapshot].sort(), [...knownWords('zz')].sort(), 'the file mirrors the table exactly');
  assert.equal(knownSnapshot('qq').size, 0);
});

test('commit refuses anything that is not an array', () => {
  for (const bad of [null, undefined, 'cards', 42, { front: 'x' }]) {
    assert.throws(() => commit(bad), TypeError);
  }
});

test('commit drops invalid cards, stamps provenance and clears the queue', () => {
  writeFileSync(paths.cards, '');
  appendJsonl(queueFile(config().target), [
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
  assert.equal(fileSize(queueFile(config().target)), 0);

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

test('a note survives commit, and an absent one is empty rather than undefined', () => {
  const { cards } = commit([
    { front: 'ir', back: 'to go', note: 'fully irregular: ir/fui — memorise it' },
    { front: 'sensible', back: 'sensato' },
  ]);
  assert.equal(cards[0].note, 'fully irregular: ir/fui — memorise it');
  assert.equal(cards[1].note, '');
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

test('commit survives a source file that already holds junk', () => {
  wipeDeck();
  writeFileSync(paths.cards, 'garbage\n{"front":"ok","back":"fine"}\n');
  migrate();
  const { added } = commit([{ front: 'otro', back: 'another' }]);
  assert.equal(added, 1);
  assert.deepEqual(loadCards().map((c) => c.front).sort(), ['ok', 'otro']);
});

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

function resetDecks() {
  writeJson(paths.settings, {});
  writeJson(paths.known, {});
  wipeDeck();
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
    { native: 'es', target: 'en', total: 1, due: 0 },
    { native: 'es', target: 'pl', total: 1, due: 0 },
  ]);
  assert.equal(loadCards().length, 2, 'both decks live in the same file');
});

test('opening one deck hides the others without touching them', () => {
  const before = loadCards().length;

  const polish = cardsForPair({ native: 'es', target: 'pl' });
  assert.deepEqual(polish.map((card) => card.front), ['wdrożenie']);

  const english = cardsForPair({ native: 'es', target: 'en' });
  assert.deepEqual(english.map((card) => card.front), ['bottleneck']);

  assert.equal(loadCards().length, before, 'reading one deck never disturbs the other');
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

test('cards written before decks existed are pinned by the migration, not by a later switch', () => {
  resetDecks();
  saveSettings({ native: 'es', target: 'en' });
  seedDeck([{ type: 'word', front: 'legacy', back: 'heredado' }]);

  assert.equal(cardsForPair({ native: 'es', target: 'en' }).length, 1, 'pinned to the pair open at migration');

  saveSettings({ target: 'de' });
  assert.equal(cardsForPair({ native: 'es', target: 'de' }).length, 0, 'a later switch opens an empty deck');
  assert.equal(cardsForPair({ native: 'es', target: 'en' }).length, 1, 'and never moves the old one');

  saveSettings({ target: 'it' });
  assert.equal(cardsForPair({ native: 'es', target: 'en' }).length, 1);
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

test('a stop-list ships for every language the picker offers', () => {
  for (const code of CODES) {
    const words = frequentWords(code);
    assert.ok(words.size >= 300, `${code} has only ${words.size} stop-words`);
    assert.ok(![...words].some((word) => /\d/.test(word)), `${code} has a digit in its stop-list`);
    assert.ok(![...words].some((word) => word !== word.toLowerCase()), `${code} is not lowercase throughout`);
  }
});

test('the English stop-list holds the words that were leaking through', () => {
  const english = frequentWords('en');
  for (const word of 'therefore something everything someone anyone shall doing having making taking coming onto'.split(' ')) {
    assert.ok(english.has(word), `${word} still reaches the builder`);
  }
  assert.ok(english.has('because'), 'and everything it held before is still there');
  assert.equal(frequentWords('xx').size, 0, 'no list means the filter is simply skipped');
});

test('commit refuses a bracketed front and a word card that is a stop-word', () => {
  const target = config().target;
  writeFileSync(queueFile(target), '');
  appendJsonl(queueFile(target), [
    { ts: '2026-09-02T00:00:00Z', project: '~/work/api', source: 'session', words: ['scaffolding'] },
  ]);

  const result = commit([
    { type: 'word', front: 'scaffolding', back: 'andamiaje de pruebas' },
    { type: 'phrase', front: 'roll back [a migration]', back: 'revertir una migración' },
    { type: 'phrase', front: 'ship it (behind a flag)', back: 'lanzarlo tras una bandera' },
    { type: 'word', front: 'the', back: 'artículo determinado' },
    { type: 'word', front: 'Onto', back: 'sobre' },
  ]);

  assert.equal(result.added, 1, 'only the card with nothing wrong with it');
  assert.equal(result.dropped, 4);
  assert.deepEqual(result.cards.map((card) => card.front), ['scaffolding']);
  const log = readFileSync(paths.log, 'utf8');
  assert.match(log, /bracketed front/);
  assert.match(log, /stop-word card/);
});

test('the peek snapshot carries what the filter needs, and never opens the database twice', () => {
  const cfg = config();
  const deck = db.deckId(cfg.native, cfg.target);
  const cards = db.cardsOfDeck(deck);
  assert.ok(cards.length, 'there is a deck to snapshot');

  const unseen = {
    deck_id: deck,
    type: 'phrase',
    front: 'never met this one',
    back: 'ни разу не встречал',
    keywords: [],
    cefr: 'C1',
    created_at: new Date().toISOString(),
  };
  db.tx(() => db.insertCards([unseen], [cardId({ ...unseen, native: cfg.native, target: cfg.target })]));

  db.setStar(cards[0].id, true);
  db.saveState(cards[0].id, deck, { due: new Date().toISOString(), stability: 2, reps: 3, lapses: 7 });
  writeSnapshots(cfg.native, cfg.target, { force: true });

  const rows = readJsonl(peekFile(cfg.target));
  assert.ok(rows.length, 'the snapshot is written');
  for (const key of ['front', 'back', 'cefr', 'starred', 'lapses', 'seen', 'r']) {
    assert.ok(key in rows[0], `the snapshot is missing ${key}`);
  }
  const starred = rows.find((row) => row.front === cards[0].front);
  assert.equal(starred.starred, true, 'the star travels into the snapshot');
  assert.equal(starred.seen, true);
  assert.equal(starred.lapses, 7, 'and so does what makes a leech a leech');
  assert.ok(rows.some((row) => row.seen === false), 'a card never reviewed is offered too');
});

test('the snapshot the hook reads is capped, however big the deck gets', () => {
  const cfg = config();
  const deck = db.deckId(cfg.native, cfg.target);
  const many = [];
  const ids = [];
  for (let index = 0; index < 400; index++) {
    const card = {
      deck_id: deck,
      type: 'phrase',
      front: `bulk front ${index}`,
      back: `объёмный перевод ${index}`,
      keywords: [],
      cefr: ['A1', 'B1', 'B2', 'C1'][index % 4],
      created_at: new Date().toISOString(),
      starred: index % 10 === 0,
    };
    many.push(card);
    ids.push(cardId({ ...card, native: cfg.native, target: cfg.target }));
  }
  db.tx(() => db.insertCards(many, ids));
  const due = new Date().toISOString();
  db.tx(() => {
    for (let index = 0; index < 300; index++) {
      db.saveState(ids[index], deck, { due, stability: 1 + (index % 20), reps: 2, lapses: index % 9 });
    }
  });

  forgetSnapshots();
  writeSnapshots(cfg.native, cfg.target, { force: true });

  const rows = readJsonl(peekFile(cfg.target));
  assert.ok(rows.length <= PEEK_ROWS, `${rows.length} rows is past the cap of ${PEEK_ROWS}`);
  assert.ok(rows.some((row) => row.starred), 'the starred still get in');
  assert.ok(rows.some((row) => row.lapses >= 6), 'and so do the ones that keep being forgotten');
  assert.ok(rows.some((row) => !row.seen), 'and the ones never met');
  assert.ok(readLines(frontsFile(cfg.target)).length <= FRONTS_ROWS, 'the wild-word list is capped too');
});

test('the snapshot is not rebuilt on every single grade', () => {
  const cfg = config();
  forgetSnapshots();
  assert.equal(writeSnapshots(cfg.native, cfg.target), true, 'the first write goes through');
  assert.equal(writeSnapshots(cfg.native, cfg.target), false, 'the second is skipped');
  assert.equal(writeSnapshots(cfg.native, cfg.target, { force: true }), true, 'unless it has to be exact');
  const later = Date.now() + 60_000;
  assert.equal(writeSnapshots(cfg.native, cfg.target, { now: later }), true, 'and the throttle lets go in time');
});

test('a reading is asked for only where the learner cannot read the script', () => {
  assert.equal(readingWanted('ru', 'ka'), true);
  assert.equal(readingWanted('en', 'ja'), true);
  assert.equal(readingWanted('en', 'ru'), true);
  assert.equal(readingWanted('ru', 'en'), false, 'a Latin target is readable from Cyrillic');
  assert.equal(readingWanted('en', 'es'), false);
});

test('an explicit CLAUDE_PLUGIN_DATA always wins', () => {
  assert.equal(resolveData({ CLAUDE_PLUGIN_DATA: '/tmp/somewhere' }, '/anything'), '/tmp/somewhere');
});

test('an installed plugin resolves to the directory Claude Code hands its hooks', () => {
  const root = join(homedir(), '.claude', 'plugins', 'cache', 'loanword', 'loanword', '0.0.1');
  assert.equal(
    resolveData({}, root),
    join(homedir(), '.claude', 'plugins', 'data', 'loanword-loanword'),
    'hooks and skills must land on the same deck',
  );
});

test('the marketplace name, not just the plugin name, decides the directory', () => {
  const root = join(homedir(), '.claude', 'plugins', 'cache', 'acme-tools', 'loanword', '1.2.3');
  assert.equal(resolveData({}, root), join(homedir(), '.claude', 'plugins', 'data', 'loanword-acme-tools'));
});

const fakeHome = (...decks) => {
  const home = temp('loanword-home-');
  const store = join(home, '.claude', 'plugins', 'data');
  for (const name of decks) {
    mkdirSync(join(store, name), { recursive: true });
    writeFileSync(join(store, name, 'cards.jsonl'), '{"front":"a","back":"b"}\n');
  }
  mkdirSync(store, { recursive: true });
  return { home, store };
};

test('a clone with no deck on the machine falls back to the historical directory', () => {
  const { home, store } = fakeHome();
  assert.equal(resolveData({}, '/Users/me/src/loanword', home), join(store, 'loanword'));
});

test('a clone finds the one installed deck instead of showing an empty one', () => {
  const { home, store } = fakeHome('loanword-loanword');
  assert.equal(
    resolveData({}, '/Users/me/src/loanword', home),
    join(store, 'loanword-loanword'),
    'a linked CLI must not report zero cards while a deck sits right there',
  );
});

test('two decks are never guessed between', () => {
  const { home, store } = fakeHome('loanword-loanword', 'loanword-acme');
  assert.equal(
    resolveData({}, '/Users/me/src/loanword', home),
    join(store, 'loanword'),
    'ambiguity falls back rather than picking a side; CLAUDE_PLUGIN_DATA settles it',
  );
  assert.equal(resolveData({ CLAUDE_PLUGIN_DATA: join(store, 'loanword-acme') }, '/x', home), join(store, 'loanword-acme'));
});

test('an install path still wins over anything found on disk', () => {
  const { home, store } = fakeHome('loanword-other');
  const root = join(home, '.claude', 'plugins', 'cache', 'loanword', 'loanword', '0.0.1');
  assert.equal(resolveData({}, root, home), join(store, 'loanword-loanword'));
});

test('a directory without cards is not a deck, and a migrated one is never picked', () => {
  const { home, store } = fakeHome('loanword-loanword');
  mkdirSync(join(store, 'loanword-empty'), { recursive: true });
  mkdirSync(join(store, 'loanword.migrated-2026-09-01'), { recursive: true });
  writeFileSync(join(store, 'loanword.migrated-2026-09-01', 'cards.jsonl'), '{"front":"a","back":"b"}\n');

  assert.deepEqual(decksOnDisk(store), [join(store, 'loanword-loanword')]);
});

test('a stranded deck is folded in, and not one word of it is lost', () => {
  const legacy = temp('loanword-legacy-');
  const live = temp('loanword-live-');

  writeFileSync(join(legacy, 'cards.jsonl'), '{"front":"откатить","back":"roll back"}\n');
  writeFileSync(join(legacy, 'queue.jsonl'), '{"source":"prompt","text":"перестроить индекс"}\n');
  writeFileSync(join(legacy, 'state.json'), '{"a":{"reps":3},"shared":{"reps":1}}');
  writeFileSync(join(legacy, 'known_words.json'), '{"en":["migration","stale"]}');

  writeFileSync(join(live, 'cards.jsonl'), '{"front":"влить ветку","back":"merge the branch"}\n');
  writeFileSync(join(live, 'state.json'), '{"shared":{"reps":9}}');
  writeFileSync(join(live, 'known_words.json'), '{"en":["stale","throughput"],"de":["Abnahme"]}');

  const adopted = adoptStranded(live, legacy);
  assert.ok(adopted.includes('cards.jsonl') && adopted.includes('queue.jsonl'));

  const fronts = readJsonl(join(live, 'cards.jsonl')).map((card) => card.front);
  assert.deepEqual(fronts.sort(), ['влить ветку', 'откатить'], 'both decks survive the merge');
  assert.equal(readJsonl(join(live, 'queue.jsonl')).length, 1, 'the uncommitted queue comes across too');

  const state = readJson(join(live, 'state.json'), {});
  assert.equal(state.a.reps, 3, 'a schedule only the stranded deck had is kept');
  assert.equal(state.shared.reps, 9, 'on a collision the live schedule wins — it is the more recent review');

  const known = readJson(join(live, 'known_words.json'), {});
  assert.deepEqual(known.en.sort(), ['migration', 'stale', 'throughput'], 'known words are unioned, not replaced');
  assert.deepEqual(known.de, ['Abnahme'], 'a language only the live deck had is untouched');

  assert.equal(existsSync(legacy), false, 'the source is renamed, never deleted');
  assert.equal(readdirSync(dirname(legacy)).some((d) => d.startsWith(`${basename(legacy)}.migrated-`)), true);
});

test('a v0.1 flat known-word list is adopted, not dropped for being the wrong shape', () => {
  const legacy = temp('loanword-legacy-');
  const live = temp('loanword-live-');
  writeFileSync(join(legacy, 'known_words.json'), '["boilerplate","flaky"]');
  writeFileSync(join(live, 'known_words.json'), '{"en":["flaky","stale"]}');

  assert.ok(adoptStranded(live, legacy).includes('known_words.json'));
  const known = readJson(join(live, 'known_words.json'), {});
  assert.deepEqual(known.en.sort(), ['boilerplate', 'flaky', 'stale'], 'retired words are never re-captured');
});

test('adopting twice does not duplicate a card', () => {
  const legacy = temp('loanword-legacy-');
  const live = temp('loanword-live-');
  const card = '{"front":"деплой","back":"deploy"}\n';
  writeFileSync(join(legacy, 'cards.jsonl'), card);
  writeFileSync(join(live, 'cards.jsonl'), card);

  adoptStranded(live, legacy);
  const ids = new Set(readJsonl(join(live, 'cards.jsonl')).map((c) => cardId(c)));
  assert.equal(ids.size, 1, 'the same card twice is one card — ids are content hashes');
});

test('a clone never adopts its own directory', () => {
  const dir = temp('loanword-same-');
  writeFileSync(join(dir, 'cards.jsonl'), '{"front":"a","back":"b"}\n');
  assert.equal(adoptStranded(dir, dir), null);
  assert.equal(readJsonl(join(dir, 'cards.jsonl')).length, 1, 'the deck is not appended to itself');
});

test('adopting is a no-op when there is nothing stranded', () => {
  const live = temp('loanword-live-');
  assert.equal(adoptStranded(live, join(tmpdir(), 'loanword-does-not-exist')), null);
});

test('adoption refuses to guess which directories it is merging', () => {
  assert.throws(() => adoptStranded(), TypeError, 'a defaulted target once migrated a real deck into a test temp dir');
  assert.throws(() => adoptStranded('/tmp/only-one'), TypeError);
});

test('the install-time answers are seeded onto disk for every other context', () => {
  writeFileSync(paths.settings, '{}');
  process.env.CLAUDE_PLUGIN_OPTION_NATIVE_LANG = 'ru';
  process.env.CLAUDE_PLUGIN_OPTION_TARGET_LANG = 'en';

  assert.ok(seedSettings().includes('native'));
  assert.equal(readJson(paths.settings, {}).native, 'ru');

  delete process.env.CLAUDE_PLUGIN_OPTION_NATIVE_LANG;
  delete process.env.CLAUDE_PLUGIN_OPTION_TARGET_LANG;
  assert.equal(config().native, 'ru', 'a shell with no plugin options still reads the right pair');
});

test('an answer changed in /plugin reaches the trainer, and does not fight it', () => {
  writeFileSync(paths.settings, '{}');
  process.env.CLAUDE_PLUGIN_OPTION_NATIVE_LANG = 'ru';
  process.env.CLAUDE_PLUGIN_OPTION_TARGET_LANG = 'en';
  seedSettings();

  saveSettings({ target: 'de' });
  seedSettings();
  assert.equal(config().target, 'de', 'a stale install answer never undoes a fresh UI edit');

  process.env.CLAUDE_PLUGIN_OPTION_TARGET_LANG = 'fr';
  assert.deepEqual(seedSettings(), ['target']);
  assert.equal(config().target, 'fr', 'the last surface touched is the one that wins');

  delete process.env.CLAUDE_PLUGIN_OPTION_NATIVE_LANG;
  delete process.env.CLAUDE_PLUGIN_OPTION_TARGET_LANG;
});

test('seeding never overwrites what the user changed in the trainer', () => {
  writeFileSync(paths.settings, JSON.stringify({ native: 'uk' }));
  process.env.CLAUDE_PLUGIN_OPTION_NATIVE_LANG = 'ru';
  seedSettings();
  assert.equal(readJson(paths.settings, {}).native, 'uk', 'the Settings screen is the last word');
  delete process.env.CLAUDE_PLUGIN_OPTION_NATIVE_LANG;
});

test('mastery runs from nothing seen to three weeks of stability', () => {
  assert.equal(masteryOf(null), 0, 'a card never reviewed is at zero, not NaN');
  assert.equal(masteryOf({ stability: 0 }), 0);
  assert.equal(masteryOf({ stability: 10.5 }), 0.5);
  assert.equal(masteryOf({ stability: 21 }), 1);
  assert.equal(masteryOf({ stability: 900 }), 1, 'mastery is capped, not unbounded');
  assert.equal(masteryOf({ stability: -5 }), 0, 'a corrupted negative stability cannot go below zero');
});

test('learned is exactly full mastery', () => {
  assert.equal(isLearned({ stability: 20.9 }), false);
  assert.equal(isLearned({ stability: 21 }), true);
  assert.equal(isLearned(undefined), false);
});

test('bucket stats keep every bucket, including the empty ones', () => {
  const cards = [
    { id: 'a', category: 'engineering' },
    { id: 'b', category: 'engineering' },
    { id: 'c', category: 'process' },
  ];
  const state = { a: { stability: 21 }, b: { stability: 0 } };
  const rows = bucketStats(['engineering', 'process', 'phrasing'], cards, state, (card) => card.category);

  assert.deepEqual(rows.map((row) => row.key), ['engineering', 'process', 'phrasing']);
  assert.deepEqual(rows[0], { key: 'engineering', total: 2, seen: 2, learned: 1, mastery: 0.5 });
  assert.deepEqual(rows[2], { key: 'phrasing', total: 0, seen: 0, learned: 0, mastery: 0 }, 'no division by zero');
  assert.equal(rows[1].seen, 0, 'a card with no schedule counts as unseen');
});

test('ymd takes a date, an ISO string, or nothing at all', () => {
  assert.equal(ymd(new Date('2026-08-19T09:19:22Z')), '2026-08-19');
  assert.equal(ymd('2026-08-19T09:19:22.494Z'), '2026-08-19', 'card timestamps arrive as strings');
  assert.equal(ymd(''), '', 'an absent timestamp is blank, not "Invalid Date"');
  assert.equal(ymd('not a date'), '');
  assert.match(ymd(), /^\d{4}-\d{2}-\d{2}$/);
});

test('a build that produced no cards leaves the queue untouched', () => {
  writeFileSync(paths.cards, '');
  writeFileSync(paths.known, '{}');
  const queue = queueFile(config().target);
  writeFileSync(queue, '');
  appendJsonl(queue, [{ ts: '2026-09-01T00:00:00Z', source: 'session', words: ['unbuilt', 'unclaimed'] }]);

  const result = commit([]);
  assert.equal(result.added, 0);
  assert.equal(result.queueCleared, 0);
  assert.deepEqual(result.cards, []);
  assert.equal(readJsonl(queue).length, 1, 'the material is still there to retry');
  assert.equal(knownWords('en').has('unbuilt'), false, 'nothing is retired unread');
});

test('a retired wording never comes back, however the builder rephrases it', () => {
  wipeDeck();
  writeFileSync(paths.queue, '');
  db.retire('откатить миграцию');

  const { cards, added } = commit([
    { front: 'откатить миграцию', back: 'roll back the migration' },
    { front: '  Откатить   Миграцию  ', back: 'revert the migration' },
    { front: 'перестроить индекс', back: 'rebuild the index' },
  ]);

  assert.equal(added, 1, 'case and spacing are not a way back in');
  assert.deepEqual(cards.map((card) => card.back), ['перестроить индекс'], 'the survivor is the one never retired');
});

test('retiring compares the wording a human would, not the bytes', () => {
  assert.equal(retireKey('  Откатить   Миграцию '), 'откатить миграцию');
  assert.equal(retireKey('Roll Back'), retireKey('roll  back'));
  assert.equal(retireKey(null), '');
});

test('nothing retired means nothing filtered', () => {
  wipeDeck();
  writeFileSync(paths.queue, '');
  assert.equal(commit([{ front: 'откатить миграцию', back: 'roll back the migration' }]).added, 1);
});

test('every card faces target-first, whichever way it was written', () => {
  const pair = { native: 'ru', target: 'en' };
  const flipped = facing({ ...pair, front: 'откатить миграцию', back: 'roll back the migration' });
  assert.equal(flipped.front, 'roll back the migration');
  assert.equal(flipped.back, 'откатить миграцию');

  const already = facing({ ...pair, front: 'flaky', back: 'нестабильный, плавающий' });
  assert.equal(already.front, 'flaky', 'a card already facing the right way is untouched');
  assert.equal(already.back, 'нестабильный, плавающий');
});

test('the side carrying more of the native alphabet is the native side', () => {
  const pair = { native: 'ru', target: 'en' };
  const front = (card) => facing({ ...pair, ...card }).front;

  assert.equal(front({ front: 'режим', back: 'mode' }), 'mode');
  assert.equal(front({ front: 'поправить', back: 'fix' }), 'fix');

  assert.equal(
    front({ front: 'мы считаем PNL от swap а не transfer', back: 'we calculate PnL from swaps, not transfers' }),
    'we calculate PnL from swaps, not transfers',
  );

  assert.equal(front({ front: 'LP burned и LP locked', back: 'Liquidity removed from the pool' }), 'Liquidity removed from the pool');
});

test('a short pair still flips — one recognisable side is enough', () => {
  const pair = { native: 'ru', target: 'en' };

  assert.equal(facing({ ...pair, front: 'поправить', back: 'fix' }).front, 'fix');

  assert.equal(facing({ ...pair, front: 'конфиг', back: 'config (configuration)' }).front, 'config (configuration)');

  assert.equal(
    facing({ ...pair, front: 'мы считаем PNL от swap', back: 'we calculate PnL from swaps, not transfers' }).front,
    'we calculate PnL from swaps, not transfers',
  );
});

test('a correctly faced short card is not flipped back', () => {
  const pair = { native: 'ru', target: 'en' };
  assert.equal(facing({ ...pair, front: 'recap', back: 'краткое резюме' }).front, 'recap');
  assert.equal(facing({ ...pair, front: 'flaky', back: 'нестабильный, плавающий' }).front, 'flaky');
});

test('a card the detector cannot place is left exactly as it was', () => {
  const pair = { native: 'ru', target: 'en' };
  const both = { ...pair, front: 'CI', back: 'CD' };
  assert.deepEqual(facing(both), both, 'guessing here would flip cards at random');
  assert.deepEqual(facing({ native: 'en', target: 'en', front: 'a', back: 'b' }), { native: 'en', target: 'en', front: 'a', back: 'b' });
});

test('flipping a card does not cost it its schedule', () => {
  writeFileSync(paths.queue, '');
  const stored = { type: 'phrase', front: 'откатить миграцию', back: 'roll back the migration', native: 'ru', target: 'en' };
  seedDeck([stored]);

  const [card] = loadCards();
  assert.equal(card.front, 'roll back the migration', 'shown target-first');
  assert.equal(card.id, cardId(stored), 'the id still comes from the stored wording — FSRS keys on it');
});

test('the whole deck ends up with its backs in one language', () => {
  writeFileSync(paths.queue, '');
  seedDeck([
    { type: 'phrase', front: 'откатить миграцию', back: 'roll back the migration', native: 'ru', target: 'en' },
    { type: 'word', front: 'flaky', back: 'нестабильный, плавающий', native: 'ru', target: 'en' },
    { type: 'phrase', front: 'попробуй ещё раз', back: 'try again', native: 'ru', target: 'en' },
  ]);

  const backs = loadCards().map((card) => card.back);
  assert.equal(
    backs.every((back) => isLanguage(back, 'ru', 'en')),
    true,
    'a Learn option can never be offered in the language of the answer',
  );
});

test('a word card retires its lemma and its keywords', () => {
  assert.deepEqual(
    cardWords({ type: 'word', front: 'Bottleneck', keywords: ['throughput'] }).sort(),
    ['bottleneck', 'throughput'],
  );
});

test('a phrase card retires only its keywords — its front is the native side', () => {
  assert.deepEqual(cardWords({ type: 'phrase', front: 'roll back the migration', keywords: ['Roll Back'] }), ['roll back']);
});

test('a card with nothing to retire yields nothing', () => {
  assert.deepEqual(cardWords({ type: 'phrase', front: 'x' }), []);
  assert.deepEqual(cardWords({ type: 'word', front: 'x', keywords: [null, 7] }), ['x']);
});

test('a reply entry that is not a card is dropped, not stamped', () => {
  wipeDeck();
  writeFileSync(paths.queue, '');
  const { added, cards } = commit([
    null,
    'not an object',
    { front: '', back: 'no front' },
    { front: 'no back', back: '  ' },
    { front: 'откатить', back: 'roll back' },
  ]);
  assert.equal(added, 1);
  assert.equal(cards[0].front, 'roll back', 'commit faces the card before it is written');
  assert.equal(loadCards()[0].front, 'roll back', 'the deck reads target-first');
});

test.after(() => {
  for (const dir of [DATA, ...scratch]) rmSync(dir, { recursive: true, force: true });
  for (const dir of scratch) {
    for (const moved of [`${dir}.migrated`, ...glob(dir)]) rmSync(moved, { recursive: true, force: true });
  }
});

function glob(dir) {
  const base = dir.slice(dir.lastIndexOf('/') + 1);
  try {
    return readdirSync(tmpdir())
      .filter((name) => name.startsWith(`${base}.migrated`))
      .map((name) => join(tmpdir(), name));
  } catch {
    return [];
  }
}
