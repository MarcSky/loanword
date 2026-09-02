import { fsrs, generatorParameters } from 'ts-fsrs';
import * as db from './db.mjs';
import { CATEGORIES, CEFR_LEVELS, config, masteryOf } from './store.mjs';

const engine = fsrs(generatorParameters({ enable_fuzz: false }));

export const DAY_MS = 86_400_000;

export const dayKey = db.localDay;

export function shiftDay(days, from = new Date()) {
  const date = new Date(from);
  date.setDate(date.getDate() + days);
  return db.localDay(date);
}

function scope(deck, filter = {}) {
  const where = ['r.deck_id = ?'];
  const params = [deck];
  if (filter.from) {
    where.push('r.day >= ?');
    params.push(filter.from);
  }
  if (filter.to) {
    where.push('r.day <= ?');
    params.push(filter.to);
  }
  const cats = clean(filter.category, CATEGORIES);
  const levels = clean(filter.cefr, CEFR_LEVELS);
  if (cats.length) {
    where.push(`r.category IN (${cats.map(() => '?').join(',')})`);
    params.push(...cats);
  }
  if (levels.length) {
    where.push(`r.cefr IN (${levels.map(() => '?').join(',')})`);
    params.push(...levels);
  }
  return { join: '', where: where.join(' AND '), params };
}

function cardScope(deck, filter = {}, alias = '', { ignore = '' } = {}) {
  const at = alias ? `${alias}.` : '';
  const where = [`${at}deck_id = ?`, `${at}deleted_at IS NULL`];
  const params = [deck];
  const cats = ignore === 'category' ? [] : clean(filter.category, CATEGORIES);
  const levels = ignore === 'cefr' ? [] : clean(filter.cefr, CEFR_LEVELS);
  if (cats.length) {
    where.push(`${at}category IN (${cats.map(() => '?').join(',')})`);
    params.push(...cats);
  }
  if (levels.length) {
    where.push(`${at}cefr IN (${levels.map(() => '?').join(',')})`);
    params.push(...levels);
  }
  return { where: where.join(' AND '), params };
}

export function clean(value, allowed) {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  return list.map((item) => String(item).trim()).filter((item) => allowed.includes(item));
}

export function weeklyStreak(deck, goal = 5) {
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const day = shiftDay(-i);
    const row = db.get('SELECT COUNT(*) AS n FROM reviews WHERE deck_id = ? AND day = ?', deck, day);
    week.push({ day, reviews: row.n, hit: row.n > 0 });
  }
  const days = week.filter((entry) => entry.hit).length;
  return { week, days, goal, met: days >= goal };
}

export function retention(deck, days) {
  const from = shiftDay(-days + 1);
  const row = db.get(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN rating >= 3 THEN 1 ELSE 0 END) AS good
     FROM reviews WHERE deck_id = ? AND day >= ? AND rating > 0 AND was_new = 0`,
    deck,
    from,
  );
  return row.total ? row.good / row.total : 0;
}

export const LEARNED_DAYS = 21;

const narrowed = (filter) =>
  clean(filter.category, CATEGORIES).length > 0 || clean(filter.cefr, CEFR_LEVELS).length > 0;

export function deckTotals(deck, filter = {}, now = new Date()) {
  if (!narrowed(filter)) {
    const cards = db.get(
      'SELECT COUNT(*) AS total FROM cards WHERE deck_id = ? AND deleted_at IS NULL',
      deck,
    );
    const state = db.get(
      `SELECT COUNT(*) AS seen,
              SUM(CASE WHEN due <= ? THEN 1 ELSE 0 END) AS due_now,
              SUM(CASE WHEN stability >= ? THEN 1 ELSE 0 END) AS learned,
              SUM(MIN(stability / ?, 1.0)) AS mastery_sum
       FROM fsrs_state WHERE deck_id = ?`,
      now.toISOString(),
      LEARNED_DAYS,
      LEARNED_DAYS,
      deck,
    );
    const total = cards.total || 0;
    return {
      total,
      seen: state.seen || 0,
      unseen: total - (state.seen || 0),
      due_now: state.due_now || 0,
      learned: state.learned || 0,
      mastery: total ? (state.mastery_sum || 0) / total : 0,
    };
  }

  const { where, params } = cardScope(deck, filter, 'c');
  return db.get(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN s.card_id IS NULL THEN 1 ELSE 0 END) AS unseen,
            SUM(CASE WHEN s.card_id IS NOT NULL THEN 1 ELSE 0 END) AS seen,
            SUM(CASE WHEN s.due <= ? THEN 1 ELSE 0 END) AS due_now,
            SUM(CASE WHEN s.stability >= ? THEN 1 ELSE 0 END) AS learned,
            AVG(MIN(COALESCE(s.stability, 0) / ?, 1.0)) AS mastery
     FROM cards c LEFT JOIN fsrs_state s ON s.card_id = c.id
     WHERE ${where}`,
    now.toISOString(),
    LEARNED_DAYS,
    LEARNED_DAYS,
    ...params,
  );
}

