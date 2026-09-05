#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join, normalize, resolve, sep } from 'node:path';
import { createEmptyCard, fsrs, generatorParameters, Rating } from 'ts-fsrs';
import * as analytics from './analytics.mjs';
import * as level from './level.mjs';
import { alphabetRecord, offerAlphabet } from './alphabet.mjs';
import {
  askFull,
  buildBeforeServing,
  buildInBackground,
  dropQueued,
  effortFor,
  modelFor,
  queuePreview,
  queueSizes,
} from './build.mjs';
import * as filing from './reclassify.mjs';
import { conceptsInto, copiedInto, planClone, selectForClone, sourcePair, suggestStarter } from './clone.mjs';
import * as db from './db.mjs';
import { toCsv, writeCsv } from './export-anki.mjs';
import { languages as dictionaries } from './i18n.mjs';
import { keepIpa } from './lexis.mjs';
import { isRtl } from './languages.mjs';
import { MAX_CHARS, MAX_IDS, RANGES, SESSION_LENGTHS, textIn } from './limits.mjs';
import { ensureMigrated } from './migrate.mjs';
import { candidates as peekCandidates } from './peek.mjs';
import { clozeOf, planSession } from './session.mjs';
import * as speech from './speech.mjs';
import {
  CATEGORIES,
  enabledCategories,
  CEFR_LEVELS,
  DATA,
  PLUGIN_ROOT,
  activeTargets,
  adoptQueue,
  appendJsonl,
  bucketStats,
  cardWords,
  config,
  decksOnDisk,
  isLearned,
  knownWords,
  loadCards,
  log,
  masteryOf,
  normalizeCategory,
  normalizeCefr,
  normalizeTopic,
  paths,
  frequentWords,
  peekFile,
  queueFile,
  readJson,
  readJsonl,
  recordUsage,
  sameWord,
  saveKnownWords,
  SamePairError,
  saveSettings,
  tildify,
  usageTotals,
  usageWindows,
  wildFile,
  writeLines,
  writeSnapshots,
} from './store.mjs';

const PORT = Number(process.env.LOANWORD_PORT) || 4747;
const MAX_BODY_BYTES = 64 * 1024;
const ACTIVITY_DAYS = 84;

const scheduler = fsrs(generatorParameters({ enable_fuzz: true }));
const RATINGS = { 1: Rating.Again, 2: Rating.Hard, 3: Rating.Good, 4: Rating.Easy };

export const JUNK_REASONS = {
  'not-useful': { retire: true },
  'already-known': { retire: true },
  'too-rare': { retire: true },
  'wrong-translation': { retire: false, rewrite: true },
  duplicate: { retire: true },
};

if (!db.sqliteAvailable()) {
  console.error(
    'Loanword needs Node 22.16 or newer — this build has no node:sqlite.\n' +
      'Update Node (nodejs.org, `brew upgrade node`, or `nvm install --lts`) and try again.',
  );
  process.exit(1);
}

ensureMigrated();
rmSync(paths.pending, { force: true });
adoptQueue(config().target);

const currentDeck = (cfg = config()) => db.deckId(cfg.native, cfg.target);

function reviveCard(stored) {
  if (!stored) return null;
  const due = new Date(stored.due);
  if (Number.isNaN(due.getTime())) return createEmptyCard(new Date());
  const lastReview = stored.last_review ? new Date(stored.last_review) : undefined;
  return {
    due,
    stability: stored.stability,
    difficulty: stored.difficulty,
    elapsed_days: stored.elapsed_days,
    scheduled_days: stored.scheduled_days,
    reps: stored.reps,
    lapses: stored.lapses,
    state: stored.state,
    learning_steps: stored.learning_steps || 0,
    last_review: lastReview && !Number.isNaN(lastReview.getTime()) ? lastReview : undefined,
  };
}

const LEARNING_STATES = new Set([1, 3]);

function deck(now = new Date(), cfg = config()) {
  const id = currentDeck(cfg);
  const cards = db.cardsOfDeck(id);
  const state = db.stateOfDeck(id);

  const due = cards.filter((card) => {
    const entry = state.get(card.id);
    if (!entry) return false;
    return new Date(entry.due) <= now || LEARNING_STATES.has(Number(entry.state));
  });

  return { id, state, cards, due };
}

function stats(cfg = config(), loaded = deck(new Date(), cfg)) {
  const { id, state, cards, due } = loaded;
  const seen = cards.filter((card) => state.has(card.id));

  const counts = new Map(
    db
      .all(
        'SELECT day, COUNT(*) AS n FROM reviews WHERE deck_id = ? AND day >= ? GROUP BY day',
        id,
        analytics.shiftDay(-(ACTIVITY_DAYS - 1)),
      )
      .map((row) => [row.day, row.n]),
  );
  const activity = [];
  for (let i = ACTIVITY_DAYS - 1; i >= 0; i--) {
    const date = analytics.shiftDay(-i);
    activity.push({ date, reviews: counts.get(date) || 0 });
  }

  const streak = analytics.weeklyStreak(id, cfg.weeklyGoal);

  return {
    total: cards.length,
    seen: seen.length,
    learned: seen.filter((card) => isLearned(state.get(card.id))).length,
    due_now: due.length,
    streak: streak.days,
    weekly: streak,
    reviewed_today: db.reviewsToday(id),
    daily_limit: cfg.dailyLimit,
    wild_7: db.countReviewsWithMode(id, 'wild', analytics.shiftDay(-6)),
    mastery: cards.length
      ? cards.reduce((sum, card) => sum + masteryOf(state.get(card.id)), 0) / cards.length
      : 0,
    activity,
    categories: bucketStats(enabledCategories(cfg), cards, state, (card) => card.category),
    levels: bucketStats(CEFR_LEVELS, cards, state, (card) => card.cefr),
    hardest: seen
      .map((card) => ({
        front: card.front,
        back: card.back,
        category: card.category,
        cefr: card.cefr,
        lapses: state.get(card.id).lapses,
        difficulty: state.get(card.id).difficulty,
      }))
      .sort((a, b) => b.lapses - a.lapses || b.difficulty - a.difficulty)
      .slice(0, 5),
    usage: usageTotals(),
  };
}

