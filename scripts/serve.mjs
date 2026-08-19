#!/usr/bin/env node
// Local review server. Loopback only; nothing leaves the machine.
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { join, normalize, resolve, sep } from 'node:path';
import { createEmptyCard, fsrs, generatorParameters, Rating } from 'ts-fsrs';
import { toCsv, writeCsv } from './export-anki.mjs';
import { exportToVault } from './obsidian.mjs';
import { languages as dictionaries } from './i18n.mjs';
import {
  CATEGORIES,
  CEFR_LEVELS,
  cardsForPair,
  config,
  deckPairs,
  loadCards,
  log,
  paths,
  PLUGIN_ROOT,
  readJson,
  saveSettings,
  writeJson,
  ymd,
} from './store.mjs';

const PORT = Number(process.env.LOANWORD_PORT) || 4747;
const MAX_BODY_BYTES = 64 * 1024;
const LEARNED_STABILITY_DAYS = 21;
const MAX_STREAK_LOOKBACK_DAYS = 3650;
const ACTIVITY_DAYS = 84; // twelve weeks: enough to see a habit, short enough to read at a glance
const RTL_LANGUAGES = new Set(['ar', 'he', 'fa', 'ur']);

const scheduler = fsrs(generatorParameters({ enable_fuzz: true }));
const RATINGS = { 1: Rating.Again, 2: Rating.Hard, 3: Rating.Good, 4: Rating.Easy };
const EMPTY_META = { new_by_day: {}, reviews_by_day: {}, deleted: [] };

function loadState() {
  const stored = readJson(paths.state, {});
  const state = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  const meta = state._meta && typeof state._meta === 'object' ? state._meta : {};
  state._meta = {
    new_by_day: meta.new_by_day && typeof meta.new_by_day === 'object' ? meta.new_by_day : {},
    reviews_by_day: meta.reviews_by_day && typeof meta.reviews_by_day === 'object' ? meta.reviews_by_day : {},
    deleted: Array.isArray(meta.deleted) ? meta.deleted.filter((id) => typeof id === 'string') : [],
    favorites: Array.isArray(meta.favorites) ? meta.favorites.filter((id) => typeof id === 'string') : [],
  };
  return state;
}

/** A star is not a schedule change: it never touches FSRS state. */
function favorite(id, on) {
  const state = loadState();
  const set = new Set(state._meta.favorites);
  if (on) set.add(id);
  else set.delete(id);
  state._meta.favorites = [...set];
  writeJson(paths.state, state);
  return { ok: true, favorite: on };
}

/** JSON round-trips Dates to strings; ts-fsrs wants them back. */
function reviveCard(stored) {
  const due = new Date(stored.due);
  if (Number.isNaN(due.getTime())) return createEmptyCard(new Date()); // corrupted entry: reschedule from scratch
  const lastReview = stored.last_review ? new Date(stored.last_review) : undefined;
  return {
    ...stored,
    due,
    last_review: lastReview && !Number.isNaN(lastReview.getTime()) ? lastReview : undefined,
  };
}

/**
 * The deck is scoped to the language pair in the settings. Cards from any other
 * pair stay on disk with their schedule intact — switching target language
 * opens a second deck, it never discards the first.
 */
function deck(now = new Date(), cfg = config()) {
  const state = loadState();
  const deleted = new Set(state._meta.deleted);
  const pair = { native: cfg.native, target: cfg.target };
  const cards = cardsForPair(pair).filter((card) => !deleted.has(card.id));
  const today = ymd(now);

  const scheduled = cards.filter((card) => state[card.id] && new Date(state[card.id].due) <= now);
  const room = Math.max(0, cfg.dailyLimit - (state._meta.new_by_day[today] || 0));
  const unseen = cards.filter((card) => !state[card.id]).slice(0, room);

  // Reviews first: they are the ones that decay if skipped.
  return { state, cards, due: [...scheduled, ...unseen] };
}

/** 0 at first sight, 1 once FSRS trusts the card for three weeks. Drives every ring in the UI. */
const masteryOf = (entry) =>
  entry ? Math.max(0, Math.min(1, entry.stability / LEARNED_STABILITY_DAYS)) : 0;

function streakOf(state) {
  let streak = 0;
  const day = new Date();
  for (let i = 0; i < MAX_STREAK_LOOKBACK_DAYS; i++, day.setDate(day.getDate() - 1)) {
    const key = ymd(day);
    if (state._meta.reviews_by_day[key]) streak++;
    else if (streak > 0 || key !== ymd()) break; // today may simply not have started yet
  }
  return streak;
}