export function summary(deck, filter = {}) {
  const cfg = config();
  const now = new Date();
  const today = db.localDay();
  const totals = deckTotals(deck, filter, now);

  const room = Math.max(0, cfg.dailyLimit - db.newCardsToday(deck, today));
  const unseen = totals.unseen || 0;

  const doneToday = db.get(
    'SELECT COUNT(*) AS n, SUM(duration_ms) AS ms FROM reviews WHERE deck_id = ? AND day = ?',
    deck,
    today,
  );
  const previous = db.get('SELECT COUNT(*) AS n FROM reviews WHERE deck_id = ? AND day = ?', deck, shiftDay(-1));

  const sessions = db.get(
    'SELECT COUNT(*) AS n, AVG(duration_ms) AS ms, AVG(reviewed) AS cards FROM sessions WHERE deck_id = ? AND ended_at IS NOT NULL',
    deck,
  );

  const spark = db.all(
    `SELECT day, COUNT(*) AS reviews FROM reviews
     WHERE deck_id = ? AND day >= ? GROUP BY day ORDER BY day`,
    deck,
    shiftDay(-13),
  );

  const streak = weeklyStreak(deck, cfg.weeklyGoal);

  return {
    deck,
    total: totals.total || 0,
    seen: totals.seen || 0,
    new: unseen,
    learned: totals.learned || 0,
    due_now: (totals.due_now || 0) + Math.min(room, unseen),
    due_reviews: totals.due_now || 0,
    due_new: Math.min(room, unseen),
    daily_limit: cfg.dailyLimit,
    reviewed_today: doneToday.n || 0,
    reviewed_yesterday: previous.n || 0,
    minutes_today: Math.round((doneToday.ms || 0) / 60_000),
    retention_7: retention(deck, 7),
    retention_30: retention(deck, 30),
    sessions: sessions.n || 0,
    avg_session_minutes: sessions.ms ? Math.round(sessions.ms / 60_000) : 0,
    avg_session_cards: sessions.cards ? Math.round(sessions.cards) : 0,
    junk_rate: db.junkRate(deck),
    mastery: totals.mastery || 0,
    streak,
    spark: fillDays(spark, 14, 'reviews'),
    wild_7: db.countReviewsWithMode(deck, 'wild', shiftDay(-6)),
    tomorrow: dueOn(deck, shiftDay(1), filter),
  };
}

function dueOn(deck, day, filter) {
  const end = `${day}T23:59:59.999Z`;
  if (!narrowed(filter)) {
    return db.get('SELECT COUNT(*) AS n FROM fsrs_state WHERE deck_id = ? AND due <= ?', deck, end).n;
  }
  const { where, params } = cardScope(deck, filter, 'c');
  return db.get(
    `SELECT COUNT(*) AS n FROM fsrs_state s JOIN cards c ON c.id = s.card_id
     WHERE s.due <= ? AND ${where}`,
    end,
    ...params,
  ).n;
}