function intervals(id, now = new Date()) {
  const stored = db.stateOfCard(id);
  const previous = stored ? reviveCard(stored) : createEmptyCard(now);
  const preview = scheduler.repeat(previous, now);
  const out = {};
  for (const rating of [1, 2, 3, 4]) {
    const next = preview[RATINGS[rating]]?.card;
    out[rating] = next ? { due: next.due, days: next.scheduled_days } : null;
  }
  return out;
}

function grade(id, rating, { mode = 'flashcards', ms = 0, sessionId = null, deckId = null } = {}) {
  const cfg = config();
  const target = deckId ?? currentDeck(cfg);
  const stored = db.stateOfCard(id);
  const isNew = !stored;
  const now = new Date();
  const previous = isNew ? createEmptyCard(now) : reviveCard(stored);
  const { card } = scheduler.next(previous, now, rating);

  db.tx(() => {
    db.saveState(id, target, card);
    const row = db.cardById(id);
    const ability = db.abilityOf(target);
    const next = level.update(ability, {
      rating,
      mode,
      first: isNew,
      cefr: row?.cefr || '',
      difficulty: card.difficulty,
    });
    if (next !== ability) db.saveAbility(target, next);
    db.logReview({
      card_id: id,
      deck_id: target,
      session_id: sessionId,
      ts: now.toISOString(),
      rating,
      mode,
      was_new: isNew,
      duration_ms: ms,
      elapsed_days: card.elapsed_days,
      scheduled_days: card.scheduled_days,
      stability_before: previous.stability,
      stability_after: card.stability,
      difficulty_before: previous.difficulty,
      difficulty_after: card.difficulty,
      state_before: previous.state,
      state_after: card.state,
    });
  });

  return { ok: true, due: card.due, stability: card.stability, mastery: masteryOf(card), learned: isLearned(card) };
}

function ingestWild(cfg = config()) {
  let counted = 0;
  for (const target of activeTargets(cfg)) {
    const file = wildFile(target);
    const rows = readJsonl(file);
    if (!rows.length) continue;
    writeFileSync(file, '');
    const deckId = db.deckIdIfAny(cfg.native, target);
    if (deckId === null) continue;
    const byFront = new Map(db.cardsOfDeck(deckId).map((card) => [card.front.toLowerCase(), card]));
    for (const row of rows) {
      const card = byFront.get(String(row.front || '').toLowerCase());
      if (!card) continue;
      if (!db.stateOfCard(card.id)) continue;
      if (db.reviewedTodayWithMode(card.id, 'wild')) continue;
      grade(card.id, Rating.Good, { mode: 'wild', deckId });
      counted++;
    }
  }
  if (counted) log(`wild reviews counted: ${counted}`);
  return counted;
}

function rewriteRecord(card, cfg, wrong = '') {
  return {
    ts: new Date().toISOString(),
    project: card.project || '',
    session: '',
    source: 'rewrite',
    lang: cfg.native,
    text: card.back,
    example: card.example || '',
    category: card.category || 'everyday',
    cefr: card.cefr || '',
    type: card.type || 'phrase',
    starred: !!card.starred,
    origin: card.id,
    wrong: wrong || card.front,
  };
}

function notWorthTapping(cfg) {
  const queued = readJsonl(queueFile(cfg.target))
    .filter((row) => row?.source === 'pick' && typeof row.text === 'string')
    .map((row) => row.text.toLowerCase());
  return new Set([...frequentWords(cfg.target), ...queued]);
}

function deckFronts(cfg) {
  const deckId = db.deckIdIfAny(cfg.native, cfg.target);
  if (deckId === null) return new Set();
  return new Set(db.cardsOfDeck(deckId).map((card) => String(card.front || '').toLowerCase()));
}

function pickRecords(words, example, cfg) {
  const sentence = textIn(example, MAX_CHARS.sentence);
  const taken = new Set([...notWorthTapping(cfg), ...deckFronts(cfg)]);
  const seen = new Set();
  const records = [];
  for (const raw of Array.isArray(words) ? words : []) {
    const word = textIn(raw, MAX_CHARS.word);
    const key = word.toLowerCase();
    if (!word || seen.has(key) || taken.has(key)) continue;
    seen.add(key);
    records.push({
      ts: new Date().toISOString(),
      project: '',
      session: '',
      source: 'pick',
      lang: cfg.target,
      text: word,
      example: sentence,
    });
    if (records.length >= RANGES.picks.max) break;
  }
  return records;
}

function remove(id, reason) {
  const cfg = config();
  const deckId = currentDeck(cfg);
  const card = db.cardById(id);
  const rule = JUNK_REASONS[reason] || { retire: true };

  db.tx(() => {
    db.junkCard(id, deckId, reason, card?.front || '');
    if (card && rule.retire) db.retire(card.front);
  });

  if (card && rule.retire) {
    const known = knownWords(cfg.target);
    for (const word of cardWords(card)) known.add(word);
    saveKnownWords(cfg.target, known);
  }

  let queued = false;
  if (card && rule.rewrite) {
    appendJsonl(queueFile(cfg.target), [rewriteRecord(card, cfg)]);
    queued = true;
  }

  log(`card deleted id=${id} reason=${reason || 'unspecified'}`);
  return { ok: true, front: card?.front, id, rewrite: queued, reason };
}

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = argv.find((arg) => arg.startsWith(`--${name}=`));
  return hit === undefined ? fallback : hit.slice(name.length + 3);
};

if (argv.includes('--where')) {
  console.log(
    `plugin  ${PLUGIN_ROOT}\ndeck    ${DATA}\ndb      ${db.DB_FILE}\ndecks   ${decksOnDisk().join(', ') || 'none'}`,
  );
  process.exit(0);
}

