import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA = mkdtempSync(join(tmpdir(), 'loanword-analytics-'));
process.env.CLAUDE_PLUGIN_DATA = DATA;

const { writeJson, paths } = await import('./store.mjs');
writeJson(paths.settings, { native: 'ru', target: 'en', dailyLimit: 15, weeklyGoal: 5 });

const db = await import('./db.mjs');
const analytics = await import('./analytics.mjs');

const DECK = db.deckId('ru', 'en');
const OTHER = db.deckId('ru', 'pl');

const day = (offset) => analytics.shiftDay(offset);
const at = (offset, hour = 12) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  date.setHours(hour, 0, 0, 0);
  return date;
};

const CARDS = [
  ['c1', 'engineering', 'B1'],
  ['c2', 'engineering', 'B2'],
  ['c3', 'process', 'B1'],
  ['c4', 'phrasing', 'C1'],
  ['c5', 'everyday', 'A2'],
];

const id = (name) => name.padEnd(10, '0');

db.insertCards(
  CARDS.map(([name, category, cefr]) => ({
    deck_id: DECK,
    type: 'phrase',
    front: `front ${name}`,
    back: `back ${name}`,
    keywords: [],
    example: `an example with front ${name}`,
    cefr,
    category,
    ts: at(-40).toISOString(),
    created_at: at(-40).toISOString(),
  })),
  CARDS.map(([name]) => id(name)),
);

db.insertCards(
  [{ deck_id: OTHER, type: 'word', front: 'wdrożenie', back: 'развёртывание', keywords: [], cefr: 'B1', category: 'process' }],
  ['pl00000000'],
);

db.saveState(id('c1'), DECK, {
  due: at(-1),
  stability: 30,
  difficulty: 5,
  elapsed_days: 5,
  scheduled_days: 20,
  reps: 6,
  lapses: 1,
  state: 2,
  last_review: at(-6),
});
db.saveState(id('c2'), DECK, {
  due: at(5),
  stability: 4,
  difficulty: 8,
  elapsed_days: 2,
  scheduled_days: 4,
  reps: 3,
  lapses: 3,
  state: 2,
  last_review: at(-2),
});
db.saveState(id('c3'), DECK, {
  due: at(2),
  stability: 25,
  difficulty: 4,
  elapsed_days: 1,
  scheduled_days: 10,
  reps: 4,
  lapses: 0,
  state: 2,
  last_review: at(-1),
});

for (const [offset, cardId, rating, hour] of [
  [-6, 'c1', 3, 9],
  [-6, 'c2', 1, 9],
  [-3, 'c2', 1, 21],
  [-2, 'c2', 2, 21],
  [-1, 'c3', 4, 14],
  [-1, 'c1', 3, 14],
  [0, 'c3', 3, 10],
]) {
  db.logReview({
    card_id: id(cardId),
    deck_id: DECK,
    ts: at(offset, hour).toISOString(),
    rating,
    mode: 'flashcards',
    duration_ms: 9000,
    elapsed_days: rating === 1 ? 2 : 8,
  });
}

db.logReview({ card_id: id('c5'), deck_id: DECK, ts: at(0, 10).toISOString(), rating: 3, was_new: true, duration_ms: 12_000 });
db.logReview({ card_id: 'pl00000000', deck_id: OTHER, ts: at(0, 10).toISOString(), rating: 3 });

const session = db.openSession(DECK, 10, 8);
db.logReview({ card_id: id('c1'), deck_id: DECK, session_id: session, rating: 3, duration_ms: 60_000 });
db.logReview({ card_id: id('c2'), deck_id: DECK, session_id: session, rating: 1, duration_ms: 60_000 });
db.closeSession(session);

test('the summary counts the open deck and never another one', () => {
  const summary = analytics.summary(DECK);
  assert.equal(summary.total, 5);
  assert.equal(summary.seen, 3);
  assert.equal(summary.new, 2);
  assert.equal(summary.learned, 2, 'stability 30 and 25 are both over the 21-day line');
  assert.equal(summary.due_reviews, 1, 'only c1 has come round');
  assert.equal(summary.due_new, 2, 'both unseen cards fit under the daily limit');
});

test('the daily limit caps the new cards offered, not the reviews', () => {
  writeJson(paths.settings, { native: 'ru', target: 'en', dailyLimit: 3, weeklyGoal: 5 });
  const room = analytics.summary(DECK);
  assert.equal(room.due_new, 2, 'one new card is already spent today, two of three remain and two are unseen');
  assert.equal(room.due_reviews, 1, 'the review is offered whatever the limit says');

  db.logReview({ card_id: id('c4'), deck_id: DECK, rating: 3, was_new: true });
  db.logReview({ card_id: id('c5'), deck_id: DECK, rating: 3, was_new: true });
  const spent = analytics.summary(DECK);
  assert.equal(spent.due_new, 0, 'the day\u2019s allowance is gone');
  assert.equal(spent.due_reviews, 1, 'reviews are still never held back');

  writeJson(paths.settings, { native: 'ru', target: 'en', dailyLimit: 15, weeklyGoal: 5 });
});

