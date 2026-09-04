import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DATA, CATEGORIES, CEFR_LEVELS, LEECH_LAPSES, paths } from './store-paths.mjs';

const require = createRequire(import.meta.url);

export const DB_FILE = join(DATA, 'loanword.db');
export const SCHEMA_VERSION = 10;

export const wordsOf = (text) =>
  String(text ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

export const conceptKey = (text) =>
  createHash('sha1').update(wordsOf(text).sort().join(' ')).digest('hex').slice(0, 10);
export { LEECH_LAPSES };

const NODE_SQLITE_HELP =
  'Loanword needs Node 22.16 or newer: this build has no node:sqlite. ' +
  'Update Node (nodejs.org, or `brew upgrade node` / `nvm install --lts`) and open the trainer again.';

let sqlite;
function sqliteModule() {
  if (sqlite) return sqlite;
  const emitWarning = process.emitWarning;
  process.emitWarning = (warning, ...rest) => {
    if (String(warning).includes('SQLite is an experimental feature')) return;
    return emitWarning.call(process, warning, ...rest);
  };
  try {
    sqlite = require('node:sqlite');
  } catch {
    throw new Error(NODE_SQLITE_HELP);
  } finally {
    process.emitWarning = emitWarning;
  }
  if (!sqlite?.DatabaseSync) throw new Error(NODE_SQLITE_HELP);
  return sqlite;
}

export function sqliteAvailable() {
  try {
    sqliteModule();
    return true;
  } catch {
    return false;
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS decks (
  id      INTEGER PRIMARY KEY,
  native  TEXT NOT NULL,
  target  TEXT NOT NULL,
  UNIQUE (native, target)
);

CREATE TABLE IF NOT EXISTS cards (
  id         TEXT PRIMARY KEY,
  deck_id    INTEGER NOT NULL REFERENCES decks(id),
  type       TEXT NOT NULL DEFAULT 'phrase',
  front      TEXT NOT NULL,
  back       TEXT NOT NULL,
  keywords   TEXT NOT NULL DEFAULT '[]',
  example    TEXT NOT NULL DEFAULT '',
  pos        TEXT NOT NULL DEFAULT '',
  cefr       TEXT NOT NULL DEFAULT '',
  note       TEXT NOT NULL DEFAULT '',
  category   TEXT NOT NULL DEFAULT 'everyday',
  project    TEXT NOT NULL DEFAULT '',
  source     TEXT NOT NULL DEFAULT '',
  ts         TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  starred    INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  reading    TEXT NOT NULL DEFAULT '',
  origin_id  TEXT,
  known      INTEGER NOT NULL DEFAULT 0,
  concept    TEXT NOT NULL DEFAULT '',
  topic      TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS cards_deck        ON cards(deck_id, deleted_at);
CREATE INDEX IF NOT EXISTS cards_deck_cat    ON cards(deck_id, category, deleted_at);
CREATE INDEX IF NOT EXISTS cards_deck_cefr   ON cards(deck_id, cefr, deleted_at);
CREATE INDEX IF NOT EXISTS cards_origin      ON cards(deck_id, origin_id);
CREATE INDEX IF NOT EXISTS cards_concept     ON cards(deck_id, concept);
CREATE INDEX IF NOT EXISTS cards_deck_topic  ON cards(deck_id, topic);

CREATE TABLE IF NOT EXISTS known_words (
  target TEXT NOT NULL,
  word   TEXT NOT NULL,
  PRIMARY KEY (target, word)
);

CREATE TABLE IF NOT EXISTS fsrs_state (
  card_id        TEXT PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
  deck_id        INTEGER NOT NULL,
  due            TEXT NOT NULL,
  stability      REAL NOT NULL DEFAULT 0,
  difficulty     REAL NOT NULL DEFAULT 0,
  elapsed_days   REAL NOT NULL DEFAULT 0,
  scheduled_days REAL NOT NULL DEFAULT 0,
  reps           INTEGER NOT NULL DEFAULT 0,
  lapses         INTEGER NOT NULL DEFAULT 0,
  state          INTEGER NOT NULL DEFAULT 0,
  learning_steps INTEGER NOT NULL DEFAULT 0,
  last_review    TEXT
);
CREATE INDEX IF NOT EXISTS fsrs_due   ON fsrs_state(deck_id, due);
CREATE INDEX IF NOT EXISTS fsrs_cover ON fsrs_state(deck_id, due, stability, state);

CREATE TABLE IF NOT EXISTS reviews (
  id                INTEGER PRIMARY KEY,
  card_id           TEXT NOT NULL,
  deck_id           INTEGER NOT NULL,
  session_id        INTEGER,
  ts                TEXT NOT NULL,
  day               TEXT NOT NULL,
  hour              INTEGER NOT NULL DEFAULT 0,
  weekday           INTEGER NOT NULL DEFAULT 0,
  rating            INTEGER NOT NULL,
  mode              TEXT NOT NULL DEFAULT 'flashcards',
  category          TEXT NOT NULL DEFAULT '',
  cefr              TEXT NOT NULL DEFAULT '',
  was_new           INTEGER NOT NULL DEFAULT 0,
  duration_ms       INTEGER NOT NULL DEFAULT 0,
  elapsed_days      REAL NOT NULL DEFAULT 0,
  scheduled_days    REAL NOT NULL DEFAULT 0,
  stability_before  REAL NOT NULL DEFAULT 0,
  stability_after   REAL NOT NULL DEFAULT 0,
  difficulty_before REAL NOT NULL DEFAULT 0,
  difficulty_after  REAL NOT NULL DEFAULT 0,
  state_before      INTEGER NOT NULL DEFAULT 0,
  state_after       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS reviews_deck_ts  ON reviews(deck_id, ts);
CREATE INDEX IF NOT EXISTS reviews_deck_day  ON reviews(deck_id, day);
CREATE INDEX IF NOT EXISTS reviews_scored    ON reviews(deck_id, day, rating, was_new);
CREATE INDEX IF NOT EXISTS reviews_calendar  ON reviews(deck_id, day, was_new, duration_ms);
CREATE INDEX IF NOT EXISTS reviews_slice     ON reviews(deck_id, category, cefr, rating, was_new);
CREATE INDEX IF NOT EXISTS reviews_level     ON reviews(deck_id, cefr, rating, was_new);
CREATE INDEX IF NOT EXISTS reviews_clock     ON reviews(deck_id, day, hour, weekday, mode, duration_ms);
CREATE INDEX IF NOT EXISTS reviews_card     ON reviews(card_id, ts);
CREATE INDEX IF NOT EXISTS reviews_mode     ON reviews(deck_id, mode, day);

CREATE TABLE IF NOT EXISTS sessions (
  id          INTEGER PRIMARY KEY,
  deck_id     INTEGER NOT NULL,
  started_at  TEXT NOT NULL,
  ended_at    TEXT,
  day         TEXT NOT NULL,
  minutes     INTEGER NOT NULL DEFAULT 0,
  planned     INTEGER NOT NULL DEFAULT 0,
  reviewed    INTEGER NOT NULL DEFAULT 0,
  correct     INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS sessions_deck ON sessions(deck_id, started_at);

CREATE TABLE IF NOT EXISTS junk (
  id      INTEGER PRIMARY KEY,
  card_id TEXT NOT NULL,
  deck_id INTEGER NOT NULL,
  ts      TEXT NOT NULL,
  day     TEXT NOT NULL,
  reason  TEXT NOT NULL DEFAULT '',
  front   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS junk_deck ON junk(deck_id, day);

CREATE TABLE IF NOT EXISTS retired (front_key TEXT PRIMARY KEY);

CREATE VIEW IF NOT EXISTS daily_stats AS
SELECT deck_id,
       day,
       COUNT(*)                       AS reviews,
       SUM(was_new)                   AS new_cards,
       SUM(CASE WHEN rating >= 3 THEN 1 ELSE 0 END) AS correct,
       SUM(duration_ms)               AS duration_ms
FROM reviews
GROUP BY deck_id, day;
`;

function readJsonFile(file) {
  try {
    const value = JSON.parse(readFileSync(file, 'utf8'));
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

const MIGRATIONS = {
  3: (handle) => {
    const columns = new Set(handle.prepare('PRAGMA table_info(reviews)').all().map((row) => row.name));
    if (columns.has('category')) return;
    handle.exec("ALTER TABLE reviews ADD COLUMN category TEXT NOT NULL DEFAULT ''");
    handle.exec("ALTER TABLE reviews ADD COLUMN cefr TEXT NOT NULL DEFAULT ''");
    handle.exec(
      `UPDATE reviews SET
         category = COALESCE((SELECT c.category FROM cards c WHERE c.id = reviews.card_id), ''),
         cefr     = COALESCE((SELECT c.cefr     FROM cards c WHERE c.id = reviews.card_id), '')
       WHERE card_id <> ''`,
    );
  },

  4: (handle) => {
    handle.exec(
      `CREATE TABLE IF NOT EXISTS known_words (
         target TEXT NOT NULL,
         word   TEXT NOT NULL,
         PRIMARY KEY (target, word)
       )`,
    );
    const stored = readJsonFile(paths.known);
    if (!stored) return;
    const insert = handle.prepare('INSERT OR IGNORE INTO known_words (target, word) VALUES (?, ?)');
    const rows = Array.isArray(stored) ? { '': stored } : stored;
    for (const [target, words] of Object.entries(rows)) {
      if (!Array.isArray(words)) continue;
      for (const word of words) {
        if (typeof word === 'string' && word.trim()) insert.run(target, word.toLowerCase());
      }
    }
  },

  5: (handle) => {
    const columns = new Set(handle.prepare('PRAGMA table_info(cards)').all().map((row) => row.name));
    if (!columns.has('reading')) handle.exec("ALTER TABLE cards ADD COLUMN reading TEXT NOT NULL DEFAULT ''");
  },

  6: (handle) => {
    const columns = new Set(handle.prepare('PRAGMA table_info(cards)').all().map((row) => row.name));
    if (!columns.has('origin_id')) handle.exec('ALTER TABLE cards ADD COLUMN origin_id TEXT');
    handle.exec('CREATE INDEX IF NOT EXISTS cards_origin ON cards(deck_id, origin_id)');
  },

  7: (handle) => {
    const columns = new Set(handle.prepare('PRAGMA table_info(cards)').all().map((row) => row.name));
    if (!columns.has('known')) handle.exec('ALTER TABLE cards ADD COLUMN known INTEGER NOT NULL DEFAULT 0');
  },

  8: (handle) => {
    const columns = new Set(handle.prepare('PRAGMA table_info(cards)').all().map((row) => row.name));
    if (!columns.has('concept')) handle.exec("ALTER TABLE cards ADD COLUMN concept TEXT NOT NULL DEFAULT ''");
    handle.exec('CREATE INDEX IF NOT EXISTS cards_concept ON cards(deck_id, concept)');
    const fill = handle.prepare('UPDATE cards SET concept = ? WHERE id = ?');
    for (const row of handle.prepare('SELECT id, back FROM cards').all()) fill.run(conceptKey(row.back), row.id);
  },

  9: (handle) => {
    const fill = handle.prepare('UPDATE cards SET concept = ? WHERE id = ?');
    for (const row of handle.prepare('SELECT id, back FROM cards').all()) fill.run(conceptKey(row.back), row.id);
  },

  10: (handle) => {
    const columns = new Set(handle.prepare('PRAGMA table_info(cards)').all().map((row) => row.name));
    if (!columns.has('topic')) handle.exec("ALTER TABLE cards ADD COLUMN topic TEXT NOT NULL DEFAULT ''");
    handle.exec('CREATE INDEX IF NOT EXISTS cards_deck_topic ON cards(deck_id, topic)');
  },
};

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

function backupDatabase(handle, file) {
  const dir = join(paths.backups, stamp());
  mkdirSync(dir, { recursive: true });
  const to = join(dir, 'loanword.db');
  try {
    handle.exec(`VACUUM INTO '${to.replace(/'/g, "''")}'`);
  } catch {
    copyFileSync(file, to);
  }
  return to;
}

function versionOf(handle) {
  const table = (name) =>
    handle.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(name);
  if (!table('reviews')) return SCHEMA_VERSION;
  if (table('schema_version')) {
    const row = handle.prepare('SELECT version FROM schema_version LIMIT 1').get();
    const version = Number(row?.version);
    if (Number.isFinite(version) && version > 0) return version;
  }
  const columns = new Set(handle.prepare('PRAGMA table_info(reviews)').all().map((row) => row.name));
  return columns.has('category') ? 3 : 2;
}

let lastBackup = null;

function climb(handle, file) {
  const from = versionOf(handle);
  if (from >= SCHEMA_VERSION) return null;

  lastBackup = existsSync(file) && statSync(file).size ? backupDatabase(handle, file) : null;

  for (let version = from + 1; version <= SCHEMA_VERSION; version++) {
    const step = MIGRATIONS[version];
    if (!step) continue;
    handle.exec('BEGIN IMMEDIATE');
    try {
      step(handle);
      handle.exec('COMMIT');
    } catch (error) {
      try {
        handle.exec('ROLLBACK');
      } catch {
      }
      throw error;
    }
  }

  if (existsSync(paths.known)) {
    try {
      renameSync(paths.known, `${paths.known}.migrated`);
    } catch {
    }
  }
  return lastBackup;
}

let handle = null;
let statements = new Map();

export function open(file = DB_FILE) {
  if (handle) return handle;
  const { DatabaseSync } = sqliteModule();
  mkdirSync(dirname(file), { recursive: true });
  handle = new DatabaseSync(file);
  handle.exec('PRAGMA journal_mode = WAL');
  handle.exec('PRAGMA synchronous = NORMAL');
  handle.exec('PRAGMA foreign_keys = ON');
  handle.exec('PRAGMA busy_timeout = 8000');
  climb(handle, file);
  handle.exec(SCHEMA);
  const row = handle.prepare('SELECT version FROM schema_version LIMIT 1').get();
  if (!row) handle.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
  else if (row.version !== SCHEMA_VERSION) {
    handle.prepare('UPDATE schema_version SET version = ?').run(SCHEMA_VERSION);
  }
  return handle;
}

export function close() {
  if (!handle) return;
  statements.clear();
  try {
    handle.close();
  } catch {
  }
  handle = null;
}

function stmt(sql) {
  let prepared = statements.get(sql);
  if (!prepared) {
    prepared = open().prepare(sql);
    statements.set(sql, prepared);
  }
  return prepared;
}

export const run = (sql, ...params) => stmt(sql).run(...params);
export const get = (sql, ...params) => stmt(sql).get(...params);
export const all = (sql, ...params) => stmt(sql).all(...params);

export function tx(work) {
  const db = open();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
    }
    throw error;
  }
}

export function localDay(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const localHour = (value = new Date()) => new Date(value).getHours();
const localWeekday = (value = new Date()) => new Date(value).getDay();

export function deckId(native, target) {
  const found = get('SELECT id FROM decks WHERE native = ? AND target = ?', native, target);
  if (found) return found.id;
  run('INSERT OR IGNORE INTO decks (native, target) VALUES (?, ?)', native, target);
  return get('SELECT id FROM decks WHERE native = ? AND target = ?', native, target).id;
}

export const deckIdIfAny = (native, target) =>
  get('SELECT id FROM decks WHERE native = ? AND target = ?', native, target)?.id ?? null;

export function deckPairsWithCounts() {
  return plain(all(`
    SELECT d.native, d.target, COUNT(c.id) AS total,
           COALESCE(SUM(s.due IS NOT NULL AND s.due <= ?), 0) AS due
    FROM decks d
    LEFT JOIN cards c ON c.deck_id = d.id AND c.deleted_at IS NULL
    LEFT JOIN fsrs_state s ON s.card_id = c.id
    GROUP BY d.id
    ORDER BY d.native, d.target`, new Date().toISOString()));
}

const plain = (rows) => rows.map((row) => ({ ...row }));

const CARD_COLUMNS =
  'id, deck_id, type, front, back, keywords, example, pos, cefr, note, category, project, source, ts, created_at, starred, reading, origin_id, known, concept, topic';

const NO_KEYWORDS = [];

function hydrate(row) {
  if (!row) return null;
  const raw = row.keywords;
  let keywords = NO_KEYWORDS;
  if (raw && raw !== '[]') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) keywords = parsed.filter((word) => typeof word === 'string');
    } catch {
      keywords = NO_KEYWORDS;
    }
  }
  row.keywords = keywords;
  row.starred = !!row.starred;
  row.isFavorite = row.starred;
  row.isKnown = !!row.known;
  delete row.known;
  return row;
}

