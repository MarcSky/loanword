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
import { scriptLetters } from './lang.mjs';
import { parsePick } from './peek.mjs';
import { CODES, isPickable, scriptOf } from './languages.mjs';
import { categoriesOf, knownField } from './categories.mjs';
import {
  CATEGORIES,
  CEFR_LEVELS,
  DATA,
  PLUGIN_ROOT,
  decksOnDisk,
  frontsFile,
  knownFile,
  lockFile,
  progressFile,
  paths,
  peekFile,
  queueFile,
  resolveData,
  wildFile,
} from './store-paths.mjs';
import * as db from './db.mjs';

export {
  CATEGORIES,
  CEFR_LEVELS,
  DATA,
  PLUGIN_ROOT,
  decksOnDisk,
  frontsFile,
  knownFile,
  lockFile,
  progressFile,
  paths,
  peekFile,
  queueFile,
  resolveData,
  wildFile,
};

const LEGACY_DATA = join(homedir(), '.claude', 'plugins', 'data', 'loanword');

const MAX_LOG_BYTES = 1024 * 1024;

export function adoptStranded(target, legacy) {
  if (!target || !legacy) throw new TypeError('adoptStranded needs both directories spelled out');
  if (target === legacy || !existsSync(legacy) || !statSync(legacy).isDirectory()) return null;

  const adopted = [];
  mkdirSync(target, { recursive: true });

  for (const name of ['cards.jsonl', 'queue.jsonl']) {
    const from = join(legacy, name);
    if (!existsSync(from) || !statSync(from).size) continue;
    const body = readFileSync(from, 'utf8');
    appendFileSync(join(target, name), body.endsWith('\n') ? body : `${body}\n`);
    adopted.push(name);
  }

  const state = { ...readJson(join(legacy, 'state.json'), {}), ...readJson(join(target, 'state.json'), {}) };
  if (Object.keys(state).length) {
    writeFileSync(join(target, 'state.json'), JSON.stringify(state));
    adopted.push('state.json');
  }

  const stranded = readJson(join(legacy, 'known_words.json'), null);
  const strandedKnown = Array.isArray(stranded) ? { [config().target]: stranded } : stranded;
  if (strandedKnown && typeof strandedKnown === 'object') {
    const live = readJson(join(target, 'known_words.json'), {});
    const known = Array.isArray(live) ? { [config().target]: live } : live;
    for (const [lang, words] of Object.entries(strandedKnown)) {
      if (!Array.isArray(words)) continue;
      known[lang] = [...new Set([...(known[lang] || []), ...words])];
    }
    writeFileSync(join(target, 'known_words.json'), JSON.stringify(known));
    adopted.push('known_words.json');
  }

  if (!adopted.length) return null;
  renameSync(legacy, `${legacy}.migrated-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  return adopted;
}

function ensureData() {
  mkdirSync(DATA, { recursive: true });
}

export function log(message) {
  try {
    ensureData();
    if (fileSize(paths.log) > MAX_LOG_BYTES) {
      rmSync(paths.logRotated, { force: true });
      renameSync(paths.log, paths.logRotated);
    }
    appendFileSync(paths.log, `${new Date().toISOString()} ${message}\n`);
  } catch {
  }
}

const MODES = ['active', 'passive', 'both'];
const THEMES = ['light', 'dark', 'system'];
const STUDY_MODES = ['flashcards', 'learn'];
const ECHO_MODES = ['off', 'line', 'weave'];
const SPEECH_MODES = ['off', 'reveal', 'ask'];
const PEEK_MODES = ['off', 'on'];
export const MODELS = ['haiku', 'sonnet', 'opus'];
export const EXERCISES = ['flashcards', 'learn', 'cloze', 'type', 'reverse'];
export const SESSION_LENGTHS = [5, 10, 15];
const LANG_CODE = /^[a-z]{2}$/;

const peekMode = (value) => {
  if (value === true) return 'on';
  if (value === false) return 'off';
  if (typeof value !== 'string') return undefined;
  if (PEEK_MODES.includes(value)) return value;
  return LEGACY_PEEK.includes(value) ? 'on' : undefined;
};

const LEGACY_PEEK = ['hard', 'starred', 'mixed'];

const echoMode = (value) => {
  if (value === true) return 'line';
  if (value === false) return 'off';
  return ECHO_MODES.includes(value) ? value : undefined;
};

const peekEveryFrom = (value) => {
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes >= 1 && minutes <= 120 ? Math.floor(minutes) : 15;
};

function envConfig(env = process.env) {
  const limit = Number(env.CLAUDE_PLUGIN_OPTION_DAILY_LIMIT);
  const level = String(env.CLAUDE_PLUGIN_OPTION_LEVEL || '').toUpperCase();
  return {
    native: (env.CLAUDE_PLUGIN_OPTION_NATIVE_LANG || 'es').toLowerCase().slice(0, 2),
    target: (env.CLAUDE_PLUGIN_OPTION_TARGET_LANG || 'en').toLowerCase().slice(0, 2),
    targets: [],
    paused: [],
    mode: MODES.includes((env.CLAUDE_PLUGIN_OPTION_MODE || '').toLowerCase())
      ? env.CLAUDE_PLUGIN_OPTION_MODE.toLowerCase()
      : 'both',
    dailyLimit: Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 500) : 15,
    autoBuild: env.CLAUDE_PLUGIN_OPTION_AUTO_BUILD !== 'false',
    echo: echoMode(env.CLAUDE_PLUGIN_OPTION_ECHO === 'true' || env.CLAUDE_PLUGIN_OPTION_ECHO) ?? 'off',
    level: CEFR_LEVELS.includes(level) ? level : '',
    theme: 'system',
    studyMode: 'flashcards',

    field: '',
  categories: [],
  model: 'haiku',
  uiLang: '',
    sessionMinutes: 10,

    weeklyGoal: 5,
    showIntervals: true,
    speech: 'reveal',
    peek: peekMode(env.CLAUDE_PLUGIN_OPTION_PEEK) ?? 'off',
    peekPick: parsePick(env.CLAUDE_PLUGIN_OPTION_PEEK_PICK || ''),
    peekEvery: peekEveryFrom(env.CLAUDE_PLUGIN_OPTION_PEEK_EVERY),
    produce: true,
    exercises: ['flashcards', 'learn', 'cloze', 'type', 'reverse'],
  };
}

const stringList = (value, allowed) => {
  if (!Array.isArray(value)) return undefined;
  const clean = value.filter((item) => allowed.includes(item));
  return clean.length ? [...new Set(clean)] : undefined;
};

const langCode = (value) => {
  if (typeof value !== 'string') return undefined;
  const code = value.toLowerCase();
  return LANG_CODE.test(code) && isPickable(code) ? code : undefined;
};

const codeList = (value) => {
  if (!Array.isArray(value)) return undefined;
  return [
    ...new Set(
      value
        .filter((item) => typeof item === 'string')
        .map((item) => item.toLowerCase())
        .filter((item) => LANG_CODE.test(item) && isPickable(item)),
    ),
  ];
};

const SETTING_RULES = {
  native: (v) => langCode(v),
  target: (v) => langCode(v),
  targets: codeList,
  paused: codeList,
  mode: (v) => (MODES.includes(v) ? v : undefined),
  dailyLimit: (v) => (Number.isFinite(v) && v >= 3 ? Math.min(Math.floor(v), 500) : undefined),
  autoBuild: (v) => (typeof v === 'boolean' ? v : undefined),
  model: (v) => (MODELS.includes(v) ? v : undefined),
  categories: (v) => (Array.isArray(v) ? categoriesOf(v) : undefined),
  field: (v) => (v === '' || knownField(v) ? v : undefined),
  echo: echoMode,
  level: (v) => (v === '' || CEFR_LEVELS.includes(v) ? v : undefined),
  theme: (v) => (THEMES.includes(v) ? v : undefined),
  studyMode: (v) => (STUDY_MODES.includes(v) ? v : undefined),
  uiLang: (v) => (v === '' || (typeof v === 'string' && LANG_CODE.test(String(v).toLowerCase())) ? String(v).toLowerCase() : undefined),
  sessionMinutes: (v) => (SESSION_LENGTHS.includes(Number(v)) ? Number(v) : undefined),
  weeklyGoal: (v) => (Number.isFinite(v) && v >= 1 && v <= 7 ? Math.floor(v) : undefined),
  showIntervals: (v) => (typeof v === 'boolean' ? v : undefined),
  speech: (v) => (SPEECH_MODES.includes(v) ? v : undefined),
  peek: peekMode,
  peekPick: (v) => (v === undefined || v === null ? undefined : parsePick(v)),
  peekEvery: (v) => (Number.isFinite(v) && v >= 1 && v <= 120 ? Math.floor(v) : undefined),
  produce: (v) => (typeof v === 'boolean' ? v : undefined),
  exercises: (v) => stringList(v, EXERCISES),
};

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
  const merged = { ...envConfig(), ...sanitizeSettings(readJson(paths.settings, {})) };
  merged.targets = activeTargets(merged);
  merged.paused = (merged.paused || []).filter((code) => merged.targets.includes(code));
  return merged;
}

export const enabledCategories = (cfg = config()) => categoriesOf(cfg.categories);

export function activeTargets(cfg) {
  const list = [cfg.target, ...(cfg.targets || [])];
  return [...new Set(list)].filter((code) => LANG_CODE.test(code) && code !== cfg.native);
}

export function captureTargets(cfg = config()) {
  const paused = new Set(cfg.paused || []);
  return activeTargets(cfg).filter((code) => !paused.has(code));
}

const isPair = (pair) =>
  !!pair && LANG_CODE.test(String(pair.native)) && LANG_CODE.test(String(pair.target));


export function fallbackPair() {
  const stored = readJson(paths.settings, {});
  if (isPair(stored?.legacyPair)) {
    return { native: stored.legacyPair.native, target: stored.legacyPair.target };
  }
  const cfg = config();
  return { native: cfg.native, target: cfg.target };
}

export function seedSettings(env = process.env) {
  const stored = readJson(paths.settings, {});
  const seed = sanitizeSettings(envConfig(env));
  const seededFrom = stored.seededFrom && typeof stored.seededFrom === 'object' ? stored.seededFrom : {};

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const changed = {};
  for (const [key, value] of Object.entries(seed)) {
    const edited = key in seededFrom && !same(seededFrom[key], value);
    if (!(key in stored) || edited) changed[key] = value;
  }

  if (!Object.keys(changed).length) return null;
  writeJson(paths.settings, { ...stored, ...changed, seededFrom: seed });
  return Object.keys(changed);
}

export class SamePairError extends Error {}

export function saveSettings(patch) {
  const raw = readJson(paths.settings, {});
  const clean = sanitizeSettings(patch);
  const before = config();
  const merged = { ...sanitizeSettings(raw), ...clean };

  const native = merged.native || before.native;
  const target = merged.target || before.target;
  if (native === target) {
    throw new SamePairError(`${native} cannot be both the language you write in and the one you learn`);
  }
  const wanted = [...(merged.targets || []), target, ...(clean.target ? [] : before.targets || [])];
  merged.target = target;
  merged.targets = [...new Set(wanted)].filter((code) => code !== native);
  merged.paused = [...new Set(merged.paused || [])].filter((code) => merged.targets.includes(code));

  if (isPair(raw?.legacyPair)) merged.legacyPair = raw.legacyPair;
  if (raw?.seededFrom && typeof raw.seededFrom === 'object') merged.seededFrom = raw.seededFrom;

  const switchingPair =
    (clean.native && clean.native !== before.native) || (clean.target && clean.target !== before.target);
  if (switchingPair && !merged.legacyPair && existsSync(paths.cards) && statSync(paths.cards).size > 0) {
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

export function writeJson(file, value) {
  ensureData();
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(value));
  renameSync(temp, file);
}

export function writeLines(file, lines) {
  ensureData();
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, lines.length ? `${lines.join('\n')}\n` : '');
  renameSync(temp, file);
}

export function readLines(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').map((line) => line.trim()).filter(Boolean);
}

export function adoptQueue(target) {
  if (!fileSize(paths.queue)) {
    if (existsSync(paths.queue)) rmSync(paths.queue, { force: true });
    return null;
  }
  const staged = `${paths.queue}.moving.${process.pid}`;
  try {
    renameSync(paths.queue, staged);
  } catch {
    return null;
  }
  const body = readFileSync(staged, 'utf8');
  ensureData();
  appendFileSync(queueFile(target), body.endsWith('\n') ? body : `${body}\n`);
  renameSync(staged, `${paths.queue}.migrated`);
  return target;
}

export function cardId(card) {
  const pair = card.target ? ` ${card.native || ''}>${card.target}` : '';
  return createHash('sha1').update(`${card.front} ${card.back}${pair}`).digest('hex').slice(0, 10);
}

export function facing(card) {
  const native = card.native || fallbackPair().native;
  const target = card.target || fallbackPair().target;
  if (native === target) return card;
  if (scriptOf(native) === scriptOf(target)) return card;

  const nativeOnFront = scriptLetters(card.front, native);
  const nativeOnBack = scriptLetters(card.back, native);
  if (nativeOnFront <= nativeOnBack) return card;
  return { ...card, front: card.back, back: card.front };
}

export function loadCards() {
  return db.allLiveCards();
}

export function knownWords(target = config().target) {
  return db.knownWordsOf(target);
}

export function knownSnapshot(target) {
  return new Set(readLines(knownFile(target)).map((word) => word.toLowerCase()));
}

export function saveKnownWords(target, words) {
  const list = [...new Set([...words].filter((word) => typeof word === 'string' && word.trim()).map((word) => word.toLowerCase()))].sort();
  db.tx(() => db.addKnownWords(target, list));
  writeLines(knownFile(target), [...db.knownWordsOf(target)].sort());
}

function retrievabilityFrom(row, now = Date.now()) {
  const stability = Math.max(0.1, Number(row.stability) || 0.1);
  const elapsed = Math.max(0, (now - new Date(row.due).getTime()) / 86_400_000 + Number(row.stability || 0));
  return Math.pow(1 + (19 / 81) * (elapsed / stability), -0.5);
}

export const PEEK_ROWS = 120;
export const FRONTS_ROWS = 500;
const PEEK_QUOTA = { starred: 40, leech: 40, unseen: 20 };
const SNAPSHOT_THROTTLE_MS = 15_000;

const snapshotAt = new Map();

const snapshotRow = (row, now) => ({
  front: row.front,
  back: row.back,
  reading: row.reading || '',
  example: row.example || '',
  cefr: row.cefr || '',
  starred: !!row.starred,
  lapses: row.lapses || 0,
  seen: !!row.seen,
  r: row.seen ? Number(retrievabilityFrom(row, now).toFixed(4)) : 0,
});

function writeWildFronts(deck, target, now) {
  writeLines(
    frontsFile(target),
    db
      .weakestFronts(deck, FRONTS_ROWS)
      .map((row) => `${String(row.front).replace(/\t/g, ' ')}\t${retrievabilityFrom(row, now).toFixed(4)}`),
  );
}

function writePeek(deck, target, now) {
  const ranked = [
    ...db.peekStarred(deck, PEEK_QUOTA.starred),
    ...db.peekLeeches(deck, PEEK_QUOTA.leech),
    ...db.peekUnseen(deck, PEEK_QUOTA.unseen),
    ...db.peekWeakest(deck, PEEK_ROWS),
  ];

  const kept = new Map();
  for (const row of ranked) {
    if (kept.size >= PEEK_ROWS) break;
    kept.set(`${row.front}\u0000${row.back}`, snapshotRow(row, now));
  }
  writeLines(peekFile(target), [...kept.values()].map((row) => JSON.stringify(row)));
}

export function writeSnapshots(native, target, { force = false, now = Date.now() } = {}) {
  const key = `${native}>${target}`;
  if (!force && now - (snapshotAt.get(key) || 0) < SNAPSHOT_THROTTLE_MS) return false;
  snapshotAt.set(key, now);

  const deck = db.deckIdIfAny(native, target);
  if (deck === null) {
    writeLines(frontsFile(target), []);
    writeLines(peekFile(target), []);
    return true;
  }

  writeWildFronts(deck, target, now);
  writePeek(deck, target, now);
  return true;
}

export const forgetSnapshots = () => snapshotAt.clear();

export function cardsForPair(pair) {
  return db.cardsOfDeck(db.deckId(pair.native, pair.target));
}

export const LEARNED_STABILITY_DAYS = 21;

export const masteryOf = (entry) =>
  entry ? Math.max(0, Math.min(1, entry.stability / LEARNED_STABILITY_DAYS)) : 0;

export const isLearned = (entry) => masteryOf(entry) >= 1;

export function bucketStats(keys, cards, state, keyOf) {
  const at = (id) => (state instanceof Map ? state.get(id) : state[id]);
  return keys.map((key) => {
    const owned = cards.filter((card) => keyOf(card) === key);
    const seen = owned.filter((card) => at(card.id));
    return {
      key,
      total: owned.length,
      seen: seen.length,
      learned: seen.filter((card) => isLearned(at(card.id))).length,
      mastery: owned.length
        ? owned.reduce((sum, card) => sum + masteryOf(at(card.id)), 0) / owned.length
        : 0,
    };
  });
}

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

export function normalizeCefr(value) {
  const level = String(value || '').toUpperCase().trim().slice(0, 2);
  return CEFR_LEVELS.includes(level) ? level : '';
}

const STEM = 4;

export function sameWord(a, b) {
  const left = db.wordsOf(a);
  const right = db.wordsOf(b);
  if (!left.length || left.length !== right.length) return false;
  return left.every((word, index) => {
    const other = right[index];
    const [short, long] = word.length <= other.length ? [word, other] : [other, word];
    return long.startsWith(short) && short.length >= Math.min(STEM, long.length);
  });
}

export function cardWords(card) {
  const words = (card.keywords || []).filter((word) => typeof word === 'string');
  if (card.type === 'word') words.push(card.front);
  return words.map((word) => String(word).toLowerCase());
}

export const retireKey = db.retireKey;

export function readingWanted(native, target) {
  const script = scriptOf(target);
  if (script !== 'latin' && script !== 'cyrillic') return true;
  return script !== 'latin' && script !== scriptOf(native);
}

const BRACKETS = /[[\]{}()（）［］｛｝【】〔〕]/;

export function frequentWords(language) {
  const file = join(PLUGIN_ROOT, 'data', 'freq', `${String(language || '').toLowerCase().slice(0, 2)}.txt`);
  if (!existsSync(file)) return new Set();
  return new Set(
    readFileSync(file, 'utf8')
      .split('\n')
      .map((word) => word.trim().toLowerCase())
      .filter(Boolean),
  );
}

const CARD_TYPES = new Set(['phrase', 'word', 'letter']);

export function sidedByRecord(card, record, target) {
  const phrase = typeof record?.phrase === 'string' ? record.phrase.trim() : '';
  if (!phrase || record.phrase_lang === target) return card;
  const same = (value) => String(value || '').trim().toLowerCase() === phrase.toLowerCase();
  if (!same(card.front) || same(card.back)) return card;
  return { ...card, front: card.back, back: card.front };
}

function stampCard(card, pair, provenanceOf) {
  if (!card || typeof card !== 'object') return null;
  const front = text(card.front);
  const back = text(card.back);
  if (!front || !back) return null;

  const source = provenanceOf(card);
  const wantsReading = readingWanted(pair.native, pair.target);
  return {
    type: CARD_TYPES.has(card.type) ? card.type : 'phrase',
    front,
    back,
    keywords: (Array.isArray(card.keywords) ? card.keywords : [])
      .filter((word) => typeof word === 'string')
      .map((word) => text(word))
      .filter(Boolean),
    example: text(card.example),
    pos: text(card.pos),
    cefr: normalizeCefr(card.cefr) || normalizeCefr(source?.cefr),
    reading: wantsReading ? text(card.reading) : '',

    note: text(card.note),
    category: normalizeCategory(card.category || source?.category),

    native: pair.native,
    target: pair.target,
    ts: text(source?.ts) || new Date().toISOString(),
    project: text(source?.project),
    starred: !!source?.starred,
    origin_id: text(source?.origin) || null,
    record: source || null,

    source: text(source?.text).slice(0, 300),
  };
}

function provenanceReader(queue) {
  const mostRecent = queue[queue.length - 1] || null;
  const byOrigin = new Map();
  for (const row of queue) if (row && typeof row.origin === 'string') byOrigin.set(row.origin, row);

  return (card) => {
    if (typeof card.origin === 'string' && byOrigin.has(card.origin)) return byOrigin.get(card.origin);
    const front = String(card.front || '').toLowerCase();
    const back = String(card.back || '').toLowerCase();
    return (
      queue.find((row) => {
        const text = typeof row.text === 'string' ? row.text.toLowerCase() : '';
        if (text && (text === front || text === back)) return true;
        return Array.isArray(row.words) && (row.words.includes(front) || row.words.includes(back));
      }) || mostRecent
    );
  };
}

function rejectReason(card, stopWords) {
  if (BRACKETS.test(card.front)) return 'a bracketed front';
  if (card.type === 'word' && stopWords.has(card.front.toLowerCase())) return 'a stop-word card';
  return '';
}

function classifyCards(newCards, pair, deck, queue) {
  const provenanceOf = provenanceReader(queue);
  const stopWords = frequentWords(pair.target);
  const byConcept = db.conceptFronts(deck);
  const stamped = [];
  const ids = [];
  const seen = new Set();
  const rewrites = [];
  let dropped = 0;

  for (const raw of newCards) {
    const card = stampCard(raw, pair, provenanceOf);
    if (!card) continue;

    const reason = rejectReason(card, stopWords);
    if (reason) {
      dropped += 1;
      log(`commit dropped ${reason}: ${card.front.slice(0, 60)}`);
      continue;
    }

    const record = card.record;
    delete card.record;

    const rewriting =
      record?.source === 'rewrite' && card.origin_id && db.cardExists(card.origin_id)
        ? db.cardById(card.origin_id)
        : null;
    if (rewriting?.deck_id === deck) {
      rewrites.push({ id: card.origin_id, card });
      continue;
    }

    if (db.isRetired(card.front)) continue;
    const id = cardId(card);
    if (seen.has(id)) continue;
    seen.add(id);
    const sided = facing(sidedByRecord(card, record, pair.target));
    const concept = db.conceptKey(sided.back);
    const twins = byConcept.get(concept) || [];
    if (sided.type !== 'letter' && twins.some((front) => sameWord(front, sided.front))) {
      dropped += 1;
      log(`commit dropped another wording of a card already in the deck: ${card.front.slice(0, 60)}`);
      continue;
    }
    byConcept.set(concept, [...twins, sided.front]);
    ids.push(id);
    stamped.push({
      ...sided,
      concept,
      deck_id: deck,
      created_at: new Date().toISOString(),
    });
  }

  return { stamped, ids, rewrites, dropped };
}

function rememberWords(target, queue, stamped) {
  const known = db.knownWordsOf(target);
  for (const row of queue) {
    for (const word of row.words || []) if (typeof word === 'string') known.add(word.toLowerCase());
  }
  for (const card of stamped) for (const word of cardWords(card)) known.add(word);
  saveKnownWords(target, known);
}

export function commit(newCards, options = {}) {
  if (!Array.isArray(newCards)) throw new TypeError('commit expects a JSON array of cards');

  const cfg = config();
  const pair = { native: options.native || cfg.native, target: options.target || cfg.target };
  const file = queueFile(pair.target);
  const queue = readJsonl(file);
  const deck = db.deckId(pair.native, pair.target);

  const { stamped, ids, rewrites, dropped } = classifyCards(newCards, pair, deck, queue);
  const nothing = { added: 0, rewritten: 0, dropped, queueCleared: 0, cards: [], target: pair.target };
  if (!stamped.length && !rewrites.length) return nothing;

  const added = db.tx(() => {
    for (const { id, card } of rewrites) {
      db.rewriteCard(id, {
        example: card.example,
        note: card.note,
        keywords: card.keywords,
        reading: card.reading,
      });
    }
    return db.insertCards(stamped, ids);
  });

  rememberWords(pair.target, queue, stamped);
  writeSnapshots(pair.native, pair.target, { force: true });
  writeFileSync(file, '');

  return {
    added,
    rewritten: rewrites.length,
    dropped,
    queueCleared: queue.length,
    cards: stamped,
    target: pair.target,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  cli();
}

async function cli() {
  const [command] = process.argv.slice(2);
  const argv = process.argv.slice(2);
  const flag = (name) => (argv.find((arg) => arg.startsWith(`--${name}=`)) || '').split('=')[1] || '';
  if (command === 'adopt') {
    const adopted = adoptStranded(DATA, LEGACY_DATA);
    console.log(JSON.stringify({ data: DATA, from: LEGACY_DATA, adopted }, null, 2));
  } else if (command === 'commit') {
    const { ensureMigrated } = await import('./migrate.mjs');
    ensureMigrated();
    const target = flag('target') || config().target;
    adoptQueue(config().target);
    const raw = (await readStdin()).trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    console.log(JSON.stringify(commit(JSON.parse(raw || '[]'), { target }), null, 2));
  } else if (command === 'queue') {
    const target = flag('target') || config().target;
    console.log(JSON.stringify({ file: queueFile(target), entries: readJsonl(queueFile(target)).length }));
  } else if (command === 'config') {
    console.log(JSON.stringify(config(), null, 2));
  } else {
    console.log(JSON.stringify({ DATA, paths }, null, 2));
  }
  db.close();
}

export { CODES };