if (argv.includes('--stats')) {
  console.log(JSON.stringify(stats(), null, 2));
  process.exit(0);
}

if (argv[0] === 'migrate') {
  const { migrate } = await import('./migrate.mjs');
  console.log(JSON.stringify(migrate({ dryRun: argv.includes('--dry-run') }), null, 2));
  process.exit(0);
}

if (argv[0] === 'tidy') {
  const { tidy } = await import('./tidy.mjs');
  console.log(JSON.stringify(tidy({ remove: argv.includes('--remove') }), null, 2));
  process.exit(0);
}

if (argv[0] === 'vet') {
  const { repair } = await import('./vet.mjs');
  console.log(JSON.stringify(await repair({ apply: argv.includes('--apply') }), null, 2));
  db.close();
  process.exit(0);
}

if (argv[0] === 'peek') {
  const { peekFile: peekPath, readJsonl: rows } = await import('./store.mjs');
  const { pickPeek, renderPeek } = await import('./peek.mjs');
  const cfg = config();
  const card = pickPeek(rows(peekPath(cfg.target)), flag('pick', undefined) ?? cfg.peekPick);
  console.log(card ? renderPeek(card, cfg) : 'Nothing to show yet — build some cards first.');
  process.exit(0);
}

if (argv[0] === 'speech') {
  const lang = flag('lang', config().target);
  const command = speech.piperCommand(lang);
  console.log(`provider for ${lang}: ${speech.providerFor(lang) || 'none'}`);
  console.log(
    command
      ? `Piper has a voice for ${lang}. Run this once, by hand:\n\n${command}\n`
      : `Piper has no packaged voice for ${lang} — install eSpeak NG for a robotic but working one.`,
  );
  process.exit(0);
}

if (argv[0] === 'clone') {
  const list = (name) => flag(name, '').split(',').filter(Boolean);
  try {
    console.log(
      JSON.stringify(
        planClone({
          from: flag('from', ''),
          to: flag('to', ''),
          categories: list('category'),
          levels: list('level'),
        }),
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  process.exit(0);
}

const IDLE_MS = Math.max(0, Number(flag('idle', process.env.LOANWORD_IDLE_MINUTES ?? 30)) * 60_000);

if (argv[0] === 'build') {
  const { build } = await import('./build.mjs');
  const result = await build({
    target: flag('target', ''),
    onBatch: (n, total, code) => console.log(`Reading batch ${n} of ${total} for ${code}…`),
  });
  console.log(
    result.skipped ||
      (result.batches
        ? `${result.added} card(s) added from ${result.queueCleared} captured record(s).`
        : 'Nothing captured yet — work a while and come back.'),
  );
  for (const failure of result.failures) console.error(`${failure.target}: ${failure.error}`);
  process.exit(0);
}

if (argv[0] === 'stop') {
  const reply = await fetch(`http://127.0.0.1:${PORT}/stop`, { method: 'POST' }).catch(() => null);
  console.log(
    reply?.ok
      ? `Loanword review stopped; port ${PORT} released.`
      : `Nothing to stop — no trainer answering on port ${PORT}.`,
  );
  process.exit(0);
}

const LAN = flag('host', '') === 'lan';
const HOST = LAN ? '0.0.0.0' : '127.0.0.1';
const TOKEN = LAN ? randomBytes(16).toString('hex') : '';

function lanAddress() {
  for (const list of Object.values(networkInterfaces())) {
    for (const entry of list || []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  return '127.0.0.1';
}

function authorised(req) {
  if (!TOKEN) return true;
  const url = new URL(req.url, 'http://localhost');
  if (url.searchParams.get('token') === TOKEN) return 'grant';
  const cookie = String(req.headers.cookie || '');
  return cookie.split(';').some((part) => part.trim() === `loanword=${TOKEN}`);
}

const TOO_LARGE = Symbol('too large');

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      chunks.length = 0;
      resolve(value);
    };

    req.on('data', (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) return settle(TOO_LARGE);
      chunks.push(chunk);
    });
    req.on('aborted', () => settle(null));
    req.on('error', () => settle(null));
    req.on('end', () => {
      if (settled) return;
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        settle(parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null);
      } catch {
        settle(null);
      }
    });
  });
}

async function payloadOf(req, res) {
  const payload = await readBody(req);
  if (payload === TOO_LARGE) {
    json(res, { error: `body above ${MAX_BODY_BYTES} bytes` }, 413);
    req.destroy();
    return null;
  }
  if (!payload) {
    json(res, { error: 'invalid body' }, 400);
    return null;
  }
  return payload;
}

const send = (res, code, type, payload) => {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(payload);
};
const json = (res, value, code = 200) =>
  send(res, code, 'application/json; charset=utf-8', JSON.stringify(value));

const knownId = (id) => typeof id === 'string' && /^[0-9a-f]{10}$/.test(id) && db.cardExists(id);

const UI_ROOT = resolve(join(PLUGIN_ROOT, 'ui'));

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
};

function staticFile(pathname) {
  const requested = resolve(join(UI_ROOT, normalize(decodeURIComponent(pathname))));
  if (requested !== UI_ROOT && !requested.startsWith(UI_ROOT + sep)) return null;
  try {
    if (!statSync(requested).isFile()) return null;
  } catch {
    return null;
  }
  const dot = requested.lastIndexOf('.');
  const type = CONTENT_TYPES[requested.slice(dot).toLowerCase()];
  return type ? { body: readFileSync(requested), type } : null;
}

function filterOf(url) {
  const list = (name) => (url.searchParams.get(name) || '').split(',').filter(Boolean);
  const day = (name) => {
    const value = url.searchParams.get(name) || '';
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
  };
  const days = Number(url.searchParams.get('days'));
  return {
    from: day('from'),
    to: day('to'),
    category: list('category'),
    cefr: list('cefr'),
    days: Number.isFinite(days) && days > 0 ? Math.min(400, Math.floor(days)) : undefined,
    limit: Number(url.searchParams.get('limit')) || undefined,
  };
}