export function insertCards(rows, ids) {
  if (!rows.length) return 0;
  const insert = stmt(`
    INSERT OR IGNORE INTO cards
      (${CARD_COLUMNS}, deleted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`);
  let added = 0;
  for (let i = 0; i < rows.length; i++) {
    const card = rows[i];
    const changes = insert.run(
      ids[i],
      card.deck_id,
      card.type || 'phrase',
      card.front,
      card.back,
      JSON.stringify(card.keywords || []),
      card.example || '',
      card.pos || '',
      card.cefr || '',
      card.note || '',
      card.category || 'everyday',
      card.project || '',
      card.source || '',
      card.ts || '',
      card.created_at || new Date().toISOString(),
      card.starred ? 1 : 0,
      card.reading || '',
      card.origin_id || null,
      card.known ? 1 : 0,
      card.concept || conceptKey(card.back),
      card.topic || '',
    ).changes;
    added += Number(changes);
  }
  return added;
}

export const cardsOfDeck = (deck) =>
  all(`SELECT ${CARD_COLUMNS} FROM cards WHERE deck_id = ? AND deleted_at IS NULL ORDER BY created_at, id`, deck).map(
    hydrate,
  );

export const allLiveCards = () =>
  all(
    `SELECT c.${CARD_COLUMNS.split(', ').join(', c.')}, d.native, d.target
     FROM cards c JOIN decks d ON d.id = c.deck_id
     WHERE c.deleted_at IS NULL ORDER BY c.created_at, c.id`,
  ).map(hydrate);

