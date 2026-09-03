import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA = mkdtempSync(join(tmpdir(), 'loanword-db-'));
process.env.CLAUDE_PLUGIN_DATA = DATA;

const db = await import('./db.mjs');
const { paths } = await import('./store-paths.mjs');

const deck = () => db.deckId('es', 'en');

const card = (id, overrides = {}) => ({
  deck_id: deck(),
  type: 'phrase',
  front: `front-${id}`,
  back: `back-${id}`,
  keywords: ['kw'],
  example: `an example with front-${id} in it`,
  cefr: 'B1',
  category: 'engineering',
  ts: new Date().toISOString(),
  created_at: new Date().toISOString(),
  ...overrides,
});

test('node:sqlite is available and the schema opens', () => {
  assert.equal(db.sqliteAvailable(), true);
  db.open();
  assert.ok(existsSync(db.DB_FILE));
  assert.equal(db.get('SELECT version FROM schema_version').version, db.SCHEMA_VERSION);
});

test('the pragmas the storage relies on are actually set', () => {
  const handle = db.open();
  assert.equal(handle.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
  assert.equal(handle.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
});

test('a deck is found or created, never duplicated', () => {
  const first = db.deckId('es', 'en');
  assert.equal(db.deckId('es', 'en'), first);
  const other = db.deckId('es', 'pl');
  assert.notEqual(other, first);
  assert.equal(db.get('SELECT COUNT(*) AS n FROM decks').n, 2);
});

test('cards insert once and ignore a repeat of the same id', () => {
  assert.equal(db.insertCards([card('a'), card('b')], ['aaaaaaaaaa', 'bbbbbbbbbb']), 2);
  assert.equal(db.insertCards([card('a')], ['aaaaaaaaaa']), 0, 'a content hash already present is a no-op');
  assert.equal(db.countCards(deck()), 2);
});

test('keywords survive the JSON round trip and starred comes back a boolean', () => {
  const row = db.cardById('aaaaaaaaaa');
  assert.deepEqual(row.keywords, ['kw']);
  assert.equal(row.starred, false);
  db.setStar('aaaaaaaaaa', true);
  assert.equal(db.cardById('aaaaaaaaaa').starred, true);
});

test('a corrupt keywords column degrades to an empty list rather than throwing', () => {
  db.run("UPDATE cards SET keywords = 'not json' WHERE id = ?", 'bbbbbbbbbb');
  assert.deepEqual(db.cardById('bbbbbbbbbb').keywords, []);
  db.run("UPDATE cards SET keywords = '[\"kw\"]' WHERE id = ?", 'bbbbbbbbbb');
});

test('only the editable fields can be written through updateCard', () => {
  db.updateCard('aaaaaaaaaa', { front: 'edited', deck_id: 999, id: 'hacked' });
  const row = db.cardById('aaaaaaaaaa');
  assert.equal(row.front, 'edited');
  assert.equal(row.deck_id, deck());
  assert.ok(db.cardById('aaaaaaaaaa'), 'the id is not writable');
});

test('the schedule upserts rather than accumulating rows', () => {
  const now = new Date();
  db.saveState('aaaaaaaaaa', deck(), { due: now, stability: 1, difficulty: 5, reps: 1, lapses: 0, state: 1 });
  db.saveState('aaaaaaaaaa', deck(), { due: now, stability: 30, difficulty: 4, reps: 2, lapses: 0, state: 2 });
  assert.equal(db.get('SELECT COUNT(*) AS n FROM fsrs_state WHERE card_id = ?', 'aaaaaaaaaa').n, 1);
  assert.equal(db.stateOfCard('aaaaaaaaaa').stability, 30);
});

test('stateOfDeck answers with one map for the whole deck', () => {
  const state = db.stateOfDeck(deck());
  assert.ok(state instanceof Map);
  assert.equal(state.has('aaaaaaaaaa'), true);
  assert.equal(state.has('bbbbbbbbbb'), false);
});

test('a review is stamped with the local day, hour and weekday', () => {
  const when = new Date(2026, 0, 15, 21, 30);
  db.logReview({ card_id: 'aaaaaaaaaa', deck_id: deck(), ts: when.toISOString(), rating: 3, mode: 'flashcards' });
  const row = db.get('SELECT * FROM reviews ORDER BY id DESC LIMIT 1');
  assert.equal(row.day, '2026-01-15');
  assert.equal(row.hour, 21);
  assert.equal(row.weekday, when.getDay());
});

test('an absurd answer time is capped rather than stored', () => {
  db.logReview({ card_id: 'aaaaaaaaaa', deck_id: deck(), rating: 3, duration_ms: 9_999_999 });
  assert.equal(db.get('SELECT duration_ms FROM reviews ORDER BY id DESC LIMIT 1').duration_ms, 600_000);
});

test('new cards today counts only the reviews that introduced one', () => {
  const day = db.localDay();
  const before = db.newCardsToday(deck(), day);
  db.logReview({ card_id: 'bbbbbbbbbb', deck_id: deck(), rating: 3, was_new: true });
  db.logReview({ card_id: 'bbbbbbbbbb', deck_id: deck(), rating: 3, was_new: false });
  assert.equal(db.newCardsToday(deck(), day), before + 1);
});

test('a session closes with the totals of its own reviews', () => {
  const id = db.openSession(deck(), 10, 12);
  db.logReview({ card_id: 'aaaaaaaaaa', deck_id: deck(), session_id: id, rating: 4, duration_ms: 4000 });
  db.logReview({ card_id: 'bbbbbbbbbb', deck_id: deck(), session_id: id, rating: 1, duration_ms: 8000 });
  const row = db.closeSession(id);
  assert.equal(row.reviewed, 2);
  assert.equal(row.correct, 1);
  assert.equal(row.duration_ms, 12_000);
  assert.ok(row.ended_at);
});

test('junk hides the card, records the reason, and undo brings it back whole', () => {
  db.junkCard('bbbbbbbbbb', deck(), 'not useful', 'front-b');
  assert.equal(db.cardExists('bbbbbbbbbb'), false);
  assert.equal(db.countCards(deck()), 1);
  assert.equal(db.get('SELECT reason FROM junk WHERE card_id = ?', 'bbbbbbbbbb').reason, 'not useful');

  db.restoreCard('bbbbbbbbbb');
  assert.equal(db.cardExists('bbbbbbbbbb'), true);
  assert.equal(db.get('SELECT COUNT(*) AS n FROM junk WHERE card_id = ?', 'bbbbbbbbbb').n, 0);
});

test('retirement ignores case and spacing', () => {
  db.retire('  Roll   Back the Migration ');
  assert.equal(db.isRetired('roll back the migration'), true);
  assert.equal(db.isRetired('ROLL BACK THE MIGRATION'), true);
  assert.equal(db.isRetired('rebuild the index'), false);
});

test('a reason longer than the cap is truncated, not rejected', () => {
  db.junkCard('bbbbbbbbbb', deck(), 'x'.repeat(500), 'front-b');
  assert.equal(db.get('SELECT reason FROM junk WHERE card_id = ?', 'bbbbbbbbbb').reason.length, 200);
  db.restoreCard('bbbbbbbbbb');
});

test('a failed transaction leaves nothing behind', () => {
  const before = db.countCards(deck());
  assert.throws(() =>
    db.tx(() => {
      db.insertCards([card('c')], ['cccccccccc']);
      throw new Error('halfway');
    }),
  );
  assert.equal(db.countCards(deck()), before, 'the insert was rolled back with the error');
});

test('junk rate is junked over everything ever seen', () => {
  const fresh = db.deckId('ru', 'en');
  assert.equal(db.junkRate(fresh), 0, 'an untouched deck has no rate, not a NaN');
  db.insertCards([card('d', { deck_id: fresh })], ['dddddddddd']);
  db.insertCards([card('e', { deck_id: fresh })], ['eeeeeeeeee']);
  db.junkCard('eeeeeeeeee', fresh, 'noise', 'front-e');
  assert.equal(db.junkRate(fresh), 0.5);
});

test('deck pairs come back as plain objects with live counts', () => {
  const pairs = db.deckPairsWithCounts();
  assert.ok(pairs.every((pair) => Object.getPrototypeOf(pair) === Object.prototype));
  const es = pairs.find((pair) => pair.native === 'es' && pair.target === 'en');
  assert.equal(es.total, db.countCards(deck()));
  assert.equal(typeof es.due, 'number', 'the switcher shows what is due in each deck');
  assert.ok(es.due <= es.total);
});

test('localDay follows the local calendar, not UTC', () => {
  assert.equal(db.localDay(new Date(2026, 5, 1, 23, 59)), '2026-06-01');
  assert.equal(db.localDay(new Date(2026, 5, 2, 0, 1)), '2026-06-02');
  assert.equal(db.localDay('not a date'), '');
});

test('closing twice is safe, and the next call reopens', () => {
  db.close();
  db.close();
  assert.equal(db.totalCards() >= 1, true);
});

test.after(() => {
  db.close();
  rmSync(DATA, { recursive: true, force: true });
});

const OLD_CARDS = `
CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS decks (
  id INTEGER PRIMARY KEY, native TEXT NOT NULL, target TEXT NOT NULL, UNIQUE (native, target));
CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY, deck_id INTEGER NOT NULL REFERENCES decks(id),
  type TEXT NOT NULL DEFAULT 'phrase', front TEXT NOT NULL, back TEXT NOT NULL,
  keywords TEXT NOT NULL DEFAULT '[]', example TEXT NOT NULL DEFAULT '', pos TEXT NOT NULL DEFAULT '',
  cefr TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT 'everyday',
  project TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', ts TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '', starred INTEGER NOT NULL DEFAULT 0, deleted_at TEXT);
CREATE TABLE IF NOT EXISTS fsrs_state (
  card_id TEXT PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE, deck_id INTEGER NOT NULL,
  due TEXT NOT NULL, stability REAL NOT NULL DEFAULT 0, difficulty REAL NOT NULL DEFAULT 0,
  elapsed_days REAL NOT NULL DEFAULT 0, scheduled_days REAL NOT NULL DEFAULT 0,
  reps INTEGER NOT NULL DEFAULT 0, lapses INTEGER NOT NULL DEFAULT 0, state INTEGER NOT NULL DEFAULT 0,
  learning_steps INTEGER NOT NULL DEFAULT 0, last_review TEXT);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY, deck_id INTEGER NOT NULL, started_at TEXT NOT NULL, ended_at TEXT,
  day TEXT NOT NULL, minutes INTEGER NOT NULL DEFAULT 0, planned INTEGER NOT NULL DEFAULT 0,
  reviewed INTEGER NOT NULL DEFAULT 0, correct INTEGER NOT NULL DEFAULT 0, duration_ms INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS junk (
  id INTEGER PRIMARY KEY, card_id TEXT NOT NULL, deck_id INTEGER NOT NULL, ts TEXT NOT NULL,
  day TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', front TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS retired (front_key TEXT PRIMARY KEY);
`;

const REVIEWS_V2 = `
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY, card_id TEXT NOT NULL, deck_id INTEGER NOT NULL, session_id INTEGER,
  ts TEXT NOT NULL, day TEXT NOT NULL, hour INTEGER NOT NULL DEFAULT 0, weekday INTEGER NOT NULL DEFAULT 0,
  rating INTEGER NOT NULL, mode TEXT NOT NULL DEFAULT 'flashcards', was_new INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0, elapsed_days REAL NOT NULL DEFAULT 0,
  scheduled_days REAL NOT NULL DEFAULT 0, stability_before REAL NOT NULL DEFAULT 0,
  stability_after REAL NOT NULL DEFAULT 0, difficulty_before REAL NOT NULL DEFAULT 0,
  difficulty_after REAL NOT NULL DEFAULT 0, state_before INTEGER NOT NULL DEFAULT 0,
  state_after INTEGER NOT NULL DEFAULT 0);
`;

const REVIEWS_V3 = REVIEWS_V2.replace(
  "mode TEXT NOT NULL DEFAULT 'flashcards',",
  "mode TEXT NOT NULL DEFAULT 'flashcards', category TEXT NOT NULL DEFAULT '', cefr TEXT NOT NULL DEFAULT '',",
);

async function fixture(name, version, cards = [['abcdef0001', 'roll back', 'откатить']]) {
  const { DatabaseSync } = await import('node:sqlite');
  const file = join(DATA, `${name}.db`);
  rmSync(file, { force: true });
  const handle = new DatabaseSync(file);
  handle.exec(OLD_CARDS);
  handle.exec(version === 2 ? REVIEWS_V2 : REVIEWS_V3);
  handle.prepare('INSERT INTO schema_version (version) VALUES (?)').run(version);
  handle.prepare('INSERT INTO decks (native, target) VALUES (?, ?)').run('ru', 'en');
  const insert = handle.prepare(
    'INSERT INTO cards (id, deck_id, front, back, created_at) VALUES (?, 1, ?, ?, ?)',
  );
  for (const [id, front, back] of cards) insert.run(id, front, back, '2026-01-01');
  handle.close();
  return file;
}

function shapeOf(handle) {
  const tables = handle
    .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((row) => row.name);
  const shape = {};
  for (const table of tables) {
    shape[table] = handle
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((row) => `${row.name}:${row.type}:${row.notnull}:${row.dflt_value ?? ''}`)
      .sort();
  }
  shape.__indexes = handle
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((row) => row.name);
  return shape;
}

test('an old database, a newer one and a fresh one end with the same shape', async () => {
  db.close();
  const fresh = shapeOf(db.open(join(DATA, 'fresh.db')));
  db.close();

  const v2 = shapeOf(db.open(await fixture('v2', 2)));
  db.close();
  const v3 = shapeOf(db.open(await fixture('v3', 3)));
  db.close();

  assert.deepEqual(v2, fresh, 'a v2 deck comes out of the ladder identical to a new one');
  assert.deepEqual(v3, fresh, 'and so does a v3 deck');
  assert.ok(Object.keys(fresh).includes('known_words'));
  assert.ok(fresh.cards.some((column) => column.startsWith('reading:')));
  assert.ok(fresh.cards.some((column) => column.startsWith('origin_id:')));
  assert.ok(fresh.reviews.some((column) => column.startsWith('category:')));
});

test('nothing is migrated before a copy of the deck is put somewhere safe', async () => {
  db.close();
  rmSync(paths.backups, { recursive: true, force: true });
  const file = await fixture('backup-me', 2);

  const handle = db.open(file);
  assert.ok(existsSync(paths.backups), 'the backup directory is made before the first step runs');
  const stamped = readdirSync(paths.backups);
  assert.equal(stamped.length, 1);
  assert.ok(existsSync(join(paths.backups, stamped[0], 'loanword.db')));
  assert.equal(handle.prepare('SELECT COUNT(*) AS n FROM cards').get().n, 1, 'and the card survived');
  db.close();

  const before = readdirSync(paths.backups).length;
  db.open(file);
  assert.equal(readdirSync(paths.backups).length, before, 'a second open has nothing to migrate and no backup to take');
  db.close();
});

test('the known words move into the table, and the file is renamed rather than deleted', async () => {
  db.close();
  const file = await fixture('known', 3);
  writeFileSync(paths.known, JSON.stringify({ en: ['However', 'bottleneck'], pl: ['wdrożenie'] }));

  db.open(file);
  assert.deepEqual([...db.knownWordsOf('en')].sort(), ['bottleneck', 'however'], 'lowercased on the way in');
  assert.deepEqual([...db.knownWordsOf('pl')], ['wdrożenie'], 'each language keeps its own');
  assert.equal(existsSync(paths.known), false);
  assert.ok(existsSync(`${paths.known}.migrated`), 'kept, never deleted');
  db.close();
});

test('a flat v0.1 list is imported too, rather than being dropped on the floor', async () => {
  db.close();
  rmSync(`${paths.known}.migrated`, { force: true });
  const file = await fixture('flat', 2);
  writeFileSync(paths.known, JSON.stringify(['deadline', 'quorum']));

  db.open(file);
  assert.deepEqual([...db.knownWordsOf('')].sort(), ['deadline', 'quorum']);
  db.close();
  db.open();
});

test('a card can be sorted as known, and unsorted again', () => {
  db.open();
  db.insertCards([card('known-1', { deck_id: deck() })], ['known-1']);
  assert.equal(db.cardById('known-1').isKnown, false, 'new cards are not known');
  db.setKnown('known-1', true);
  assert.equal(db.cardById('known-1').isKnown, true);
  assert.equal('known' in db.cardById('known-1'), false, 'the raw column never leaks');
  db.setKnown('known-1', false);
  assert.equal(db.cardsOfDeck(deck()).find((row) => row.id === 'known-1').isKnown, false);
});

test('an old deck is given the concept of every card it already holds', async () => {
  db.close();
  const file = await fixture('concepts', 3);
  const handle = db.open(file);

  const row = handle.prepare('SELECT back, concept FROM cards WHERE id = ?').get('abcdef0001');
  assert.equal(row.back, 'откатить');
  assert.equal(row.concept, db.conceptKey('откатить'), 'the migration fills in what the column was added for');
  assert.notEqual(row.concept, '');
  db.close();
  db.open();
});

test('the concept of a phrase ignores case, padding and inner spacing', () => {
  assert.equal(db.conceptKey('Привет  мир '), db.conceptKey('привет мир'));
  assert.notEqual(db.conceptKey('привет'), db.conceptKey('пока'));
  assert.equal(db.conceptKey(null), db.conceptKey(''));
});

test('one tokenizer splits a phrase for both the concept and the wording check', () => {
  assert.deepEqual(db.wordsOf('Гамбургер-меню!'), ['гамбургер', 'меню']);
  assert.deepEqual(db.wordsOf('  roll   back  '), ['roll', 'back'], 'padding and inner spacing are noise');
  assert.deepEqual(db.wordsOf(null), []);
  assert.deepEqual(db.wordsOf('ჰამბურგერ მენიუ'), ['ჰამბურგერ', 'მენიუ'], 'every script splits the same way');
});

test('the concept of a phrase ignores punctuation and the order of the words', () => {
  assert.equal(db.conceptKey('меню-гамбургер'), db.conceptKey('гамбургер меню'));
  assert.equal(db.conceptKey('«грубая» оценка!'), db.conceptKey('оценка грубая'));
  assert.notEqual(db.conceptKey('гамбургер меню'), db.conceptKey('гамбургер'), 'a missing word is a different meaning');
});

test('an old deck whose concepts predate the wording rules is keyed again', async () => {
  db.close();
  const file = await fixture('reconcepts', 3, [
    ['abcdef0011', 'hamburger meniu', 'гамбургер меню'],
    ['abcdef0012', 'hamburgeris meniu', 'меню-гамбургер'],
  ]);
  const handle = db.open(file);

  const rows = handle.prepare('SELECT id, concept FROM cards WHERE id LIKE ?').all('abcdef001%');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].concept, rows[1].concept, 'the ladder ends with both wordings on one meaning');
  assert.equal(rows[0].concept, db.conceptKey('гамбургер меню'));
  db.close();
  db.open();
});