/** One row per bucket, always all of them: a filter that appears and vanishes is worse than an empty one. */
function breakdown(keys, cards, state, keyOf) {
  return keys.map((key) => {
    const owned = cards.filter((card) => keyOf(card) === key);
    const seen = owned.filter((card) => state[card.id]);
    return {
      key,
      total: owned.length,
      seen: seen.length,
      learned: seen.filter((card) => state[card.id].stability >= LEARNED_STABILITY_DAYS).length,
      mastery: owned.length
        ? owned.reduce((sum, card) => sum + masteryOf(state[card.id]), 0) / owned.length
        : 0,
    };
  });
}

function stats() {
  const cfg = config();
  const { state, cards, due } = deck(new Date(), cfg);
  const seen = cards.filter((card) => state[card.id]);

  const activity = [];
  const day = new Date();
  day.setDate(day.getDate() - (ACTIVITY_DAYS - 1));
  for (let i = 0; i < ACTIVITY_DAYS; i++, day.setDate(day.getDate() + 1)) {
    const date = ymd(day);
    activity.push({ date, reviews: state._meta.reviews_by_day[date] || 0 });
  }

  return {
    total: cards.length,
    seen: seen.length,
    learned: seen.filter((card) => state[card.id].stability >= LEARNED_STABILITY_DAYS).length,
    due_now: due.length,
    streak: streakOf(state),
    reviewed_today: state._meta.reviews_by_day[ymd()] || 0,
    daily_limit: cfg.dailyLimit,
    mastery: cards.length
      ? cards.reduce((sum, card) => sum + masteryOf(state[card.id]), 0) / cards.length
      : 0,
    activity,
    categories: breakdown(CATEGORIES, cards, state, (card) => card.category),
    levels: breakdown(CEFR_LEVELS, cards, state, (card) => card.cefr),
    hardest: seen
      .map((card) => ({
        front: card.front,
        back: card.back,
        category: card.category,
        cefr: card.cefr,
        lapses: state[card.id].lapses,
        difficulty: state[card.id].difficulty,
      }))
      .sort((a, b) => b.lapses - a.lapses || b.difficulty - a.difficulty)
      .slice(0, 5),
  };
}

function grade(id, rating) {
  const state = loadState();
  const isNew = !state[id];
  const previous = isNew ? createEmptyCard(new Date()) : reviveCard(state[id]);
  const { card } = scheduler.next(previous, new Date(), rating);
  state[id] = card;
  const today = ymd();
  if (isNew) state._meta.new_by_day[today] = (state._meta.new_by_day[today] || 0) + 1;
  state._meta.reviews_by_day[today] = (state._meta.reviews_by_day[today] || 0) + 1;
  writeJson(paths.state, state);
  return { ok: true, due: card.due };
}

function remove(id, reason) {
  const state = loadState();
  if (!state._meta.deleted.includes(id)) state._meta.deleted.push(id);
  writeJson(paths.state, state);
  log(`card deleted id=${id} reason=${reason || 'unspecified'}`); // feeds the junk-rate metric
  return { ok: true };
}

if (process.argv.includes('--stats')) {
  console.log(JSON.stringify(stats(), null, 2));
  process.exit(0);
}

const TOO_LARGE = Symbol('too large');

/**
 * Reads at most MAX_BODY_BYTES. Buffered chunks are released the moment the cap
 * is passed, so an endless upload cannot grow the process.
 */
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

/** Returns a parsed body, or null after having already answered the request. */
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

/**
 * Only ids that exist in the deck are ever used as object keys. Besides
 * rejecting typos, this keeps a request from writing to `__proto__`.
 */
function knownId(id) {
  if (typeof id !== 'string' || !/^[0-9a-f]{10}$/.test(id)) return false;
  return loadCards().some((card) => card.id === id);
}