export const cardById = (id) => hydrate(get(`SELECT ${CARD_COLUMNS} FROM cards WHERE id = ?`, id));

export const cardExists = (id) => !!get('SELECT 1 AS ok FROM cards WHERE id = ? AND deleted_at IS NULL', id);

export const originsOfDeck = (deck) =>
  new Set(
    all('SELECT origin_id FROM cards WHERE deck_id = ? AND origin_id IS NOT NULL', deck).map(
      (row) => row.origin_id,
    ),
  );

export const countCards = (deck) =>
  get('SELECT COUNT(*) AS n FROM cards WHERE deck_id = ? AND deleted_at IS NULL', deck).n;

export const totalCards = () => get('SELECT COUNT(*) AS n FROM cards WHERE deleted_at IS NULL').n;

const EDITABLE = new Set(['front', 'back', 'example', 'note', 'category', 'cefr', 'pos', 'type', 'reading', 'topic']);

export function updateCard(id, patch) {
  const fields = Object.entries(patch).filter(([key]) => EDITABLE.has(key));
  if (!fields.length) return false;
  if (typeof patch.back === 'string') fields.push(['concept', conceptKey(patch.back)]);
  const sql = `UPDATE cards SET ${fields.map(([key]) => `${key} = ?`).join(', ')} WHERE id = ?`;
  return Number(run(sql, ...fields.map(([, value]) => String(value ?? '')), id).changes) > 0;
}

