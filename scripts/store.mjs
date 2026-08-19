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
  settings: join(DATA, 'settings.json'),
  log: join(DATA, 'log.txt'),
  pending: join(DATA, 'pending'),
  exportCsv: join(DATA, 'export', 'loanword.csv'),
};

/**
 * Six domains, because that is how work vocabulary actually splits, and because
 * a taxonomy the card-builder has to guess at produces noise. `everyday` is the
 * fallback: an unplaceable card lands there rather than in a seventh bucket
 * nobody browses.
 */
export const CATEGORIES = ['engineering', 'process', 'collaboration', 'phrasing', 'connectors', 'everyday'];

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

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

const MODES = ['active', 'passive', 'both'];
const THEMES = ['light', 'dark', 'system'];
const STUDY_MODES = ['flashcards', 'learn'];
const LANG_CODE = /^[a-z]{2}$/;

/** The plugin's install-time answers. Overridden by anything the user later changes in the UI. */
function envConfig() {
  const env = process.env;
  const limit = Number(env.CLAUDE_PLUGIN_OPTION_DAILY_LIMIT);
  const level = String(env.CLAUDE_PLUGIN_OPTION_LEVEL || '').toUpperCase();
  return {
    native: (env.CLAUDE_PLUGIN_OPTION_NATIVE_LANG || 'es').toLowerCase().slice(0, 2),
    target: (env.CLAUDE_PLUGIN_OPTION_TARGET_LANG || 'en').toLowerCase().slice(0, 2),
    mode: MODES.includes((env.CLAUDE_PLUGIN_OPTION_MODE || '').toLowerCase())
      ? env.CLAUDE_PLUGIN_OPTION_MODE.toLowerCase()
      : 'both',
    dailyLimit: Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 500) : 15,
    autoBuild: env.CLAUDE_PLUGIN_OPTION_AUTO_BUILD !== 'false',
    level: CEFR_LEVELS.includes(level) ? level : '',
    theme: 'system',
    studyMode: 'flashcards',
    // '' means "follow my native language". An explicit code pins the
    // interface regardless of which pair is being studied.
    uiLang: '',
    vault: String(env.CLAUDE_PLUGIN_OPTION_OBSIDIAN_VAULT || '').trim(),
  };
}

/**
 * Every value the UI is allowed to write, with the rule that decides whether an
 * incoming value survives. Anything not listed here is dropped: the settings
 * file is written by a browser, so it is untrusted input like any other.
 */
const SETTING_RULES = {
  native: (v) => (typeof v === 'string' && LANG_CODE.test(v.toLowerCase()) ? v.toLowerCase() : undefined),
  target: (v) => (typeof v === 'string' && LANG_CODE.test(v.toLowerCase()) ? v.toLowerCase() : undefined),
  mode: (v) => (MODES.includes(v) ? v : undefined),
  dailyLimit: (v) => (Number.isFinite(v) && v >= 3 ? Math.min(Math.floor(v), 500) : undefined),
  autoBuild: (v) => (typeof v === 'boolean' ? v : undefined),
  level: (v) => (v === '' || CEFR_LEVELS.includes(v) ? v : undefined),
  theme: (v) => (THEMES.includes(v) ? v : undefined),
  studyMode: (v) => (STUDY_MODES.includes(v) ? v : undefined),
  uiLang: (v) => (v === '' || (typeof v === 'string' && LANG_CODE.test(v.toLowerCase())) ? String(v).toLowerCase() : undefined),
  // A filesystem path the user types. Nothing is written until the export
  // itself confirms the directory exists, so this only has to be a sane string.
  vault: (v) =>
    typeof v === 'string' && v.length <= 4096 && !v.includes('\u0000') ? v.trim() : undefined,
};

/** Keeps only recognised, well-formed values; a bad one falls back rather than poisoning the config. */
export function sanitizeSettings(input) {
  const clean = {};
  if (!input || typeof input !== 'object') return clean;
  for (const [key, rule] of Object.entries(SETTING_RULES)) {
    const value = rule(input[key]);
    if (value !== undefined) clean[key] = value;
  }
  return clean;
}

export function config() {
  return { ...envConfig(), ...sanitizeSettings(readJson(paths.settings, {})) };
}

export const isPair = (pair) =>
  !!pair && LANG_CODE.test(String(pair.native)) && LANG_CODE.test(String(pair.target));

export const samePair = (a, b) => !!a && !!b && a.native === b.native && a.target === b.target;

export const pairKey = (pair) => `${pair.native}>${pair.target}`;

/**
 * Which deck an unstamped card belongs to. Cards written before decks were
 * per-pair carry no language, and the only moment that information exists is
 * the moment the user first changes the pair — `saveSettings` records it then.
 */
export function fallbackPair() {
  const stored = readJson(paths.settings, {});
  if (isPair(stored?.legacyPair)) {
    return { native: stored.legacyPair.native, target: stored.legacyPair.target };
  }
  const cfg = config();
  return { native: cfg.native, target: cfg.target };
}