test('retention is graded reviews only, and never counts a first sight', () => {
  const value = analytics.retention(DECK, 7);
  assert.ok(value > 0 && value < 1);
  assert.equal(Number.isFinite(value), true);
  assert.equal(analytics.retention(db.deckId('ru', 'fr'), 7), 0, 'an empty deck is zero, not NaN');
});

test('the weekly streak counts days studied out of seven, not a run', () => {
  const streak = analytics.weeklyStreak(DECK, 5);
  assert.equal(streak.week.length, 7);
  assert.equal(streak.goal, 5);
  assert.equal(streak.days, 5, 'six, three, two and one days ago, plus today');
  assert.equal(streak.week[6].day, db.localDay());
});

test('a missed day does not reset the week', () => {
  const streak = analytics.weeklyStreak(DECK, 3);
  const gaps = streak.week.filter((entry) => !entry.hit).length;
  assert.ok(gaps > 0, 'the fixture deliberately has quiet days');
  assert.equal(streak.met, streak.days >= 3);
});

test('the calendar fills every day in the window, gaps included', () => {
  const calendar = analytics.calendar(DECK, { days: 10 });
  assert.equal(calendar.days.length, 10);
  assert.equal(calendar.days[9].day, db.localDay());
  assert.ok(calendar.days.some((entry) => entry.reviews === 0), 'a quiet day is a zero, not a missing point');
  assert.equal(calendar.peak, Math.max(...calendar.days.map((entry) => entry.reviews)));
});

test('the calendar counts minutes from the answer times it recorded', () => {
  const today = analytics.calendar(DECK, { days: 2 }).days.at(-1);
  assert.ok(today.new >= 1, 'a first sight is counted as new');
  assert.ok(today.minutes >= 1, 'answer times roll up into minutes');
  assert.equal(today.day, db.localDay());
});

test('the forecast reaches the requested horizon and marks what is overdue', () => {
  const forecast = analytics.forecast(DECK, { days: 30 });
  assert.equal(forecast.days.length, 30);
  assert.equal(forecast.overdue, 1, 'c1 is past due');
  assert.equal(forecast.limit, 15);
  assert.equal(
    forecast.days.reduce((sum, entry) => sum + entry.new, 0),
    2,
    'the two unseen cards are offered once each, never twice',
  );
  assert.equal(
    forecast.days.reduce((sum, entry) => sum + entry.reviews, 0) + forecast.overdue,
    3,
    'every scheduled card appears once, either overdue or on its own day',
  );
  assert.ok(
    forecast.days.every((entry) => entry.reviews < 3),
    'what is already overdue is reported separately, not piled onto today and flattening the curve',
  );
});

test('the domain breakdown always returns all six, even the empty ones', () => {
  const rows = analytics.categories(DECK);
  assert.equal(rows.length, 6);
  const engineering = rows.find((row) => row.key === 'engineering');
  assert.equal(engineering.total, 2);
  assert.equal(engineering.learned, 1);
  assert.equal(engineering.lapses, 4, 'FSRS own lapse counters: three on c2, one on c1');
  assert.equal(rows.find((row) => row.key === 'connectors').total, 0);
});

test('a domain chart filtered by domain still draws every domain', () => {
  const rows = analytics.categories(DECK, { category: ['process'] });
  assert.equal(rows.length, 6);
  assert.equal(rows.find((row) => row.key === 'engineering').total, 2, 'the axis is not narrowed by its own filter');
});

test('a CEFR filter does narrow the domain chart', () => {
  const rows = analytics.categories(DECK, { cefr: ['B1'] });
  assert.equal(rows.find((row) => row.key === 'engineering').total, 1);
  assert.equal(rows.find((row) => row.key === 'phrasing').total, 0);
});