export function rewriteCard(id, patch) {
  const fields = { ...patch };
  if (Array.isArray(fields.keywords)) fields.keywords = JSON.stringify(fields.keywords);
  if (typeof fields.back === 'string') fields.concept = conceptKey(fields.back);
  const allowed = ['front', 'back', 'concept', 'example', 'note', 'keywords', 'reading', 'topic'].filter(
    (key) => fields[key] !== undefined,
  );
  if (!allowed.length) return false;
  const sql = `UPDATE cards SET ${allowed.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`;
  return Number(run(sql, ...allowed.map((key) => String(fields[key] ?? '')), id).changes) > 0;
}

export const setStar = (id, on) => run('UPDATE cards SET starred = ? WHERE id = ?', on ? 1 : 0, id);

export function conceptsShared(deck) {
  const rows = all(
    `SELECT ${CARD_COLUMNS} FROM cards
     WHERE deck_id = ? AND deleted_at IS NULL AND concept != ''
       AND concept IN (
         SELECT concept FROM cards
         WHERE deck_id = ? AND deleted_at IS NULL AND concept != ''
         GROUP BY concept HAVING COUNT(*) > 1)
     ORDER BY concept, created_at, id`,
    deck,
    deck,
  ).map(hydrate);

  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.concept)) groups.set(row.concept, { concept: row.concept, meaning: row.back, cards: [] });
    groups.get(row.concept).cards.push(row);
  }
  return [...groups.values()];
}