const ANALYTICS = {
  summary: analytics.summary,
  calendar: analytics.calendar,
  forecast: analytics.forecast,
  categories: (deckId, filter) => ({ rows: analytics.categories(deckId, filter) }),
  cefr: (deckId, filter) => ({ rows: analytics.cefr(deckId, filter) }),
  memory: analytics.memory,
  retention: analytics.retentionCurve,
  activity: analytics.activity,
  grades: analytics.grades,
  hardest: (deckId, filter) => ({ rows: analytics.hardest(deckId, filter) }),
  sessions: (deckId, filter) => ({ rows: analytics.sessions(deckId, filter) }),
  level: analytics.level,
};

const TTY = !!process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, text) => (TTY ? `\x1b[${code}m${text}\x1b[0m` : text);
const dim = (text) => paint(2, text);
const bold = (text) => paint(1, text);
const VERSION = readJson(join(PLUGIN_ROOT, 'package.json'), null)?.version || '0.0.0';

function banner({ url, cfg, total, due, data, idleMinutes, version = VERSION }) {
  const rows = [
    ['trainer', url],
    ['deck', `${cfg.native} → ${cfg.target} · ${total} card${total === 1 ? '' : 's'} · ${due} due`],
    ['capture', activeTargets(cfg).join(', ')],
    ['data', data],
    ['idle', idleMinutes ? `closes itself after ${idleMinutes} min without a request` : 'stays up until you stop it'],
  ];
  const rule = '─'.repeat(36);
  return [
    dim('┌ ') + bold(`Loanword ${version}`) + dim(` ${rule}`),
    ...rows.map(([key, value]) => `${dim('│')} ${dim(key.padEnd(8))} ${key === 'trainer' ? bold(value) : value}`),
    `${dim('└')} ${dim('ctrl+c or `loanword stop` closes it and releases the port')}`,
  ].join('\n');
}

let idleTimer;
let closing = false;
function quit(reason) {
  if (closing) return;
  closing = true;
  clearTimeout(idleTimer);
  if (TTY) process.stdout.write('\n');
  console.log(dim(`closing (${reason})…`));
  const done = () => {
    db.close();
    console.log(`Loanword closed; port ${PORT} released.`);
    process.exit(0);
  };
  const deadline = setTimeout(done, 1500);
  deadline.unref();
  server.close(() => {
    clearTimeout(deadline);
    done();
  });
  server.closeAllConnections();
}

function keepAlive() {
  if (!IDLE_MS) return;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => quit(`idle for ${IDLE_MS / 60_000} min`), IDLE_MS);
  idleTimer.unref();
}