function fillDays(rows, days, key) {
  const found = new Map(rows.map((row) => [row.day, row[key]]));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = shiftDay(-i);
    out.push({ day, value: found.get(day) || 0 });
  }
  return out;
}

export function calendar(deck, filter = {}) {
  const days = Math.max(7, Math.min(400, Number(filter.days) || 371));
  const from = shiftDay(-days + 1);
  const { join, where, params } = scope(deck, { ...filter, from: filter.from || from });
  const rows = db.all(
    `SELECT r.day AS day, COUNT(*) AS reviews, SUM(r.was_new) AS new_cards,
            SUM(r.duration_ms) AS duration_ms
     FROM reviews r${join} WHERE ${where} GROUP BY r.day ORDER BY r.day`,
    ...params,
  );
  const found = new Map(rows.map((row) => [row.day, row]));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = shiftDay(-i);
    const row = found.get(day);
    out.push({
      day,
      reviews: row?.reviews || 0,
      new: row?.new_cards || 0,
      minutes: Math.round((row?.duration_ms || 0) / 60_000),
    });
  }
  const peak = out.reduce((max, row) => Math.max(max, row.reviews), 0);
  return { days: out, peak, total: out.reduce((sum, row) => sum + row.reviews, 0) };
}

export function forecast(deck, filter = {}) {
  const horizon = Math.max(7, Math.min(120, Number(filter.days) || 30));
  const cfg = config();
  const plain = cardScope(deck, filter);
  const joined = cardScope(deck, filter, 'c');

  const rows = narrowed(filter)
    ? db.all(
        `SELECT s.due AS due FROM fsrs_state s JOIN cards c ON c.id = s.card_id WHERE ${joined.where}`,
        ...joined.params,
      )
    : db.all('SELECT due FROM fsrs_state WHERE deck_id = ?', deck);

  const buckets = new Map();
  let overdue = 0;
  const today = db.localDay();
  for (const row of rows) {
    const day = db.localDay(row.due);
    if (day < today) overdue++;
    else buckets.set(day, (buckets.get(day) || 0) + 1);
  }

  const total = db.get(`SELECT COUNT(*) AS n FROM cards WHERE ${plain.where}`, ...plain.params).n;
  const unseen = total - rows.length;

  const days = [];
  let remainingNew = Math.max(0, unseen);
  for (let i = 0; i < horizon; i++) {
    const day = shiftDay(i);
    const reviews = buckets.get(day) || 0;
    const fresh = Math.min(remainingNew, cfg.dailyLimit);
    remainingNew -= fresh;
    days.push({ day, reviews, new: fresh, total: reviews + fresh });
  }
  return { days, limit: cfg.dailyLimit, overdue, peak: days.reduce((m, d) => Math.max(m, d.total), 0) };
}

function bucket(deck, column, keys, filter) {
  const { where, params } = cardScope(deck, filter, 'c', { ignore: column });
  const now = new Date().toISOString();

  const rows = db.all(
    `SELECT c.${column} AS key,
            COUNT(*) AS total,
            SUM(CASE WHEN s.card_id IS NOT NULL THEN 1 ELSE 0 END) AS seen,
            SUM(CASE WHEN s.due <= ? THEN 1 ELSE 0 END) AS due,
            SUM(CASE WHEN s.stability >= ? THEN 1 ELSE 0 END) AS learned,
            AVG(MIN(COALESCE(s.stability, 0) / ?, 1.0)) AS mastery,
            AVG(s.stability) AS stability,
            SUM(COALESCE(s.lapses, 0)) AS lapses
     FROM cards c LEFT JOIN fsrs_state s ON s.card_id = c.id
     WHERE ${where}
     GROUP BY c.${column}`,
    now,
    LEARNED_DAYS,
    LEARNED_DAYS,
    ...params,
  );

  const graded = new Map(
    db
      .all(
        `SELECT ${column} AS key, COUNT(*) AS total,
                SUM(CASE WHEN rating >= 3 THEN 1 ELSE 0 END) AS good
         FROM reviews
         WHERE deck_id = ? AND rating > 0 AND was_new = 0 GROUP BY ${column}`,
        deck,
      )
      .map((row) => [row.key, row]),
  );

  const found = new Map(rows.map((row) => [row.key, row]));

  return keys.map((key) => {
    const row = found.get(key);
    const scores = graded.get(key);
    return {
      key,
      total: row?.total || 0,
      seen: row?.seen || 0,
      new: (row?.total || 0) - (row?.seen || 0),
      due: row?.due || 0,
      learned: row?.learned || 0,
      mastery: row?.mastery || 0,
      stability: row?.stability || 0,
      retention: scores?.total ? scores.good / scores.total : 0,
      lapses: row?.lapses || 0,
    };
  });
}