export function refileToFallback(allowed, fallback = 'everyday') {
  const keys = [...new Set([...allowed, fallback])];
  const holes = keys.map(() => '?').join(',');
  return Number(
    run(
      `UPDATE cards SET category = ? WHERE deleted_at IS NULL AND category NOT IN (${holes})`,
      fallback,
      ...keys,
    ).changes,
  );
}

export function conceptFronts(deck) {
  const map = new Map();
  for (const row of all(
    "SELECT concept, front FROM cards WHERE deck_id = ? AND deleted_at IS NULL AND concept != ''",
    deck,
  )) {
    if (!map.has(row.concept)) map.set(row.concept, []);
    map.get(row.concept).push(row.front);
  }
  return map;
}

export const conceptsOfDeck = (deck) =>
  new Set(
    all("SELECT DISTINCT concept FROM cards WHERE deck_id = ? AND deleted_at IS NULL AND concept != ''", deck).map(
      (row) => row.concept,
    ),
  );

export function setFiling(id, { category, topic } = {}) {
  const fields = [];
  if (typeof category === 'string') fields.push(['category', category]);
  if (typeof topic === 'string') fields.push(['topic', topic]);
  if (!fields.length) return false;
  const sql = `UPDATE cards SET ${fields.map(([key]) => `${key} = ?`).join(', ')} WHERE id = ?`;
  return Number(run(sql, ...fields.map(([, value]) => value), id).changes) > 0;
}