/** Merges a patch into settings.json and returns the resulting effective config. */
export function saveSettings(patch) {
  const raw = readJson(paths.settings, {});
  const clean = sanitizeSettings(patch);
  const before = config();
  const merged = { ...sanitizeSettings(raw), ...clean };

  // legacyPair is recorded by the system, never accepted from a request body,
  // so it has to be carried across the sanitize.
  if (isPair(raw?.legacyPair)) merged.legacyPair = raw.legacyPair;

  const switchingPair =
    (clean.native && clean.native !== before.native) || (clean.target && clean.target !== before.target);
  if (switchingPair && !merged.legacyPair && loadCards().some((card) => !card.target)) {
    merged.legacyPair = { native: before.native, target: before.target };
  }

  writeJson(paths.settings, merged);
  return config();
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

/**
 * Derived from content, not assigned on write, so re-adding a card is
 * idempotent. The language pair joins the hash only when the card carries one,
 * which keeps every id written before decks were per-pair exactly where it was
 * — the FSRS state file is keyed by these.
 */
export function cardId(card) {
  const pair = card.target ? ` ${card.native || ''}>${card.target}` : '';
  return createHash('sha1').update(`${card.front} ${card.back}${pair}`).digest('hex').slice(0, 10);
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
    // Cards written before categories existed still have to land in a real
    // bucket, or the deck browser grows a phantom filter.
    cards.push({ ...card, id, category: normalizeCategory(card.category), cefr: normalizeCefr(card.cefr) });
  }
  cardCache = { key, cards };
  return cards;
}

const wordSet = (list) =>
  new Set((Array.isArray(list) ? list : []).filter((w) => typeof w === 'string').map((w) => w.toLowerCase()));

/**
 * Known words are per target language: having met "however" in English says
 * nothing about Polish, and a shared list would silently starve every deck
 * after the first.
 */
export function knownWords(target = config().target) {
  const stored = readJson(paths.known, {});
  // v0.1 wrote one flat array, for whichever target was active back then.
  if (Array.isArray(stored)) return target === fallbackPair().target ? wordSet(stored) : new Set();
  return wordSet(stored?.[target]);
}

export function saveKnownWords(target, words) {
  const stored = readJson(paths.known, {});
  const map = Array.isArray(stored)
    ? { [fallbackPair().target]: stored }
    : stored && typeof stored === 'object'
      ? { ...stored }
      : {};
  map[target] = [...words].sort();
  writeJson(paths.known, map);
}

/** Every deck sitting on disk, newest-written first, with its size. */
export function deckPairs(cards = loadCards()) {
  const legacy = fallbackPair();
  const seen = new Map();
  for (const card of cards) {
    const pair = card.target ? { native: card.native || legacy.native, target: card.target } : legacy;
    const key = pairKey(pair);
    const entry = seen.get(key) || { ...pair, total: 0 };
    entry.total++;
    seen.set(key, entry);
  }
  return [...seen.values()];
}

/** The cards belonging to one language pair; the others stay on disk, untouched. */
export function cardsForPair(pair, cards = loadCards()) {
  const legacy = fallbackPair();
  return cards.filter((card) =>
    card.target
      ? card.target === pair.target && (card.native || legacy.native) === pair.native
      : samePair(legacy, pair),
  );
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

export function normalizeCategory(value) {
  const category = String(value || '').toLowerCase().trim();
  return CATEGORIES.includes(category) ? category : 'everyday';
}

/** '' rather than a guess: an unlabelled card is honest, a wrongly-levelled one is not. */
export function normalizeCefr(value) {
  const level = String(value || '').toUpperCase().trim().slice(0, 2);
  return CEFR_LEVELS.includes(level) ? level : '';
}

/**
 * Commit a batch from card-builder: attach provenance, append, retire the queue.
 * Done by script rather than by the model so a malformed reply cannot corrupt the deck.
 */
export function commit(newCards) {
  if (!Array.isArray(newCards)) throw new TypeError('commit expects a JSON array of cards');

  const cfg = config();
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
      cefr: normalizeCefr(card.cefr),
      category: normalizeCategory(card.category),
      // The pair the card was built for. Changing languages later opens a new
      // deck rather than mixing two of them, and never deletes this one.
      native: cfg.native,
      target: cfg.target,
      ts: text(source.ts) || new Date().toISOString(),
      project: text(source.project),
    });
  }
  appendJsonl(paths.cards, stamped);

  // Everything the queue offered counts as seen, including what the agent
  // rejected — otherwise rejected junk is re-captured every session.
  const known = knownWords(cfg.target);
  for (const row of queue) {
    for (const word of row.words || []) if (typeof word === 'string') known.add(word.toLowerCase());
  }
  for (const card of stamped) {
    if (card.type === 'word') known.add(card.front.toLowerCase());
    for (const keyword of card.keywords) known.add(keyword.toLowerCase());
  }
  saveKnownWords(cfg.target, known);

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
  } else if (command === 'config') {
    // The effective config, env plus whatever the user changed in the trainer.
    // Anything reading CLAUDE_PLUGIN_OPTION_* directly misses the second half.
    console.log(JSON.stringify(config(), null, 2));
  } else {
    console.log(JSON.stringify({ DATA, paths }, null, 2));
  }
}