const PRODUCE_BRIEF = (cfg, words) =>
  [
    `You are a patient language teacher. The learner writes ${cfg.native} and is learning ${cfg.target}.`,
    `They were asked to write one sentence in ${cfg.target} using at least two of: ${words.join(', ')}.`,
    'Reply with STRICTLY one JSON object and nothing else:',
    '{"line":"one short encouraging sentence of feedback, naming the single most useful fix","used":["the words from the list they actually used"]}',
    'Never quote the whole sentence back. Never store it. At most 160 characters in "line".',
  ].join('\n');

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  keepAlive();
  try {
    const pass = authorised(req);
    if (!pass) return json(res, { error: 'this trainer needs the token from its own start-up line' }, 401);
    if (pass === 'grant') {
      res.setHeader('set-cookie', `loanword=${TOKEN}; Path=/; SameSite=Strict; Max-Age=604800`);
    }

    if (req.method === 'POST' && url.pathname === '/stop') {
      json(res, { ok: true });
      return setTimeout(() => quit('asked to stop'), 50);
    }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      return send(res, 200, 'text/html; charset=utf-8', readFileSync(join(UI_ROOT, 'index.html')));
    }

    if (req.method === 'GET' && url.pathname === '/due') {
      const cfg = config();
      const { state, due } = deck(new Date(), cfg);
      return json(res, {
        config: { native: cfg.native, target: cfg.target, limit: cfg.dailyLimit },
        cards: due.map((card) => ({ ...card, isNew: !state.has(card.id) })),
      });
    }

    if (req.method === 'GET' && url.pathname === '/state') {
      const cfg = config();
      ingestWild(cfg);
      const loaded = deck(new Date(), cfg);
      const { state, cards, due } = loaded;
      const dueIds = new Set(due.map((card) => card.id));
      const now = new Date();
      const builds = queueSizes(cfg);
      return json(res, {
        config: cfg,
        categories: enabledCategories(cfg),
        levels: CEFR_LEVELS,

        pairs: db.deckPairsWithCounts(),
        uiLanguages: dictionaries(),
        ability: { ...level.estimate(db.abilityOf(currentDeck(cfg))), floor: cfg.level },

        targets: builds,
        filing: filing.readProgress(),
        queued: builds.reduce((sum, row) => sum + row.queued, 0),
        building: builds.some((row) => row.building),
        speech: speech.status(activeTargets(cfg)),
        peekMatches: peekCandidates(readJsonl(peekFile(cfg.target)), cfg.peekPick).length,
        alphabet: offerAlphabet({ native: cfg.native, target: cfg.target, cards }),
        starter: suggestStarter({ native: cfg.native, target: cfg.target, cards }),
        stats: stats(cfg, loaded),
        usage: usageWindows(),
        cards: cards.map((card) => {
          const entry = state.get(card.id);
          return {
            ...card,
            isNew: !entry,
            isDue: dueIds.has(card.id),
            due: entry ? entry.due : null,
            reps: entry ? entry.reps : 0,
            lapses: entry ? entry.lapses : 0,
            leech: !!entry && entry.lapses >= db.LEECH_LAPSES,
            stability: entry ? entry.stability : 0,
            retrievability: entry ? analytics.retrievabilityOf(entry, now) : 0,
            mastery: masteryOf(entry),
          };
        }),
      });
    }

    if (req.method === 'GET' && url.pathname === '/settings') return json(res, config());

    if (req.method === 'GET' && url.pathname === '/i18n') {
      const cfg = config();
      const lang = cfg.uiLang || cfg.native;
      const file = resolve(join(UI_ROOT, 'i18n', `${lang}.json`));
      const strings = file.startsWith(UI_ROOT + sep) ? readJson(file, null) : null;
      const known = strings && typeof strings === 'object' && !Array.isArray(strings);
      return json(res, {
        lang: known ? lang : 'en',
        dir: isRtl(known ? lang : 'en') ? 'rtl' : 'ltr',
        native: cfg.native,
        target: cfg.target,
        targetDir: isRtl(cfg.target) ? 'rtl' : 'ltr',
        nativeDir: isRtl(cfg.native) ? 'rtl' : 'ltr',
        strings: known ? strings : {},
      });
    }

    if (req.method === 'POST' && url.pathname === '/settings') {
      const payload = await payloadOf(req, res);
      if (!payload) return;
      let saved;
      try {
        saved = saveSettings(payload);
      } catch (error) {
        if (!(error instanceof SamePairError)) throw error;
        return json(res, { error: 'the language you write in cannot also be a deck you learn' }, 400);
      }
      adoptQueue(saved.target);
      const refiled = payload.categories ? db.refileToFallback(enabledCategories(saved)) : 0;
      if (refiled) log(`categories narrowed, ${refiled} card(s) moved to everyday`);
      return json(res, { ...saved, refiled });
    }

    if (req.method === 'GET' && url.pathname === '/stats') return json(res, stats());

    if (req.method === 'GET' && url.pathname === '/build/status') {
      return json(res, { targets: queueSizes(), filing: filing.readProgress() });
    }

    if (req.method === 'POST' && url.pathname === '/categories/rebuild') {
      const cfg = config();
      const deckId = db.deckIdIfAny(cfg.native, cfg.target);
      const cards = deckId === null ? 0 : db.cardsOfDeck(deckId).length;
      if (!cards) return json(res, { error: 'nothing in this deck to file' }, 409);
      const started = filing.rebuildInBackground();
      return json(res, { ok: true, started, cards, filing: filing.readProgress() });
    }

    if (req.method === 'GET' && url.pathname === '/queue') {
      return json(res, { profiles: queuePreview() });
    }

    if (req.method === 'POST' && url.pathname === '/queue/drop') {
      const payload = await payloadOf(req, res);
      if (!payload) return;
      const keys = Array.isArray(payload.keys) ? payload.keys : [payload.key];
      const { dropped, stopped } = dropQueued(keys);
      return json(res, { ok: true, dropped, stopped, profiles: queuePreview() });
    }

    if (req.method === 'POST' && url.pathname === '/build') {
      const started = buildInBackground();
      return json(res, { ok: true, started, targets: queueSizes() });
    }

    if (req.method === 'GET' && url.pathname === '/speech/status') {
      return json(res, speech.status(activeTargets(config())));
    }

    if (req.method === 'GET' && url.pathname === '/speech') {
      const cfg = config();
      const lang = url.searchParams.get('lang') || cfg.target;
      const text = url.searchParams.get('text') || '';
      const rendered = await speech.render(text, lang);
      if (!rendered) return json(res, { error: 'no offline voice for that language' }, 404);
      res.writeHead(200, { 'content-type': 'audio/wav', 'cache-control': 'no-store' });
      return res.end(readFileSync(rendered.file));
    }

    if (req.method === 'GET' && url.pathname === '/clone/preview') {
      const cfg = config();
      const from = url.searchParams.get('from') || '';
      const to = url.searchParams.get('to') || cfg.target;
      const source = db.deckIdIfAny(cfg.native, from);
      if (source === null) return json(res, { error: 'no such deck' }, 404);
      const skip = copiedInto(cfg.native, to);
      const filter = filterOf(url);
      const wanted = selectForClone(db.cardsOfDeck(source), {
        categories: filter.category,
        levels: filter.cefr,
        skip,
        native: cfg.native,
      });
      return json(res, { from, to, count: wanted.length, already: skip.size });
    }

    if (req.method === 'GET' && url.pathname === '/clone/sources') {
      const cfg = config();
      const to = url.searchParams.get('to') || cfg.target;
      const skip = copiedInto(cfg.native, to);
      const concepts = conceptsInto(cfg.native, to);
      const sources = db
        .deckPairsWithCounts()
        .filter((pair) => pair.total > 0 && !(pair.native === cfg.native && pair.target === to))
        .map((pair) => {
          const home = pair.native === cfg.native;
          return {
            code: pair.target,
            deck: `${pair.native}>${pair.target}`,
            native: pair.native,
            translated: !home,
            total: pair.total,
            fresh: selectForClone(db.cardsOfDeck(db.deckIdIfAny(pair.native, pair.target)), {
              skip,
              concepts: home ? concepts : new Set(),
              native: pair.native,
            }).length,
          };
        });
      return json(res, { to, native: cfg.native, sources });
    }

    if (req.method === 'POST' && url.pathname === '/clone') {
      const payload = await payloadOf(req, res);
      if (!payload) return;
      const cfg = config();
      const to = String(payload.to || '');
      const asked = Array.isArray(payload.sources) ? payload.sources : [payload.from];
      const list = [...new Set(asked.map((code) => String(code || '').toLowerCase()).filter(Boolean))];
      if (!list.length) return json(res, { error: 'a clone needs a source deck' }, 400);
      for (const from of list) {
        const pair = sourcePair(from, cfg.native);
        if (pair.native === cfg.native && pair.target === to) {
          return json(res, { error: 'a deck cannot be cloned onto itself' }, 400);
        }
        if (db.deckIdIfAny(pair.native, pair.target) === null) {
          return json(res, { error: `no ${pair.native}>${pair.target} deck to copy from` }, 400);
        }
      }
      try {
        const plans = list.map((from) =>
          planClone({
            from,
            to,
            categories: Array.isArray(payload.categories) ? payload.categories : [],
            levels: Array.isArray(payload.levels) ? payload.levels : [],
          }),
        );
        const saved = saveSettings({ target: to });
        buildInBackground();
        return json(res, {
          ...plans[plans.length - 1],
          from: list,
          queued: plans.reduce((sum, plan) => sum + plan.queued, 0),
          config: saved,
        });
      } catch (error) {
        return json(res, { error: error.message }, 400);
      }
    }

    if (req.method === 'POST' && url.pathname === '/alphabet') {
      const cfg = config();
      const record = alphabetRecord(cfg.native, cfg.target);
      if (!record) return json(res, { error: 'no alphabet for that language' }, 404);
      appendJsonl(queueFile(cfg.target), [record]);
      buildInBackground();
      return json(res, { ok: true, letters: record.letters.length, target: cfg.target });
    }

    if (req.method === 'GET' && url.pathname === '/intervals') {
      const id = url.searchParams.get('id');
      if (!knownId(id)) return json(res, { error: 'unknown card id' }, 404);
      return json(res, intervals(id));
    }

    if (req.method === 'POST' && url.pathname === '/grade') {
      const payload = await payloadOf(req, res);
      if (!payload) return;
      if (!RATINGS[payload.rating]) return json(res, { error: 'rating must be 1..4' }, 400);
      if (!knownId(payload.id)) return json(res, { error: 'unknown card id' }, 404);
      const cfg = config();
      const result = grade(payload.id, RATINGS[payload.rating], {
        mode: typeof payload.mode === 'string' ? payload.mode.slice(0, 20) : 'flashcards',
        ms: Number(payload.ms) || 0,
        sessionId: Number.isFinite(payload.sessionId) ? payload.sessionId : null,
      });
      writeSnapshots(cfg.native, cfg.target);
      return json(res, result);
    }

    if (req.method === 'POST' && url.pathname === '/favorite') {
      const payload = await payloadOf(req, res);
      if (!payload) return;
      if (!knownId(payload.id)) return json(res, { error: 'unknown card id' }, 404);
      db.setStar(payload.id, payload.on !== false);
      return json(res, { ok: true, favorite: payload.on !== false });
    }

    if (req.method === 'POST' && url.pathname === '/deck/delete') {
      const payload = await payloadOf(req, res);
      if (!payload) return;
      const native = String(payload.native || '').toLowerCase();
      const target = String(payload.target || '').toLowerCase();
      const deckId = db.deckIdIfAny(native, target);
      if (deckId === null) return json(res, { error: 'no such deck' }, 404);

      const removed = db.deleteDeckCards(deckId);
      const left = db.deckPairsWithCounts().filter((pair) => pair.total > 0);
      const teaches = left.some((pair) => pair.target === target);
      const cfg = config();
      const patch = {};
      if (!teaches) {
        patch.targets = (cfg.targets || []).filter((code) => code !== target);
        patch.paused = (cfg.paused || []).filter((code) => code !== target);
        writeLines(queueFile(target), []);
      }
      if (cfg.native === native && cfg.target === target) {
        const next = left[0];
        if (next) {
          patch.native = next.native;
          patch.target = next.target;
        }
      }
      const saved = Object.keys(patch).length ? saveSettings(patch) : cfg;
      log(`deck deleted ${JSON.stringify({ native, target, removed })}`);
      return json(res, { ok: true, removed, native, target, config: saved });
    }

    if (req.method === 'GET' && url.pathname === '/duplicates') {
      const cfg = config();
      const groups = db.conceptsShared(currentDeck(cfg)).map((group) => ({
        concept: group.concept,
        meaning: group.meaning,
        cards: group.cards.map((card, index) => ({
          id: card.id,
          repeat: group.cards
            .slice(0, index)
            .some((earlier) => sameWord(earlier.front, card.front, cfg.target)),
          front: card.front,
          back: card.back,
          example: card.example,
          reading: card.reading,
          cefr: card.cefr,
          category: card.category,
          created_at: card.created_at,
          isFavorite: card.starred,
        })),
      }));
      return json(res, { native: cfg.native, target: cfg.target, groups });
    }

    if (req.method === 'POST' && url.pathname === '/known') {
      const payload = await payloadOf(req, res);
      if (!payload) return;
      if (!knownId(payload.id)) return json(res, { error: 'unknown card id' }, 404);
      db.setKnown(payload.id, payload.on !== false);
      return json(res, { ok: true, known: payload.on !== false });
    }

    if (req.method === 'POST' && url.pathname === '/delete') {
      const payload = await payloadOf(req, res);
      if (!payload) return;
      if (!knownId(payload.id)) return json(res, { error: 'unknown card id' }, 404);
      const reason = textIn(payload.reason, MAX_CHARS.reason);
      return json(res, remove(payload.id, reason));
    }

    if (req.method === 'GET' && url.pathname === '/stopwords') {
      const cfg = config();
      return json(res, { lang: cfg.target, skip: [...notWorthTapping(cfg)] });
    }

    if (req.method === 'POST' && url.pathname === '/words') {
      const payload = await payloadOf(req, res);
      if (!payload) return;
      const cfg = config();
      const records = pickRecords(payload.words, payload.example, cfg);
      if (!records.length) return json(res, { error: 'no words to build' }, 400);
      appendJsonl(queueFile(cfg.target), records);
      buildInBackground();
      return json(res, { ok: true, queued: records.length, target: cfg.target });
    }

    if (req.method === 'POST' && url.pathname === '/rewrite') {
      const payload = await payloadOf(req, res);
      if (!payload) return;
      if (!knownId(payload.id)) return json(res, { error: 'unknown card id' }, 404);
      const cfg = config();
      const card = db.cardById(payload.id);
      appendJsonl(queueFile(cfg.target), [rewriteRecord(card, cfg, card.front)]);
      buildInBackground();
      return json(res, { ok: true, id: card.id });
    }

    if (req.method === 'POST' && url.pathname === '/restore') {
      const payload = await payloadOf(req, res);
      if (!payload) return;
      if (typeof payload.id !== 'string' || !/^[0-9a-f]{10}$/.test(payload.id)) {
        return json(res, { error: 'unknown card id' }, 404);
      }
      db.restoreCard(payload.id);
      return json(res, { ok: true, card: db.cardById(payload.id) });
    }

    if (req.method === 'POST' && url.pathname === '/card') {
      const payload = await payloadOf(req, res);
      if (!payload) return;
      if (!knownId(payload.id)) return json(res, { error: 'unknown card id' }, 404);
      const patch = {};
      for (const key of ['front', 'back', 'example', 'note', 'reading', 'form']) {
        if (typeof payload[key] === 'string') patch[key] = textIn(payload[key], MAX_CHARS.field);
      }
      if (typeof payload.ipa === 'string') patch.ipa = keepIpa({ ipa: textIn(payload.ipa, MAX_CHARS.ipa) });
      if (payload.category !== undefined) patch.category = normalizeCategory(payload.category);
      if (payload.cefr !== undefined) patch.cefr = normalizeCefr(payload.cefr);
      if (payload.topic !== undefined) patch.topic = normalizeTopic(payload.topic);
      if (patch.front === '' || patch.back === '') {
        return json(res, { error: 'front and back cannot be empty' }, 400);
      }
      db.updateCard(payload.id, patch);
      const cfg = config();
      writeSnapshots(cfg.native, cfg.target, { force: true });
      return json(res, { ok: true, card: db.cardById(payload.id) });
    }

    if (req.method === 'POST' && url.pathname === '/topic/rename') {
      const payload = await payloadOf(req, res);
      if (!payload) return;
      const category = String(payload.category || '');
      const from = normalizeTopic(payload.from);
      const to = normalizeTopic(payload.to);
      if (!CATEGORIES.includes(category)) return json(res, { error: 'unknown category' }, 400);
      if (!to) return json(res, { error: 'a chapter needs a name' }, 400);
      const cfg = config();
      const moved = db.renameTopic(db.deckId(cfg.native, cfg.target), category, from, to);
      return json(res, { ok: true, moved, topic: to });
    }

    if (req.method === 'POST' && url.pathname === '/session/start') {
      const payload = await payloadOf(req, res);
      if (!payload) return;
      const cfg = config();
      const now = new Date();
      const { id: deckId, state, cards, due } = deck(now, cfg);
      const category = CATEGORIES.includes(payload.category) ? payload.category : '';
      const level = CEFR_LEVELS.includes(payload.level) ? payload.level : '';
      const minutes = SESSION_LENGTHS.includes(Number(payload.minutes)) ? Number(payload.minutes) : cfg.sessionMinutes;
      const exclude = new Set((Array.isArray(payload.exclude) ? payload.exclude : []).filter(knownId));
      const wantedTopic = normalizeTopic(payload.topic);
      const topic = wantedTopic && cards.some((card) => card.topic === wantedTopic) ? wantedTopic : '';
      const include = new Set(
        (Array.isArray(payload.include) ? payload.include : []).slice(0, MAX_IDS).filter(knownId),
      );

      const asked = (card) =>
        !exclude.has(card.id) &&
        (!category || card.category === category) &&
        (!level || card.cefr === level) &&
        (!topic || card.topic === topic) &&
        (!include.size || include.has(card.id));
      const wanted = due.filter(asked);
      const unseen = cards.filter((card) => !state.has(card.id) && asked(card));
      const enough = cards.length >= 4;
      const shape = (card) => {
        const entry = state.get(card.id);
        return {
          id: card.id,
          category: card.category,
          example: card.example,
          front: card.front,
          type: card.type,
          seen: !!entry,
          reps: entry ? entry.reps : 0,
          stability: entry ? entry.stability : 0,
          retrievability: entry ? analytics.retrievabilityOf(entry, now) : 0,
          hasDistractors: enough,
        };
      };

      const plan = planSession({
        due: wanted.map(shape),
        fresh: unseen.map(shape),
        minutes,
        newLimit: Math.max(0, cfg.dailyLimit - db.newCardsToday(deckId)),
        exercises: cfg.exercises,
      });
      if (!plan.steps.length) return json(res, { error: 'nothing is due in that group' }, 409);

      const sessionId = db.openSession(deckId, minutes, plan.steps.length);
      return json(res, { sessionId, ...plan, category, level, topic });
    }

    if (req.method === 'POST' && url.pathname === '/session/end') {
      const payload = await payloadOf(req, res);
      if (!payload) return;
      const id = Number(payload.id);
      if (!Number.isFinite(id)) return json(res, { error: 'unknown session' }, 400);
      const row = db.closeSession(id);
      if (!row) return json(res, { error: 'unknown session' }, 404);
      const learned = db
        .all(
          `SELECT r.card_id AS id, c.front AS front FROM reviews r JOIN cards c ON c.id = r.card_id
           JOIN fsrs_state s ON s.card_id = r.card_id
           WHERE r.session_id = ? AND s.stability >= 21 AND r.stability_before < 21
           GROUP BY r.card_id`,
          id,
        )
        .map((row) => row.front);
      const toughest = db.get(
        `SELECT c.front, c.back, c.example, COUNT(*) AS misses FROM reviews r JOIN cards c ON c.id = r.card_id
         WHERE r.session_id = ? AND r.rating = 1 GROUP BY r.card_id ORDER BY misses DESC LIMIT 1`,
        id,
      );
      const words = db
        .all(
          `SELECT DISTINCT c.front AS front FROM reviews r JOIN cards c ON c.id = r.card_id
           WHERE r.session_id = ? AND r.rating >= 2 LIMIT 8`,
          id,
        )
        .map((row) => row.front);
      const cfg = config();
      writeSnapshots(cfg.native, cfg.target, { force: true });
      return json(res, {
        ...row,
        accuracy: row.reviewed ? row.correct / row.reviewed : 0,
        learned,
        toughest,
        words,
        produce: cfg.produce !== false && words.length >= 2 && (row.reviewed || 0) >= 2,
      });
    }

    if (req.method === 'POST' && url.pathname === '/produce') {
      const payload = await payloadOf(req, res);
      if (!payload) return;
      const cfg = config();
      if (cfg.produce === false) return json(res, { error: 'production practice is switched off' }, 409);
      const sentence = textIn(payload.sentence, MAX_CHARS.sentence);
      const words = (Array.isArray(payload.words) ? payload.words : [])
        .filter((word) => typeof word === 'string')
        .slice(0, 8);
      if (!sentence || words.length < 2) return json(res, { error: 'write one sentence using two of them' }, 400);

      let reply;
      try {
        const effort = effortFor('sentence');
        const answer = await askFull(`The learner wrote:\n${sentence}\n`, () => {}, {
          system: PRODUCE_BRIEF(cfg, words),
          effort,
        });
        reply = answer.text;
        recordUsage({ kind: 'sentence', model: modelFor(cfg), effort, target: cfg.target, records: 1, cards: 0, ...answer.usage });
      } catch (error) {
        return json(res, { error: error.message }, 502);
      }

      let parsed = { line: '', used: [] };
      try {
        const start = reply.indexOf('{');
        const end = reply.lastIndexOf('}');
        parsed = JSON.parse(reply.slice(start, end + 1));
      } catch {
        parsed = { line: String(reply).trim().split('\n').filter(Boolean).pop() || '', used: [] };
      }

      const deckId = currentDeck(cfg);
      const byFront = new Map(db.cardsOfDeck(deckId).map((card) => [card.front.toLowerCase(), card]));
      const used = (Array.isArray(parsed.used) ? parsed.used : [])
        .map((word) => byFront.get(String(word).toLowerCase()))
        .filter(Boolean);
      for (const card of used) {
        if (db.reviewedTodayWithMode(card.id, 'produce')) continue;
        grade(card.id, Rating.Good, { mode: 'produce', deckId });
      }
      return json(res, { line: String(parsed.line || '').slice(0, 300), used: used.map((card) => card.front) });
    }

    if (req.method === 'GET' && url.pathname === '/cloze') {
      const id = url.searchParams.get('id');
      if (!knownId(id)) return json(res, { error: 'unknown card id' }, 404);
      return json(res, clozeOf(db.cardById(id)) || { error: 'no cloze for this card' });
    }

    if (req.method === 'GET' && url.pathname === '/api/analytics/export.csv') {
      const csv = analytics.exportCsv(currentDeck(), filterOf(url));
      res.writeHead(200, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="loanword-analytics.csv"',
      });
      return res.end(csv);
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/analytics/')) {
      const name = url.pathname.slice('/api/analytics/'.length);
      const handler = ANALYTICS[name];
      if (!handler) return json(res, { error: 'unknown report' }, 404);
      const started = performance.now();
      const body = handler(currentDeck(), filterOf(url));
      return json(res, { ...body, ms: Math.round((performance.now() - started) * 100) / 100 });
    }

    if (req.method === 'GET' && url.pathname === '/export.csv') {
      const cfg = config();
      const wanted = new Set(
        (url.searchParams.get('decks') || '')
          .split(',')
          .map((pair) => pair.trim().toLowerCase())
          .filter(Boolean),
      );
      const cards =
        url.searchParams.get('deck') === 'current'
          ? deck(new Date(), cfg).cards
          : loadCards().filter((card) => !wanted.size || wanted.has(`${card.native}>${card.target}`));
      const csv = toCsv(cards, cfg);
      writeCsv(csv);
      res.writeHead(200, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="loanword.csv"',
      });
      return res.end(csv);
    }

    if (req.method === 'GET') {
      const file = staticFile(url.pathname);
      if (file) return send(res, 200, file.type, file.body);
    }

    return json(res, { error: 'not found' }, 404);
  } catch (err) {
    log(`serve ${url.pathname}: ${err?.stack || err}`);
    if (!res.headersSent) return json(res, { error: String(err?.message || err) }, 500);
    return res.end();
  }
});