export const renameTopic = (deck, category, from, to) =>
  Number(
    run(
      'UPDATE cards SET topic = ? WHERE deck_id = ? AND category = ? AND topic = ? AND deleted_at IS NULL',
      to,
      deck,
      category,
      from,
    ).changes,
  );

export const topicsOf = (deck) =>
  plain(
    all(
      `SELECT category, topic, COUNT(*) AS n FROM cards
       WHERE deck_id = ? AND deleted_at IS NULL AND topic != ''
       GROUP BY category, topic ORDER BY n DESC, topic`,
      deck,
    ),
  );

export const setKnown = (id, on) => run('UPDATE cards SET known = ? WHERE id = ?', on ? 1 : 0, id);

export const knownWordsOf = (target) =>
  new Set(all('SELECT word FROM known_words WHERE target = ?', target).map((row) => row.word));

export function addKnownWords(target, words) {
  const insert = stmt('INSERT OR IGNORE INTO known_words (target, word) VALUES (?, ?)');
  for (const word of words) {
    if (typeof word === 'string' && word.trim()) insert.run(target, word.toLowerCase());
  }
}

const PEEK_COLUMNS = `c.front AS front, c.back AS back, c.reading AS reading, c.example AS example,
            c.cefr AS cefr, c.starred AS starred,
            s.stability AS stability, s.due AS due, s.lapses AS lapses, s.reps AS reps`;

const peekRow = (row) => ({ ...row, starred: !!row.starred, seen: (row.reps || 0) > 0 });

export const peekStarred = (deck, limit) =>
  all(
    `SELECT ${PEEK_COLUMNS}
     FROM cards c LEFT JOIN fsrs_state s ON s.card_id = c.id
     WHERE c.deck_id = ? AND c.deleted_at IS NULL AND c.starred = 1
     ORDER BY s.due IS NULL, s.due LIMIT ?`,
    deck,
    limit,
  ).map(peekRow);