export const categories = (deck, filter = {}) => bucket(deck, 'category', CATEGORIES, filter);

export const cefr = (deck, filter = {}) => bucket(deck, 'cefr', CEFR_LEVELS, filter);

export function memory(deck, filter = {}) {
  const { where, params } = cardScope(deck, filter, 'c');
  const row = db.get(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN s.card_id IS NULL THEN 1 ELSE 0 END) AS fresh,
            SUM(CASE WHEN s.stability >= ? THEN 1 ELSE 0 END) AS learned,
            SUM(CASE WHEN s.card_id IS NOT NULL AND s.stability < ? AND s.state = 3 THEN 1 ELSE 0 END) AS relearning,
            SUM(CASE WHEN s.card_id IS NOT NULL AND s.stability < ? AND s.state = 1 THEN 1 ELSE 0 END) AS learning
     FROM cards c LEFT JOIN fsrs_state s ON s.card_id = c.id
     WHERE ${where}`,
    LEARNED_DAYS,
    LEARNED_DAYS,
    LEARNED_DAYS,
    ...params,
  );
  const total = row.total || 0;
  const counts = {
    new: row.fresh || 0,
    learning: row.learning || 0,
    relearning: row.relearning || 0,
    learned: row.learned || 0,
    review: 0,
  };
  counts.review = total - counts.new - counts.learning - counts.relearning - counts.learned;
  return { counts, total };
}

const RETRIEVABILITY_BUCKETS = [0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1];

export function retentionCurve(deck, filter = {}) {
  const now = new Date();
  const stamp = now.toISOString();
  const { where, params } = cardScope(deck, filter, 'c');

  const groups = narrowed(filter)
    ? db.all(
        `SELECT s.state AS state,
                ROUND(s.stability, 1) AS stability,
                CAST(julianday(?) - julianday(s.last_review) AS INTEGER) AS age,
                CASE WHEN s.due <= ? THEN 1 ELSE 0 END AS overdue,
                COUNT(*) AS cards
         FROM fsrs_state s JOIN cards c ON c.id = s.card_id
         WHERE ${where} AND s.last_review IS NOT NULL
         GROUP BY state, stability, age, overdue`,
        stamp,
        stamp,
        ...params,
      )
    : db.all(
        `SELECT state,
                ROUND(stability, 1) AS stability,
                CAST(julianday(?) - julianday(last_review) AS INTEGER) AS age,
                CASE WHEN due <= ? THEN 1 ELSE 0 END AS overdue,
                COUNT(*) AS cards
         FROM fsrs_state
         WHERE deck_id = ? AND last_review IS NOT NULL
         GROUP BY state, stability, age, overdue`,
        stamp,
        stamp,
        deck,
      );

  const histogram = RETRIEVABILITY_BUCKETS.map((top) => ({ top, cards: 0 }));
  const ages = new Map();
  let scheduled = 0;

  for (const group of groups) {
    const age = Math.max(0, group.age || 0);
    const last = new Date(now.getTime() - age * DAY_MS);
    const value = retrievabilityOf(
      {
        state: group.state,
        stability: group.stability,
        difficulty: 5,
        elapsed_days: age,
        scheduled_days: age,
        reps: 1,
        lapses: 0,
        learning_steps: 0,
        last_review: last,
        due: group.overdue ? new Date(now.getTime() - DAY_MS) : new Date(now.getTime() + DAY_MS),
      },
      now,
    );

    const slot = histogram.find((bucket) => value <= bucket.top) || histogram[histogram.length - 1];
    slot.cards += group.cards;
    scheduled += group.cards;

    const key =
      age <= 1 ? 1 : age <= 3 ? 3 : age <= 7 ? 7 : age <= 14 ? 14 : age <= 30 ? 30 : age <= 60 ? 60 : age <= 120 ? 120 : 240;
    const point = ages.get(key) || { days: key, sum: 0, cards: 0 };
    point.sum += value * group.cards;
    point.cards += group.cards;
    ages.set(key, point);
  }

  const curve = [...ages.values()]
    .sort((a, b) => a.days - b.days)
    .map((point) => ({ days: point.days, retrievability: point.sum / point.cards, cards: point.cards }));

  const from = filter.from || shiftDay(-179);
  const measured = db
    .all(
      `SELECT CAST(elapsed_days AS INTEGER) AS days, COUNT(*) AS total,
              SUM(CASE WHEN rating >= 3 THEN 1 ELSE 0 END) AS good
       FROM reviews
       WHERE deck_id = ? AND day >= ? AND rating > 0 AND was_new = 0 AND elapsed_days > 0
       GROUP BY days ORDER BY days LIMIT 120`,
      deck,
      from,
    )
    .map((row) => ({ days: row.days, recalled: row.total ? row.good / row.total : 0, reviews: row.total }));

  return { histogram, curve, measured, scheduled };
}

const CACHE_CAP = 20_000;
let cache = new Map();

export function retrievabilityOf(entry, now = new Date()) {
  if (!entry || !entry.last_review) return 0;
  const stability = Number(entry.stability);
  if (!Number.isFinite(stability) || stability <= 0) return 0;

  const last = new Date(entry.last_review);
  const elapsed = Math.max(0, Math.round((now - last) / DAY_MS));
  const overdue = new Date(entry.due) <= now ? 1 : 0;
  const key = `${entry.state}|${stability.toFixed(2)}|${elapsed}|${overdue}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  let value = 0;
  try {
    value = engine.get_retrievability(
      {
        due: new Date(entry.due),
        stability,
        difficulty: entry.difficulty,
        elapsed_days: entry.elapsed_days,
        scheduled_days: entry.scheduled_days,
        reps: entry.reps,
        lapses: entry.lapses,
        state: entry.state,
        learning_steps: entry.learning_steps || 0,
        last_review: last,
      },
      now,
      false,
    );
  } catch {
    value = 0;
  }

  const clamped = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  if (cache.size >= CACHE_CAP) cache = new Map();
  cache.set(key, clamped);
  return clamped;
}