test('the level breakdown returns all six levels in order', () => {
  const rows = analytics.cefr(DECK);
  assert.deepEqual(rows.map((row) => row.key), ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
  assert.equal(rows.find((row) => row.key === 'B1').total, 2);
});

test('memory splits the deck into states that add up to the whole', () => {
  const memory = analytics.memory(DECK);
  const sum = Object.values(memory.counts).reduce((total, value) => total + value, 0);
  assert.equal(sum, memory.total);
  assert.equal(memory.total, 5);
  assert.equal(memory.counts.new, 2);
  assert.equal(memory.counts.learned, 2);
});

test('the retention curve is bucketed by age and stays inside zero and one', () => {
  const report = analytics.retentionCurve(DECK);
  assert.equal(report.scheduled, 3);
  assert.equal(
    report.histogram.reduce((sum, bucket) => sum + bucket.cards, 0),
    3,
    'every scheduled card lands in exactly one bucket',
  );
  for (const point of report.curve) {
    assert.ok(point.retrievability >= 0 && point.retrievability <= 1);
    assert.ok(point.cards >= 1);
  }
  assert.deepEqual([...report.curve].sort((a, b) => a.days - b.days), report.curve, 'ordered by age');
});

test('the retention curve survives a filter', () => {
  const all = analytics.retentionCurve(DECK);
  const narrow = analytics.retentionCurve(DECK, { category: ['engineering'] });
  assert.ok(narrow.scheduled <= all.scheduled);
  assert.equal(
    narrow.histogram.reduce((sum, bucket) => sum + bucket.cards, 0),
    narrow.scheduled,
    'the filtered branch groups by plain columns, never an aggregate',
  );
});

test('the measured curve only uses real grades', () => {
  const { measured } = analytics.retentionCurve(DECK);
  for (const point of measured) {
    assert.ok(point.recalled >= 0 && point.recalled <= 1);
    assert.ok(point.reviews >= 1);
  }
});

test('activity buckets cover the whole clock and the whole week', () => {
  const report = analytics.activity(DECK);
  assert.equal(report.hours.length, 24);
  assert.equal(report.weekdays.length, 7);
  assert.ok(
    report.hours.find((row) => row.hour === 21).reviews >= 2,
    'the two late-evening fixture answers land in hour 21, whatever the clock says now',
  );
  assert.equal(
    report.hours.reduce((sum, row) => sum + row.reviews, 0),
    report.weekdays.reduce((sum, row) => sum + row.reviews, 0),
  );
});

test('grades are counted per day and never include an ungraded row', () => {
  db.logReview({ card_id: '', deck_id: DECK, rating: 0, mode: 'migrated' });
  const report = analytics.grades(DECK);
  const total = Object.values(report.totals).reduce((sum, value) => sum + value, 0);
  assert.equal(total, db.get("SELECT COUNT(*) AS n FROM reviews WHERE deck_id = ? AND rating > 0", DECK).n,
    'every graded answer and nothing else');
  assert.ok(total > 0);
  assert.equal(report.days.every((entry) => entry.total > 0), true);
});

test('hardest ranks by lapses and carries the last five answers', () => {
  const rows = analytics.hardest(DECK, { limit: 5 });
  assert.equal(rows[0].id, id('c2'));
  assert.equal(rows[0].lapses, 3, 'from the FSRS counter, not a scan of the log');
  assert.ok(rows[0].recent.length >= 1 && rows[0].recent.length <= 5);
  assert.equal(
    rows.every((row) => row.reviews > 0),
    true,
    'a card nobody has answered is not hard, it is unseen',
  );
});

test('sessions come back newest first with their accuracy', () => {
  const rows = analytics.sessions(DECK);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].reviewed, 2);
  assert.equal(rows[0].accuracy, 0.5);
});

test('a date range narrows every report that reads the log', () => {
  const filter = { from: day(-1) };
  const calendar = analytics.calendar(DECK, { ...filter, days: 30 });
  const inRange = calendar.days.filter((entry) => entry.day >= day(-1));
  assert.equal(
    inRange.reduce((sum, entry) => sum + entry.reviews, 0),
    calendar.days.reduce((sum, entry) => sum + entry.reviews, 0),
    'nothing outside the range is counted',
  );
});

test('one deck never sees another deck numbers', () => {
  assert.equal(analytics.summary(OTHER).total, 1);
  assert.equal(analytics.summary(OTHER).learned, 0);
  assert.equal(analytics.activity(OTHER).hours.reduce((sum, row) => sum + row.reviews, 0), 1);
});

test('an untouched deck answers with zeroes rather than blowing up', () => {
  const empty = db.deckId('ru', 'de');
  const summary = analytics.summary(empty);
  assert.equal(summary.total, 0);
  assert.equal(summary.mastery, 0);
  assert.equal(summary.retention_7, 0);
  assert.equal(analytics.categories(empty).length, 6);
  assert.equal(analytics.retentionCurve(empty).curve.length, 0);
  assert.equal(analytics.forecast(empty).days.length, 30);
  assert.equal(analytics.hardest(empty).length, 0);
});

test('the CSV export carries the same numbers the screen shows', () => {
  const csv = analytics.exportCsv(DECK);
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'section,key,value,extra');
  const learned = lines.find((line) => line.startsWith('summary,learned,'));
  assert.equal(learned.split(',')[2], String(analytics.summary(DECK).learned));
  assert.ok(lines.some((line) => line.startsWith('category,engineering,')));
  assert.ok(lines.some((line) => line.startsWith('cefr,B1,')));
});

test('a filter reaches the export too', () => {
  const all = analytics.exportCsv(DECK);
  const narrow = analytics.exportCsv(DECK, { cefr: ['A2'] });
  assert.notEqual(all, narrow);
});

test('retrievability is zero for a card that has never been answered', () => {
  assert.equal(analytics.retrievabilityOf(null), 0);
  assert.equal(analytics.retrievabilityOf({ stability: 10, difficulty: 5 }), 0);
});

test('clean() only lets known keys through', () => {
  assert.deepEqual(analytics.clean('engineering,nonsense,process', ['engineering', 'process']), [
    'engineering',
    'process',
  ]);
  assert.deepEqual(analytics.clean(undefined, ['engineering']), []);
  assert.deepEqual(analytics.clean(['__proto__'], ['engineering']), []);
});

db.close();

test.after(() => {
  db.close();
  rmSync(DATA, { recursive: true, force: true });
});
