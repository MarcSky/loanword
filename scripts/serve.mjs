#!/usr/bin/env node
// Local review server. Loopback only; nothing leaves the machine.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createEmptyCard, fsrs, generatorParameters, Rating } from 'ts-fsrs';
import { toCsv, writeCsv } from './export-anki.mjs';
import { config, loadCards, log, paths, PLUGIN_ROOT, readJson, writeJson, ymd } from './store.mjs';

const PORT = Number(process.env.LOANWORD_PORT) || 4747;
const MAX_BODY_BYTES = 64 * 1024;
const LEARNED_STABILITY_DAYS = 21;
const MAX_STREAK_LOOKBACK_DAYS = 3650;

const cfg = config();
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
  };
  return state;
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

function deck(now = new Date()) {
  const state = loadState();
  const deleted = new Set(state._meta.deleted);
  const cards = loadCards().filter((card) => !deleted.has(card.id));
  const today = ymd(now);

  const scheduled = cards.filter((card) => state[card.id] && new Date(state[card.id].due) <= now);
  const room = Math.max(0, cfg.dailyLimit - (state._meta.new_by_day[today] || 0));
  const unseen = cards.filter((card) => !state[card.id]).slice(0, room);

  // Reviews first: they are the ones that decay if skipped.
  return { state, cards, due: [...scheduled, ...unseen] };
}

function stats() {
  const { state, cards, due } = deck();
  const seen = cards.filter((card) => state[card.id]);

  let streak = 0;
  const day = new Date();
  for (let i = 0; i < MAX_STREAK_LOOKBACK_DAYS; i++, day.setDate(day.getDate() - 1)) {
    const key = ymd(day);
    if (state._meta.reviews_by_day[key]) streak++;
    else if (streak > 0 || key !== ymd()) break; // today may simply not have started yet
  }

  return {
    total: cards.length,
    seen: seen.length,
    learned: seen.filter((card) => state[card.id].stability >= LEARNED_STABILITY_DAYS).length,
    due_now: due.length,
    streak,
    reviewed_today: state._meta.reviews_by_day[ymd()] || 0,
    daily_limit: cfg.dailyLimit,
    hardest: seen
      .map((card) => ({
        front: card.front,
        back: card.back,
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

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      return send(res, 200, 'text/html; charset=utf-8', readFileSync(join(PLUGIN_ROOT, 'ui', 'index.html')));
    }

    if (req.method === 'GET' && url.pathname === '/due') {
      const { state, due } = deck();
      return json(res, {
        config: { native: cfg.native, target: cfg.target, limit: cfg.dailyLimit },
        cards: due.map((card) => ({ ...card, isNew: !state[card.id] })),
      });
    }

    if (req.method === 'GET' && url.pathname === '/stats') return json(res, stats());

    if (req.method === 'POST' && url.pathname === '/grade') {
      const payload = await payloadOf(req, res);
      if (!payload) return;
      const rating = RATINGS[payload.rating];
      if (!rating) return json(res, { error: 'rating must be 1..4' }, 400);
      if (!knownId(payload.id)) return json(res, { error: 'unknown card id' }, 404);
      return json(res, grade(payload.id, rating));
    }

    if (req.method === 'POST' && url.pathname === '/delete') {
      const payload = await payloadOf(req, res);
      if (!payload) return;
      if (!knownId(payload.id)) return json(res, { error: 'unknown card id' }, 404);
      return json(res, remove(payload.id, String(payload.reason || '').slice(0, 200)));
    }

    if (req.method === 'GET' && url.pathname === '/export.csv') {
      const { state, cards } = deck();
      const csv = toCsv(cards, state, cfg);
      writeCsv(csv);
      res.writeHead(200, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="loanword.csv"',
      });
      return res.end(csv);
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