export const peekLeeches = (deck, limit) =>
  all(
    `SELECT ${PEEK_COLUMNS}
     FROM cards c JOIN fsrs_state s ON s.card_id = c.id
     WHERE c.deck_id = ? AND c.deleted_at IS NULL AND s.lapses >= ?
     ORDER BY s.due LIMIT ?`,
    deck,
    LEECH_LAPSES,
    limit,
  ).map(peekRow);

export const peekWeakest = (deck, limit) =>
  all(
    `SELECT ${PEEK_COLUMNS}
     FROM cards c JOIN fsrs_state s ON s.card_id = c.id
     WHERE c.deck_id = ? AND c.deleted_at IS NULL AND s.reps > 0
     ORDER BY s.due LIMIT ?`,
    deck,
    limit,
  ).map(peekRow);

export const peekUnseen = (deck, limit) =>
  all(
    `SELECT ${PEEK_COLUMNS}
     FROM cards c LEFT JOIN fsrs_state s ON s.card_id = c.id
     WHERE c.deck_id = ? AND c.deleted_at IS NULL AND s.card_id IS NULL
     ORDER BY c.created_at DESC LIMIT ?`,
    deck,
    limit,
  ).map(peekRow);

export const weakestFronts = (deck, limit) =>
  all(
    `SELECT c.front AS front, s.stability AS stability, s.due AS due
     FROM cards c JOIN fsrs_state s ON s.card_id = c.id
     WHERE c.deck_id = ? AND c.deleted_at IS NULL AND s.reps > 0
     ORDER BY s.due LIMIT ?`,
    deck,
    limit,
  ).map((row) => ({ ...row }));

const STATE_COLUMNS =
  'card_id, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, learning_steps, last_review';

export function stateOfDeck(deck) {
  const map = new Map();
  for (const row of all(`SELECT ${STATE_COLUMNS} FROM fsrs_state WHERE deck_id = ?`, deck)) {
    map.set(row.card_id, row);
  }
  return map;
}

export const stateOfCard = (id) => get(`SELECT ${STATE_COLUMNS} FROM fsrs_state WHERE card_id = ?`, id) || null;

export function saveState(cardId, deck, card) {
  run(
    `INSERT INTO fsrs_state (card_id, deck_id, due, stability, difficulty, elapsed_days, scheduled_days,
                             reps, lapses, state, learning_steps, last_review)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(card_id) DO UPDATE SET
       deck_id = excluded.deck_id, due = excluded.due, stability = excluded.stability,
       difficulty = excluded.difficulty, elapsed_days = excluded.elapsed_days,
       scheduled_days = excluded.scheduled_days, reps = excluded.reps, lapses = excluded.lapses,
       state = excluded.state, learning_steps = excluded.learning_steps, last_review = excluded.last_review`,
    cardId,
    deck,
    iso(card.due),
    Number(card.stability) || 0,
    Number(card.difficulty) || 0,
    Number(card.elapsed_days) || 0,
    Number(card.scheduled_days) || 0,
    Number(card.reps) || 0,
    Number(card.lapses) || 0,
    Number(card.state) || 0,
    Number(card.learning_steps) || 0,
    card.last_review ? iso(card.last_review) : null,
  );
}

