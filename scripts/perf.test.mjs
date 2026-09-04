import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUN = process.env.LOANWORD_PERF === '1';

const CARDS = Number(process.env.LOANWORD_PERF_CARDS) || 50_000;
const REVIEWS = Number(process.env.LOANWORD_PERF_REVIEWS) || 500_000;

const BUDGET_MS = {
  log: 30,
  composition: 150,
  perCardMicros: 20,
  start: 2000,
  test: 100,
  state: 2000,
};

const LOG_REPORTS = new Set(['summary', 'calendar', 'grades', 'activity', 'sessions', 'forecast']);

const DATA = mkdtempSync(join(tmpdir(), 'loanword-perf-'));
process.env.CLAUDE_PLUGIN_DATA = DATA;

const options = { skip: RUN ? false : 'set LOANWORD_PERF=1 to run the performance budget' };

test.after(() => {
  db?.close();
  rmSync(DATA, { recursive: true, force: true });
});

let db;
let analytics;
let DECK;

const CATEGORIES = ['engineering', 'process', 'collaboration', 'phrasing', 'connectors', 'everyday'];
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const hex = (index) => index.toString(16).padStart(10, '0');

function seed() {
  const start = performance.now();
  db.tx(() => {
    const rows = [];
    const ids = [];
    for (let index = 0; index < CARDS; index++) {
      rows.push({
        deck_id: DECK,
        type: index % 3 === 0 ? 'word' : 'phrase',
        front: `front ${index}`,
        back: `back ${index}`,
        keywords: [],
        example: `an example with front ${index} inside`,
        cefr: LEVELS[index % LEVELS.length],
        category: CATEGORIES[index % CATEGORIES.length],
        ts: new Date(Date.now() - (index % 400) * 86_400_000).toISOString(),
        created_at: new Date().toISOString(),
      });
      ids.push(hex(index));
    }
    db.insertCards(rows, ids);

    const now = Date.now();
    for (let index = 0; index < CARDS; index += 2) {
      db.saveState(hex(index), DECK, {
        due: new Date(now + ((index % 60) - 20) * 86_400_000),
        stability: 1 + (index % 45),
        difficulty: 1 + (index % 9),
        elapsed_days: index % 12,
        scheduled_days: index % 30,
        reps: index % 20,
        lapses: index % 5,
        state: 2,
        last_review: new Date(now - (index % 30) * 86_400_000),
      });
    }

    const insert = db.open().prepare(
      `INSERT INTO reviews (card_id, deck_id, session_id, ts, day, hour, weekday, rating, mode, was_new,
                            duration_ms, elapsed_days, scheduled_days, stability_before, stability_after,
                            difficulty_before, difficulty_after, state_before, state_after)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 'flashcards', ?, ?, ?, ?, 0, 0, 0, 0, 0, 0)`,
    );
    for (let index = 0; index < REVIEWS; index++) {
      const when = new Date(now - (index % 730) * 86_400_000);
      insert.run(
        hex((index * 7) % CARDS),
        DECK,
        when.toISOString(),
        db.localDay(when),
        index % 24,
        when.getDay(),
        1 + (index % 4),
        index % 40 === 0 ? 1 : 0,
        4000 + (index % 9000),
        index % 15,
        index % 25,
      );
    }
  });
  return performance.now() - start;
}

function time(label, work) {
  work();
  const runs = 5;
  const start = performance.now();
  for (let index = 0; index < runs; index++) work();
  const each = (performance.now() - start) / runs;
  console.log(`  ${label.padEnd(28)} ${each.toFixed(2)} ms`);
  return each;
}

test('seeding the perf fixture', options, async () => {
  db = await import('./db.mjs');
  analytics = await import('./analytics.mjs');
  const { writeJson, paths } = await import('./store.mjs');
  writeJson(paths.settings, { native: 'ru', target: 'en', dailyLimit: 15, weeklyGoal: 5 });
  DECK = db.deckId('ru', 'en');
  const ms = seed();
  console.log(`  seeded ${CARDS} cards and ${REVIEWS} reviews in ${(ms / 1000).toFixed(1)} s`);
  assert.equal(db.totalCards(), CARDS);
  assert.equal(db.get('SELECT COUNT(*) AS n FROM reviews').n, REVIEWS);
});