test('a review is filed under the category and level of its card when it is not told them', () => {
  db.open();
  const deck = db.deckId('ru', 'et');
  db.insertCards([card('logged-1', { deck_id: deck, category: 'engineering', cefr: 'B2' })], ['logged-1']);

  db.logReview({ card_id: 'logged-1', deck_id: deck, ts: new Date().toISOString(), rating: 3 });
  db.logReview({ card_id: 'logged-1', deck_id: deck, ts: new Date().toISOString(), rating: 3, category: null, cefr: null });
  db.logReview({ card_id: 'logged-1', deck_id: deck, ts: new Date().toISOString(), rating: 3, category: 'legal', cefr: 'C1' });

  const rows = db.all('SELECT category, cefr FROM reviews WHERE card_id = ?', 'logged-1').map((row) => ({ ...row }));
  assert.deepEqual(rows.slice(0, 2), [
    { category: 'engineering', cefr: 'B2' },
    { category: 'engineering', cefr: 'B2' },
  ], 'a missing or null field is read off the card');
  assert.deepEqual(rows[2], { category: 'legal', cefr: 'C1' }, 'what the caller states is kept');
});

test('a deck can hand back the wordings it holds for each meaning', () => {
  db.open();
  const deck = db.deckId('ru', 'da');
  db.insertCards(
    [
      card('fronts-1', { deck_id: deck, front: 'hamburger meniu', back: 'гамбургер меню' }),
      card('fronts-2', { deck_id: deck, front: 'burgermenu', back: 'меню-гамбургер' }),
      card('fronts-3', { deck_id: deck, front: 'roll back', back: 'откатить' }),
    ],
    ['fronts-1', 'fronts-2', 'fronts-3'],
  );

  const fronts = db.conceptFronts(deck);
  assert.deepEqual(fronts.get(db.conceptKey('гамбургер меню')).sort(), ['burgermenu', 'hamburger meniu']);
  assert.deepEqual(fronts.get(db.conceptKey('откатить')), ['roll back']);
  assert.equal(db.conceptFronts(db.deckId('ru', 'nl')).size, 0);
});