export const iso = (value) => {
  if (!value) return new Date().toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

const NO_SLICE = { category: '', cefr: '' };

const slice = (id) =>
  (id && get('SELECT category, cefr FROM cards WHERE id = ?', id)) || NO_SLICE;

export function logReview(row) {
  const when = row.ts ? new Date(row.ts) : new Date();
  const filed = row.category == null || row.cefr == null ? slice(row.card_id) : NO_SLICE;
  return Number(
    run(
      `INSERT INTO reviews (card_id, deck_id, session_id, ts, day, hour, weekday, rating, mode,
                            category, cefr, was_new,
                            duration_ms, elapsed_days, scheduled_days, stability_before, stability_after,
                            difficulty_before, difficulty_after, state_before, state_after)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.card_id,
      row.deck_id,
      row.session_id ?? null,
      when.toISOString(),
      localDay(when),
      localHour(when),
      localWeekday(when),
      row.rating,
      row.mode || 'flashcards',
      row.category ?? filed.category,
      row.cefr ?? filed.cefr,
      row.was_new ? 1 : 0,
      Math.max(0, Math.min(600_000, Math.round(Number(row.duration_ms) || 0))),
      Number(row.elapsed_days) || 0,
      Number(row.scheduled_days) || 0,
      Number(row.stability_before) || 0,
      Number(row.stability_after) || 0,
      Number(row.difficulty_before) || 0,
      Number(row.difficulty_after) || 0,
      Number(row.state_before) || 0,
      Number(row.state_after) || 0,
    ).lastInsertRowid,
  );
}

export const reviewedTodayWithMode = (cardId, mode, day = localDay()) =>
  !!get('SELECT 1 AS ok FROM reviews WHERE card_id = ? AND mode = ? AND day = ?', cardId, mode, day);

export const countReviewsWithMode = (deck, mode, from) =>
  get('SELECT COUNT(*) AS n FROM reviews WHERE deck_id = ? AND mode = ? AND day >= ?', deck, mode, from).n;

export const newCardsToday = (deck, day = localDay()) =>
  get('SELECT COUNT(*) AS n FROM reviews WHERE deck_id = ? AND day = ? AND was_new = 1', deck, day).n;

export const reviewsToday = (deck, day = localDay()) =>
  get('SELECT COUNT(*) AS n FROM reviews WHERE deck_id = ? AND day = ?', deck, day).n;

export function openSession(deck, minutes, planned) {
  const now = new Date();
  return Number(
    run(
      'INSERT INTO sessions (deck_id, started_at, day, minutes, planned) VALUES (?, ?, ?, ?, ?)',
      deck,
      now.toISOString(),
      localDay(now),
      Math.max(0, Math.min(120, Math.round(Number(minutes) || 0))),
      Math.max(0, Math.min(2000, Math.round(Number(planned) || 0))),
    ).lastInsertRowid,
  );
}

export function closeSession(id) {
  const totals = get(
    'SELECT COUNT(*) AS reviewed, SUM(CASE WHEN rating >= 3 THEN 1 ELSE 0 END) AS correct, SUM(duration_ms) AS ms FROM reviews WHERE session_id = ?',
    id,
  );
  run(
    'UPDATE sessions SET ended_at = ?, reviewed = ?, correct = ?, duration_ms = ? WHERE id = ?',
    new Date().toISOString(),
    totals.reviewed || 0,
    totals.correct || 0,
    totals.ms || 0,
    id,
  );
  return get('SELECT * FROM sessions WHERE id = ?', id);
}

export function junkCard(id, deck, reason, front) {
  const now = new Date();
  run('UPDATE cards SET deleted_at = ? WHERE id = ?', now.toISOString(), id);
  run(
    'INSERT INTO junk (card_id, deck_id, ts, day, reason, front) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    deck,
    now.toISOString(),
    localDay(now),
    String(reason || '').slice(0, 200),
    String(front || '').slice(0, 200),
  );
}

export function deleteDeckCards(deck, now = new Date()) {
  return Number(
    run('UPDATE cards SET deleted_at = ? WHERE deck_id = ? AND deleted_at IS NULL', now.toISOString(), deck).changes,
  );
}

export function restoreCard(id) {
  run('UPDATE cards SET deleted_at = NULL WHERE id = ?', id);
  run('DELETE FROM junk WHERE card_id = ?', id);
  const card = get('SELECT front FROM cards WHERE id = ?', id);
  if (card) run('DELETE FROM retired WHERE front_key = ?', retireKey(card.front));
}

export const retireKey = (text) => String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();

export const retire = (front) => run('INSERT OR IGNORE INTO retired (front_key) VALUES (?)', retireKey(front));

export const isRetired = (front) => !!get('SELECT 1 AS ok FROM retired WHERE front_key = ?', retireKey(front));

export const junkRate = (deck) => {
  const junked = get('SELECT COUNT(*) AS n FROM junk WHERE deck_id = ?', deck).n;
  const live = countCards(deck);
  const seen = junked + live;
  return seen ? junked / seen : 0;
};

export { CATEGORIES, CEFR_LEVELS };
