// Shared file layout. JSONL until ~50k cards; SQLite is a v0.3 problem.
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGIN_ROOT =
  process.env.CLAUDE_PLUGIN_ROOT || dirname(dirname(fileURLToPath(import.meta.url)));

export const DATA =
  process.env.CLAUDE_PLUGIN_DATA || join(homedir(), '.claude', 'plugins', 'data', 'loanword');

export const paths = {
  queue: join(DATA, 'queue.jsonl'),
  cards: join(DATA, 'cards.jsonl'),
  state: join(DATA, 'state.json'),
  known: join(DATA, 'known_words.json'),
  log: join(DATA, 'log.txt'),
  pending: join(DATA, 'pending'),
  exportCsv: join(DATA, 'export', 'loanword.csv'),
};

function ensureData() {
  mkdirSync(DATA, { recursive: true });
}

export function log(message) {
  try {
    ensureData();
    appendFileSync(paths.log, `${new Date().toISOString()} ${message}\n`);
  } catch {
    // Logging is the last line of defence and must never throw.
  }
}

export function config() {
  const env = process.env;
  const limit = Number(env.CLAUDE_PLUGIN_OPTION_DAILY_LIMIT);
  return {
    native: (env.CLAUDE_PLUGIN_OPTION_NATIVE_LANG || 'es').toLowerCase(),
    target: (env.CLAUDE_PLUGIN_OPTION_TARGET_LANG || 'en').toLowerCase(),
    mode: (env.CLAUDE_PLUGIN_OPTION_MODE || 'both').toLowerCase(),
    dailyLimit: Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 500) : 15,
    autoBuild: env.CLAUDE_PLUGIN_OPTION_AUTO_BUILD !== 'false',
  };
}

export function fileSize(file) {
  try {
    return statSync(file).size;
  } catch {
    return 0;
  }
}

export async function readStdin() {
  if (process.stdin.isTTY) return '';
  let buffer = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) buffer += chunk;
  return buffer;
}

export function readJsonl(file) {
  if (!existsSync(file)) return [];
  const rows = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row && typeof row === 'object') rows.push(row);
    } catch {
      // A torn line from a crashed append: skip it, keep the rest.
    }
  }
  return rows;
}

export function appendJsonl(file, rows) {
  if (!rows.length) return;
  ensureData();
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
}

export function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  try {
    const value = JSON.parse(readFileSync(file, 'utf8'));
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

/** Atomic: state.json is rewritten on every grade, and a torn file loses all progress. */
export function writeJson(file, value) {
  ensureData();
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(value));
  renameSync(temp, file);
}

/** Derived from content, not assigned on write, so re-adding a card is idempotent. */
export function cardId(card) {
  return createHash('sha1').update(`${card.front} ${card.back}`).digest('hex').slice(0, 10);
}

// The deck is re-read on every request. Reusing the parsed array while the file
// is untouched keeps a review session from re-parsing megabytes per keystroke.
// Callers must treat the result as read-only.
let cardCache = { key: null, cards: [] };

export function loadCards() {
  let key = null;
  try {
    const { size, mtimeMs } = statSync(paths.cards);
    key = `${size}:${mtimeMs}`;
    if (key === cardCache.key) return cardCache.cards;
  } catch {
    key = null; // no file yet
  }

  const seen = new Set();
  const cards = [];
  for (const card of readJsonl(paths.cards)) {
    if (typeof card.front !== 'string' || typeof card.back !== 'string') continue;
    if (!card.front.trim() || !card.back.trim()) continue;
    const id = cardId(card);
    if (seen.has(id)) continue;
    seen.add(id);
    cards.push({ ...card, id });
  }
  cardCache = { key, cards };
  return cards;
}

export function knownWords() {
  const stored = readJson(paths.known, []);
  if (!Array.isArray(stored)) return new Set();
  return new Set(stored.filter((word) => typeof word === 'string').map((word) => word.toLowerCase()));
}

export function ymd(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/** $HOME becomes ~ so stored project paths carry no username. */
export function tildify(path) {
  const home = homedir();
  return typeof path === 'string' && path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

const MAX_FIELD_LENGTH = 2000;

function text(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, MAX_FIELD_LENGTH);
}

/**
 * Commit a batch from card-builder: attach provenance, append, retire the queue.
 * Done by script rather than by the model so a malformed reply cannot corrupt the deck.
 */
export function commit(newCards) {
  if (!Array.isArray(newCards)) throw new TypeError('commit expects a JSON array of cards');

  const queue = readJsonl(paths.queue);
  const mostRecent = queue[queue.length - 1] || {};

  const provenanceOf = (card) => {
    const needle = card.front.toLowerCase();
    return (
      queue.find(
        (row) =>
          (typeof row.text === 'string' && row.text.toLowerCase() === needle) ||
          (Array.isArray(row.words) && row.words.includes(needle)),
      ) || mostRecent
    );
  };

  const stamped = [];
  for (const card of newCards) {
    if (!card || typeof card !== 'object') continue;
    const front = text(card.front);
    const back = text(card.back);
    if (!front || !back) continue;
    const source = provenanceOf({ front });
    stamped.push({
      type: card.type === 'word' ? 'word' : 'phrase',
      front,
      back,
      keywords: (Array.isArray(card.keywords) ? card.keywords : [])
        .filter((word) => typeof word === 'string')
        .map((word) => text(word))
        .filter(Boolean),
      example: text(card.example),
      pos: text(card.pos),
      cefr: text(card.cefr),
      ts: text(source.ts) || new Date().toISOString(),
      project: text(source.project),
    });
  }
  appendJsonl(paths.cards, stamped);

  // Everything the queue offered counts as seen, including what the agent
  // rejected — otherwise rejected junk is re-captured every session.
  const known = knownWords();
  for (const row of queue) {
    for (const word of row.words || []) if (typeof word === 'string') known.add(word.toLowerCase());
  }
  for (const card of stamped) {
    if (card.type === 'word') known.add(card.front.toLowerCase());
    for (const keyword of card.keywords) known.add(keyword.toLowerCase());
  }
  writeJson(paths.known, [...known].sort());

  writeFileSync(paths.queue, '');
  if (existsSync(paths.pending)) rmSync(paths.pending);
  return { added: stamped.length, queueCleared: queue.length, cards: stamped };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [command] = process.argv.slice(2);
  if (command === 'commit') {
    const raw = (await readStdin()).trim().replace(/^```(?:json)?\s*|\s*```$/g, ''); // tolerate a fenced reply
    console.log(JSON.stringify(commit(JSON.parse(raw || '[]')), null, 2));
  } else if (command === 'queue') {
    console.log(JSON.stringify({ file: paths.queue, entries: readJsonl(paths.queue).length }));
  } else {
    console.log(JSON.stringify({ DATA, paths }, null, 2));
  }
}