test('narrowing the categories moves the cards left outside them to everyday', () => {
  db.open();
  const deck = db.deckId('ru', 'no');
  db.insertCards(
    [
      card('refile-1', { deck_id: deck, category: 'marketing' }),
      card('refile-2', { deck_id: deck, category: 'engineering' }),
      card('refile-3', { deck_id: deck, category: 'everyday' }),
    ],
    ['refile-1', 'refile-2', 'refile-3'],
  );

  const moved = db.refileToFallback(['engineering', 'phrasing', 'connectors', 'everyday']);
  assert.equal(moved, 1, 'only the card whose category is gone is touched');
  assert.equal(db.cardById('refile-1').category, 'everyday');
  assert.equal(db.cardById('refile-2').category, 'engineering', 'a category still on the list is left alone');
  assert.equal(db.cardById('refile-3').category, 'everyday');
  assert.equal(db.refileToFallback(['engineering', 'phrasing', 'connectors', 'everyday']), 0, 'a second pass has nothing to do');
});

test('a deck reports the meanings it already carries', () => {
  db.open();
  const deck = db.deckId('ru', 'sv');
  db.insertCards([card('concept-a', { deck_id: deck, back: 'привет' }), card('concept-b', { deck_id: deck, back: 'спасибо' })], [
    'concept-a',
    'concept-b',
  ]);
  const concepts = db.conceptsOfDeck(deck);
  assert.equal(concepts.size, 2);
  assert.ok(concepts.has(db.conceptKey('Привет')));
  assert.equal(db.conceptsOfDeck(db.deckId('ru', 'fi')).size, 0);
});

test('a deck can list the meanings it carries more than once', () => {
  db.open();
  const deck = db.deckId('ru', 'pt');
  db.insertCards(
    [
      card('twin-1', { deck_id: deck, front: 'gaining traction', back: 'набирает популярность' }),
      card('twin-2', { deck_id: deck, front: 'gain popularity', back: 'Набирает популярность ' }),
      card('twin-3', { deck_id: deck, front: 'roll back', back: 'откатить' }),
    ],
    ['twin-1', 'twin-2', 'twin-3'],
  );

  const groups = db.conceptsShared(deck);
  assert.equal(groups.length, 1, 'only the meaning that has two cards');
  assert.equal(groups[0].concept, db.conceptKey('набирает популярность'));
  assert.deepEqual(groups[0].cards.map((entry) => entry.id), ['twin-1', 'twin-2']);
  assert.equal(groups[0].cards[0].keywords.length, 1, 'the cards come back hydrated, ready to show');

  db.junkCard('twin-2', deck, 'duplicate', 'gain popularity');
  assert.deepEqual(db.conceptsShared(deck), [], 'throwing one away closes the group');
  assert.deepEqual(db.conceptsShared(db.deckId('ru', 'nb')), []);
});