export function activity(deck, filter = {}) {
  const { join, where, params } = scope(deck, filter);
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, reviews: 0 }));
  const weekdays = Array.from({ length: 7 }, (_, weekday) => ({ weekday, reviews: 0, minutes: 0 }));

  for (const row of db.all(
    `SELECT r.hour AS hour, COUNT(*) AS n FROM reviews r${join} WHERE ${where} AND r.mode <> 'migrated' GROUP BY r.hour`,
    ...params,
  )) {
    if (hours[row.hour]) hours[row.hour].reviews = row.n;
  }
  for (const row of db.all(
    `SELECT r.weekday AS weekday, COUNT(*) AS n, SUM(r.duration_ms) AS ms FROM reviews r${join} WHERE ${where} GROUP BY r.weekday`,
    ...params,
  )) {
    if (weekdays[row.weekday]) {
      weekdays[row.weekday].reviews = row.n;
      weekdays[row.weekday].minutes = Math.round((row.ms || 0) / 60_000);
    }
  }
  const wild = db.all(
    `SELECT r.day AS day, COUNT(*) AS n FROM reviews r${join} WHERE ${where} AND r.mode = 'wild'
     GROUP BY r.day ORDER BY r.day`,
    ...params,
  );
  return { hours, weekdays, wild: wild.map((row) => ({ day: row.day, reviews: row.n })) };
}