server.requestTimeout = 30_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Loanword is already running at http://localhost:${PORT}`);
    process.exit(0);
  }
  log(`serve listen: ${err?.stack || err}`);
  console.error(String(err));
  process.exit(1);
});

process.on('unhandledRejection', (err) => log(`serve unhandled rejection: ${err?.stack || err}`));

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => quit(signal));
}

if (buildBeforeServing(db.totalCards(), queueSizes().reduce((sum, row) => sum + row.queued, 0))) {
  const { build } = await import('./build.mjs');
  console.log('First run — building your cards, this takes a minute…');
  await build({ onBatch: (n, total, code) => console.log(`  batch ${n} of ${total} for ${code}…`) }).catch((error) =>
    console.error(`Build failed, nothing was lost: ${error.message}`),
  );
}

ingestWild();
speech.warm(activeTargets(config()));

server.listen(PORT, HOST, () => {
  const host = LAN ? lanAddress() : 'localhost';
  const url = `http://${host}:${PORT}${TOKEN ? `/?token=${TOKEN}` : ''}`;
  const cfg = config();
  const { cards, due } = deck(new Date(), cfg);
  writeSnapshots(cfg.native, cfg.target, { force: true });
  console.log(
    banner({ url, cfg, total: cards.length, due: due.length, data: tildify(DATA), idleMinutes: IDLE_MS / 60_000 }),
  );
  keepAlive();

  if (buildInBackground()) console.log(dim('building cards from the queue in the background…'));
  if (argv.includes('--no-open') || LAN) return;
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  spawn(opener, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref();
});