test('every analytics report answers inside the budget', options, () => {
  const filter = { from: analytics.shiftDay(-89) };
  const reports = {
    summary: () => analytics.summary(DECK, filter),
    calendar: () => analytics.calendar(DECK, { ...filter, days: 371 }),
    forecast: () => analytics.forecast(DECK, filter),
    categories: () => analytics.categories(DECK, filter),
    cefr: () => analytics.cefr(DECK, filter),
    memory: () => analytics.memory(DECK, filter),
    retention: () => analytics.retentionCurve(DECK, filter),
    activity: () => analytics.activity(DECK, filter),
    grades: () => analytics.grades(DECK, filter),
    hardest: () => analytics.hardest(DECK, filter),
    sessions: () => analytics.sessions(DECK, filter),
  };
  for (const [name, work] of Object.entries(reports)) {
    const each = time(name, work);
    const budget = LOG_REPORTS.has(name) ? BUDGET_MS.log : BUDGET_MS.composition;
    assert.ok(each < budget, `${name} took ${each.toFixed(2)} ms, budget ${budget} ms`);
  }
});

test('a filtered slice is no slower than the whole', options, () => {
  const filter = { from: analytics.shiftDay(-29), category: ['engineering', 'process'], cefr: ['B1', 'B2'] };
  for (const [name, work] of Object.entries({
    summary: () => analytics.summary(DECK, filter),
    categories: () => analytics.categories(DECK, filter),
    calendar: () => analytics.calendar(DECK, filter),
    grades: () => analytics.grades(DECK, filter),
    hardest: () => analytics.hardest(DECK, filter),
  })) {
    const each = time(`${name} (filtered)`, work);
    const budget = LOG_REPORTS.has(name) ? BUDGET_MS.log : BUDGET_MS.composition;
    assert.ok(each < budget, `${name} took ${each.toFixed(2)} ms, budget ${budget} ms`);
  }
});

test('the deck loads at a cost per card that does not creep', options, () => {
  const cards = time('cardsOfDeck', () => db.cardsOfDeck(DECK));
  const state = time('stateOfDeck', () => db.stateOfDeck(DECK));
  const perCard = (cards * 1000) / CARDS;
  console.log(`  per card                     ${perCard.toFixed(2)} µs`);
  assert.ok(
    perCard < BUDGET_MS.perCardMicros,
    `${perCard.toFixed(2)} µs per card, budget ${BUDGET_MS.perCardMicros} µs`,
  );
  assert.ok(state < 200, `loading the schedule took ${state.toFixed(2)} ms`);
});

test('a full test is written inside the budget, however big the deck is', options, async () => {
  const { TYPES, buildTest } = await import('./exam.mjs');
  const cards = db.cardsOfDeck(DECK);
  assert.equal(cards.length, CARDS);

  const start = performance.now();
  const questions = buildTest(cards, { count: 50, types: [...TYPES], answerWith: 'both' });
  const ms = performance.now() - start;
  console.log(`  a 50-question test           ${ms.toFixed(0)} ms`);
  assert.ok(questions.length > 0, 'the deck is big enough to ask about');
  assert.ok(
    ms < BUDGET_MS.test,
    `writing a test took ${ms.toFixed(0)} ms, budget ${BUDGET_MS.test} ms — the distractor pool is probably unbounded again`,
  );
});

test('the state the trainer polls is answered inside the budget', options, async () => {
  const { createServer } = await import('node:http');
  const { spawn } = await import('node:child_process');
  db.close();

  const port = await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port: found } = probe.address();
      probe.close(() => resolve(found));
    });
  });

  const child = spawn('node', [join(HERE, 'serve.mjs'), '--no-open', '--idle=0'], {
    env: { ...process.env, CLAUDE_PLUGIN_DATA: DATA, LOANWORD_PORT: String(port), LOANWORD_NO_BUILD: '1' },
    stdio: 'ignore',
  });

  try {
    const base = `http://127.0.0.1:${port}`;
    for (let attempt = 0; attempt < 200; attempt++) {
      const alive = await fetch(`${base}/settings`).then(() => true).catch(() => false);
      if (alive) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await fetch(`${base}/state`).then((reply) => reply.json());
    const start = performance.now();
    const body = await fetch(`${base}/state`).then((reply) => reply.json());
    const ms = performance.now() - start;
    console.log(`  a full /state                ${ms.toFixed(0)} ms`);
    assert.equal(body.cards.length, CARDS, 'the whole deck came back');
    assert.ok(
      ms < BUDGET_MS.state,
      `/state took ${ms.toFixed(0)} ms, budget ${BUDGET_MS.state} ms — the deck is probably being read twice again`,
    );
  } finally {
    child.kill('SIGTERM');
  }
});

test('the server starts inside the budget against a full deck', options, () => {
  db.close();
  const start = performance.now();
  execFileSync('node', [join(HERE, 'serve.mjs'), '--stats'], {
    env: { ...process.env, CLAUDE_PLUGIN_DATA: DATA, LOANWORD_NO_BUILD: '1' },
    encoding: 'utf8',
  });
  const ms = performance.now() - start;
  console.log(`  cold start + stats           ${ms.toFixed(0)} ms`);
  assert.ok(ms < BUDGET_MS.start, `a cold node process plus stats took ${ms.toFixed(0)} ms`);
});