export function grades(deck, filter = {}) {
  const { join, where, params } = scope(deck, filter);
  const rows = db.all(
    `SELECT r.day AS day, r.rating AS rating, COUNT(*) AS n
     FROM reviews r${join} WHERE ${where} AND r.rating > 0
     GROUP BY r.day, r.rating ORDER BY r.day`,
    ...params,
  );
  const byDay = new Map();
  for (const row of rows) {
    const entry = byDay.get(row.day) || { day: row.day, 1: 0, 2: 0, 3: 0, 4: 0, total: 0 };
    entry[row.rating] = row.n;
    entry.total += row.n;
    byDay.set(row.day, entry);
  }
  const days = [...byDay.values()];
  const totals = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const day of days) for (const rating of [1, 2, 3, 4]) totals[rating] += day[rating];
  return { days, totals };
}

export function hardest(deck, filter = {}) {
  const limit = Math.max(1, Math.min(50, Number(filter.limit) || 12));
  const { where, params } = cardScope(deck, filter, 'c');
  const rows = db.all(
    `SELECT c.id, c.front, c.back, c.example, c.category, c.cefr, c.starred,
            s.lapses AS lapses, s.reps AS reviews,
            s.difficulty AS difficulty, s.stability AS stability, s.due AS due
     FROM fsrs_state s JOIN cards c ON c.id = s.card_id
     WHERE ${where}
     ORDER BY s.lapses DESC, s.difficulty DESC, s.reps DESC
     LIMIT ?`,
    ...params,
    limit,
  );

  return rows.map((row) => ({
    ...row,
    starred: !!row.starred,
    mastery: masteryOf(row.stability ? { stability: row.stability } : null),
    recent: db
      .all('SELECT rating, ts FROM reviews WHERE card_id = ? AND rating > 0 ORDER BY ts DESC LIMIT 5', row.id)
      .reverse(),
  }));
}

export function sessions(deck, filter = {}) {
  const limit = Math.max(1, Math.min(100, Number(filter.limit) || 20));
  return db
    .all(
      `SELECT id, started_at, ended_at, day, minutes, planned, reviewed, correct, duration_ms
       FROM sessions WHERE deck_id = ? AND ended_at IS NOT NULL
       ORDER BY started_at DESC LIMIT ?`,
      deck,
      limit,
    )
    .map((row) => ({ ...row, accuracy: row.reviewed ? row.correct / row.reviewed : 0 }));
}

const csvField = (value) => {
  const text = String(value ?? '').replace(/\r?\n/g, ' ').trim();
  return /["\n,]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function exportCsv(deck, filter = {}) {
  const rows = [['section', 'key', 'value', 'extra'].join(',')];
  const push = (section, key, value, extra = '') =>
    rows.push([csvField(section), csvField(key), csvField(value), csvField(extra)].join(','));

  const sum = summary(deck, filter);
  for (const [key, value] of Object.entries(sum)) {
    if (typeof value === 'number' || typeof value === 'string') push('summary', key, value);
  }
  push('summary', 'streak_days', sum.streak.days, `goal ${sum.streak.goal}`);

  for (const row of categories(deck, filter)) {
    push('category', row.key, row.total, `learned ${row.learned}, due ${row.due}, retention ${row.retention.toFixed(3)}`);
  }
  for (const row of cefr(deck, filter)) {
    push('cefr', row.key, row.total, `learned ${row.learned}, mastery ${row.mastery.toFixed(3)}`);
  }
  for (const row of calendar(deck, { ...filter, days: 90 }).days) {
    if (row.reviews) push('day', row.day, row.reviews, `new ${row.new}, minutes ${row.minutes}`);
  }
  for (const row of hardest(deck, { ...filter, limit: 25 })) {
    push('hardest', row.front, row.lapses, row.back);
  }
  return rows.join('\n') + '\n';
}