const UI_ROOT = resolve(join(PLUGIN_ROOT, 'ui'));

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Anything under ui/ is public; nothing above it is. The resolved path has to
 * still start with UI_ROOT, so `../../.ssh/id_rsa` resolves out of bounds and
 * is refused rather than read.
 */
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

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      return send(res, 200, 'text/html; charset=utf-8', readFileSync(join(UI_ROOT, 'index.html')));
    }

    if (req.method === 'GET' && url.pathname === '/due') {
      const cfg = config();
      const { state, due } = deck(new Date(), cfg);
      return json(res, {
        config: { native: cfg.native, target: cfg.target, limit: cfg.dailyLimit },
        cards: due.map((card) => ({ ...card, isNew: !state[card.id] })),
      });
    }

    // One round trip for the whole app: the deck is a personal one, and a
    // second fetch per screen buys nothing but latency between tabs.
    if (req.method === 'GET' && url.pathname === '/state') {
      const cfg = config();
      const { state, cards, due } = deck(new Date(), cfg);
      const dueIds = new Set(due.map((card) => card.id));
      const favorites = new Set(state._meta.favorites);
      const deleted = new Set(state._meta.deleted);
      return json(res, {
        config: cfg,
        categories: CATEGORIES,
        levels: CEFR_LEVELS,
        // Every deck on disk, so the UI can offer a switch rather than
        // pretending the other languages stopped existing.
        pairs: deckPairs(loadCards().filter((card) => !deleted.has(card.id))),
        uiLanguages: dictionaries(),
        stats: stats(),
        cards: cards.map((card) => {
          const entry = state[card.id];
          return {
            ...card,
            isNew: !entry,
            isDue: dueIds.has(card.id),
            isFavorite: favorites.has(card.id),
            due: entry ? entry.due : null,
            reps: entry ? entry.reps : 0,
            lapses: entry ? entry.lapses : 0,
            mastery: masteryOf(entry),
          };
        }),
      });
    }

    if (req.method === 'GET' && url.pathname === '/settings') return json(res, config());

    // The interface speaks the user's native language. Dictionaries are
    // gettext-style (the English sentence is the key), so a missing file just
    // means English, never a broken screen.
    if (req.method === 'GET' && url.pathname === '/i18n') {
      const cfg = config();
      const lang = cfg.uiLang || cfg.native;
      const file = resolve(join(UI_ROOT, 'i18n', `${lang}.json`));
      const strings = file.startsWith(UI_ROOT + sep) ? readJson(file, null) : null;
      const known = strings && typeof strings === 'object' && !Array.isArray(strings);
      return json(res, {
        lang: known ? lang : 'en',
        dir: known && RTL_LANGUAGES.has(lang) ? 'rtl' : 'ltr',
        strings: known ? strings : {},
      });
    }

    if (req.method === 'POST' && url.pathname === '/settings') {
      const payload = await payloadOf(req, res);
      if (!payload) return;
      return json(res, saveSettings(payload));
    }

    if (req.method === 'GET' && url.pathname === '/stats') return json(res, stats());

    // Writes markdown into the user's own Obsidian vault. Their vault sync is
    // what carries it to the phone; there is no Obsidian plugin involved.
    if (req.method === 'POST' && url.pathname === '/obsidian') {
      const payload = await payloadOf(req, res);
      if (!payload) return;
      try {
        return json(res, exportToVault(payload.vault || config().vault));
      } catch (error) {
        return json(res, { error: String(error?.message || error) }, 400);
      }
    }

    if (req.method === 'POST' && url.pathname === '/grade') {
      const payload = await payloadOf(req, res);
      if (!payload) return;
      const rating = RATINGS[payload.rating];
      if (!rating) return json(res, { error: 'rating must be 1..4' }, 400);
      if (!knownId(payload.id)) return json(res, { error: 'unknown card id' }, 404);
      return json(res, grade(payload.id, rating));
    }

    if (req.method === 'POST' && url.pathname === '/favorite') {
      const payload = await payloadOf(req, res);
      if (!payload) return;
      if (!knownId(payload.id)) return json(res, { error: 'unknown card id' }, 404);
      return json(res, favorite(payload.id, payload.on !== false));
    }

    if (req.method === 'POST' && url.pathname === '/delete') {
      const payload = await payloadOf(req, res);
      if (!payload) return;
      if (!knownId(payload.id)) return json(res, { error: 'unknown card id' }, 404);
      return json(res, remove(payload.id, String(payload.reason || '').slice(0, 200)));
    }

    if (req.method === 'GET' && url.pathname === '/export.csv') {
      const cfg = config();
      const { state } = deck(new Date(), cfg);
      // Export is a backup: every deck, not only the one currently open.
      // `?deck=current` narrows it to the active pair.
      const cards = url.searchParams.get('deck') === 'current' ? deck(new Date(), cfg).cards : loadCards();
      const csv = toCsv(cards, state, cfg);
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

// A single stuck client must not hold a socket open for the whole session.
server.requestTimeout = 30_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Loanword review already running at http://localhost:${PORT}`);
    process.exit(0);
  }
  log(`serve listen: ${err?.stack || err}`);
  console.error(String(err));
  process.exit(1);
});

process.on('unhandledRejection', (err) => log(`serve unhandled rejection: ${err?.stack || err}`));

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Loanword review at http://localhost:${PORT}`);
});
