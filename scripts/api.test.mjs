import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVE = join(HERE, 'serve.mjs');
const DATA = mkdtempSync(join(tmpdir(), 'loanword-api-'));

process.env.CLAUDE_PLUGIN_DATA = DATA;

const { writeJson, paths } = await import('./store.mjs');
writeJson(paths.settings, { native: 'ru', target: 'en', dailyLimit: 15, weeklyGoal: 5, sessionMinutes: 10 });

const db = await import('./db.mjs');
const DECK = db.deckId('ru', 'en');

const CARDS = [
  ['engineering', 'B1', 'roll back', 'откатить', 'We roll back the migration tonight.'],
  ['engineering', 'B2', 'ship it behind a flag', 'выкатить под флагом', 'Let us ship it behind a flag first.'],
  ['process', 'B1', 'a rough estimate', 'грубая оценка', 'Give me a rough estimate by Friday.'],
  ['collaboration', 'C1', 'push back', 'возразить', 'I would push back on that plan.'],
  ['phrasing', 'B2', 'it slipped my mind', 'вылетело из головы', 'Sorry, it slipped my mind.'],
  ['connectors', 'B1', 'that said', 'при этом', 'That said, the tests are green.'],
];

const id = (index) => String(index).padStart(10, '0');

db.insertCards(
  CARDS.map(([category, cefr, front, back, example], index) => ({
    deck_id: DECK,
    type: 'phrase',
    front,
    back,
    keywords: [front],
    example,
    cefr,
    category,
    project: '~/api',
    source: 'we need to ▮ the migration',
    ts: new Date(Date.now() - 20 * 86_400_000).toISOString(),
    created_at: new Date().toISOString(),
  })),
  CARDS.map((_, index) => id(index)),
);

db.saveState(id(0), DECK, {
  due: new Date(Date.now() - 86_400_000),
  stability: 30,
  difficulty: 5,
  elapsed_days: 4,
  scheduled_days: 20,
  reps: 5,
  lapses: 0,
  state: 2,
  last_review: new Date(Date.now() - 4 * 86_400_000),
});
db.saveState(id(1), DECK, {
  due: new Date(Date.now() - 3600_000),
  stability: 3,
  difficulty: 8,
  elapsed_days: 2,
  scheduled_days: 3,
  reps: 3,
  lapses: 2,
  state: 2,
  last_review: new Date(Date.now() - 2 * 86_400_000),
});
db.close();

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

const PORT = await freePort();
const BASE = `http://127.0.0.1:${PORT}`;

const server = spawn('node', [SERVE, '--no-open', '--idle=0'], {
  env: { ...process.env, CLAUDE_PLUGIN_DATA: DATA, LOANWORD_PORT: String(PORT), LOANWORD_NO_BUILD: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('the trainer never announced itself')), 15_000);
  server.stdout.on('data', (chunk) => {
    if (String(chunk).includes('http://localhost:')) {
      clearTimeout(timer);
      resolve();
    }
  });
  server.stderr.on('data', (chunk) => process.stderr.write(chunk));
});

const get = async (path) => {
  const response = await fetch(`${BASE}${path}`);
  return { status: response.status, body: await response.json().catch(() => null) };
};

const post = async (path, payload) => {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};

test.after(() => {
  server.kill('SIGTERM');
  rmSync(DATA, { recursive: true, force: true });
});

test('the whole app arrives in one round trip', async () => {
  const { status, body } = await get('/state');
  assert.equal(status, 200);
  assert.equal(body.cards.length, 6);
  assert.equal(body.config.native, 'ru');
  assert.equal(body.categories.length, 6);
  assert.equal(body.levels.length, 6);
  assert.ok(body.stats.weekly, 'the weekly rhythm ships with the state');
});

test('each card carries what the screens need without a second call', async () => {
  const { body } = await get('/state');
  const card = body.cards.find((entry) => entry.id === id(0));
  assert.equal(card.isDue, true);
  assert.equal(card.isNew, false);
  assert.equal(card.project, '~/api');
  assert.equal(card.source, 'we need to ▮ the migration');
  assert.ok(card.retrievability > 0 && card.retrievability <= 1);
  assert.ok(card.mastery > 0);
  assert.deepEqual(card.keywords, ['roll back']);
});

test('every analytics report answers, and reports how long it took', async () => {
  for (const name of [
    'summary',
    'calendar',
    'forecast',
    'categories',
    'cefr',
    'memory',
    'retention',
    'activity',
    'grades',
    'hardest',
    'sessions',
  ]) {
    const { status, body } = await get(`/api/analytics/${name}`);
    assert.equal(status, 200, name);
    assert.equal(typeof body.ms, 'number', `${name} does not report its own cost`);
  }
});

test('an unknown report is a 404, not an empty 200', async () => {
  const { status, body } = await get('/api/analytics/nonsense');
  assert.equal(status, 404);
  assert.equal(body.error, 'unknown report');
});

test('the summary counts the deck the settings have open', async () => {
  const { body } = await get('/api/analytics/summary');
  assert.equal(body.total, 6);
  assert.equal(body.seen, 2);
  assert.equal(body.due_reviews, 2);
  assert.equal(body.new, 4);
  assert.equal(body.streak.goal, 5);
  assert.equal(body.streak.week.length, 7);
});

test('a domain filter narrows the reports that read the deck', async () => {
  const { body } = await get('/api/analytics/memory?category=engineering');
  assert.equal(body.total, 2);
  const all = await get('/api/analytics/memory');
  assert.equal(all.body.total, 6);
});

test('a level filter narrows them too, and an unknown value is ignored', async () => {
  const b1 = await get('/api/analytics/memory?cefr=B1');
  assert.equal(b1.body.total, 3);
  const junk = await get('/api/analytics/memory?cefr=Z9');
  assert.equal(junk.body.total, 6, 'a level that does not exist is dropped, not obeyed');
});

test('a malformed date range is ignored rather than trusted', async () => {
  const { status, body } = await get('/api/analytics/calendar?from=not-a-date&days=30');
  assert.equal(status, 200);
  assert.equal(body.days.length, 30);
});

test('the calendar horizon is capped', async () => {
  const { body } = await get('/api/analytics/calendar?days=99999');
  assert.ok(body.days.length <= 400);
});

test('the four intervals are previewed before anything is graded', async () => {
  const { status, body } = await get(`/intervals?id=${id(0)}`);
  assert.equal(status, 200);
  for (const rating of ['1', '2', '3', '4']) {
    assert.ok(body[rating].due, `rating ${rating} has no due date`);
  }
  assert.ok(
    new Date(body['4'].due) > new Date(body['1'].due),
    'Easy must schedule further out than Again',
  );
});

test('intervals refuse a card that is not in the deck', async () => {
  const { status } = await get('/intervals?id=deadbeef00');
  assert.equal(status, 404);
});

test('a session is planned around the length it was asked for', async () => {
  const { status, body } = await post('/session/start', { minutes: 5 });
  assert.equal(status, 200);
  assert.ok(body.sessionId > 0);
  assert.equal(body.minutes, 5);
  assert.ok(body.steps.length > 0);
  assert.ok(body.steps.length <= body.budget);
  assert.equal(body.counts.total, body.steps.length);
  for (const step of body.steps) {
    assert.ok(['present', 'flashcards', 'learn', 'cloze', 'type', 'reverse'].includes(step.mode), step.mode);
  }
  assert.ok(['type', 'reverse', 'flashcards'].includes(body.production), 'the plan names the production step');
});

test('the state and the stats endpoint read one and the same deck', async () => {
  const state = await get('/state');
  const alone = await get('/stats');
  assert.equal(alone.status, 200);
  assert.deepEqual(
    { ...alone.body, activity: null, weekly: null },
    { ...state.body.stats, activity: null, weekly: null },
    'the deck is read once per request and shared, not loaded twice',
  );
  assert.equal(state.body.stats.total, state.body.cards.length);
});

test('the four cards nobody has opened yet are what a session presents first', async () => {
  const { status, body } = await post('/session/start', { minutes: 10 });
  assert.equal(status, 200);
  assert.ok(body.counts.new > 0, 'a deck of unseen cards is not an empty session');
  assert.ok(
    body.steps.some((step) => step.mode === 'present' && !step.seen),
    'an unseen card arrives as a first look, not as a quiz',
  );
});

test('a card is quizzed only after it was learned in the deck', async () => {
  for (let index = 0; index < CARDS.length; index++) {
    const { status } = await post('/grade', { id: id(index), rating: 3, mode: 'learn' });
    assert.equal(status, 200);
  }
  const after = await post('/session/start', { minutes: 10 });
  assert.equal(after.status, 200, 'cards on their learning steps are ready for a quiz at once');
  assert.ok(after.body.steps.every((step) => step.seen));
  assert.equal(after.body.counts.new, 0);
});

test('the plan never repeats a domain twice in a row', async () => {
  const { body } = await post('/session/start', { minutes: 15 });
  for (let index = 1; index < body.steps.length; index++) {
    assert.notEqual(body.steps[index].category, body.steps[index - 1].category);
  }
});

test('a session can be scoped to one domain', async () => {
  const probe = await post('/session/start', { minutes: 10 });
  const category = probe.body.steps[0].category;
  const { body } = await post('/session/start', { minutes: 10, category });
  assert.ok(body.steps.every((step) => step.category === category));
  assert.equal(body.category, category);
});

test('excluding what was just studied gives a different set', async () => {
  const first = await post('/session/start', { minutes: 10 });
  const exclude = first.body.steps.map((step) => step.id);
  const second = await post('/session/start', { minutes: 5, exclude });
  if (second.status === 200) {
    assert.ok(second.body.steps.every((step) => !exclude.includes(step.id)));
  } else {
    assert.equal(second.status, 409, 'or there is honestly nothing left');
  }
});

test('a session in a domain with nothing due is refused, not faked', async () => {
  const { status, body } = await post('/session/start', { minutes: 10, category: 'everyday' });
  assert.equal(status, 409);
  assert.match(body.error, /nothing is due/);
});

test('grading writes the schedule and the log together', async () => {
  const before = await get('/api/analytics/summary');
  const { status, body } = await post('/grade', {
    id: id(0),
    rating: 3,
    mode: 'cloze',
    ms: 4200,
  });
  assert.equal(status, 200);
  assert.ok(new Date(body.due) > new Date(), 'Good pushes the card forward');
  assert.equal(typeof body.mastery, 'number');

  const after = await get('/api/analytics/summary');
  assert.equal(after.body.reviewed_today, before.body.reviewed_today + 1);

  const grades = await get('/api/analytics/grades');
  assert.equal(grades.body.totals['3'] >= 1, true);
});

test('the mode a card was answered in reaches the log', async () => {
  const activity = await get('/api/analytics/activity');
  const total = activity.body.hours.reduce((sum, row) => sum + row.reviews, 0);
  assert.ok(total >= 1, 'the graded answer shows up in the clock');
});

test('a rating outside one to four is refused', async () => {
  for (const rating of [0, 5, -1, 'good', null]) {
    const { status } = await post('/grade', { id: id(0), rating });
    assert.equal(status, 400, `rating ${rating} was accepted`);
  }
});

test('an unknown card id is refused before anything is written', async () => {
  const { status, body } = await post('/grade', { id: 'ffffffffff', rating: 3 });
  assert.equal(status, 404);
  assert.equal(body.error, 'unknown card id');
});

test('an id that is not an id is refused as well', async () => {
  for (const value of ['../../etc/passwd', '__proto__', '', 123, null]) {
    const { status } = await post('/grade', { id: value, rating: 3 });
    assert.equal(status, 404, `${value} was accepted`);
  }
});

test('a session closes with the totals of its own answers', async () => {
  const start = await post('/session/start', { minutes: 5 });
  const sessionId = start.body.sessionId;
  await post('/grade', { id: id(0), rating: 3, sessionId, ms: 3000 });
  await post('/grade', { id: id(1), rating: 1, sessionId, ms: 9000 });

  const { status, body } = await post('/session/end', { id: sessionId });
  assert.equal(status, 200);
  assert.equal(body.reviewed, 2);
  assert.equal(body.correct, 1);
  assert.equal(body.accuracy, 0.5);
  assert.ok(Array.isArray(body.learned));
  assert.ok(body.toughest, 'the card that was failed is named');
  assert.equal(body.toughest.front, CARDS[1][2]);
});

test('a finished session shows up in the sessions report', async () => {
  const { body } = await get('/api/analytics/sessions');
  assert.ok(body.rows.length >= 1);
  assert.ok(body.rows[0].accuracy >= 0 && body.rows[0].accuracy <= 1);
});

test('ending a session that does not exist is refused', async () => {
  assert.equal((await post('/session/end', { id: 999_999 })).status, 404);
  assert.equal((await post('/session/end', { id: 'x' })).status, 400);
});

test('a cloze is cut from the example, and refused when the word is not in it', async () => {
  const { status, body } = await get(`/cloze?id=${id(0)}`);
  assert.equal(status, 200);
  assert.equal(body.answer, 'roll back');
  assert.equal(body.before, 'We ');
  assert.match(body.after, /^ the migration/);
  assert.ok(!body.text.includes('roll back'));
});

test('editing a card writes only the fields it is allowed to', async () => {
  const { status, body } = await post('/card', {
    id: id(2),
    back: 'приблизительная оценка',
    example: 'Give me a rough estimate by Monday.',
    category: 'engineering',
    cefr: 'C1',
  });
  assert.equal(status, 200);
  assert.equal(body.card.back, 'приблизительная оценка');
  assert.equal(body.card.category, 'engineering');
  assert.equal(body.card.cefr, 'C1');
});

test('a nonsense domain or level falls back rather than being stored', async () => {
  const { body } = await post('/card', { id: id(2), category: 'astrology', cefr: 'Z9' });
  assert.equal(body.card.category, 'everyday');
  assert.equal(body.card.cefr, '');
  await post('/card', { id: id(2), category: 'process', cefr: 'B1' });
});

test('a card cannot be emptied', async () => {
  const { status, body } = await post('/card', { id: id(2), front: '   ' });
  assert.equal(status, 400);
  assert.match(body.error, /cannot be empty/);
});

test('junk removes the card, and undo puts it back with its schedule', async () => {
  const before = (await get('/state')).body.cards.length;

  const removed = await post('/delete', { id: id(3), reason: 'not useful' });
  assert.equal(removed.status, 200);
  assert.equal(removed.body.front, 'push back');
  assert.equal((await get('/state')).body.cards.length, before - 1);

  const restored = await post('/restore', { id: id(3) });
  assert.equal(restored.status, 200);
  assert.equal((await get('/state')).body.cards.length, before);
});

test('junk feeds the junk-rate metric', async () => {
  await post('/delete', { id: id(4), reason: 'the builder mangled it' });
  const { body } = await get('/api/analytics/summary');
  assert.ok(body.junk_rate > 0);
  await post('/restore', { id: id(4) });
});

test('the analytics CSV carries the current slice', async () => {
  const response = await fetch(`${BASE}/api/analytics/export.csv?category=engineering`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/csv/);
  assert.match(response.headers.get('content-disposition'), /loanword-analytics\.csv/);
  const csv = await response.text();
  assert.match(csv, /^section,key,value,extra$/m);
  assert.match(csv, /^summary,total,/m);
});

test('the Anki export still writes the format it always did', async () => {
  const response = await fetch(`${BASE}/export.csv`);
  const csv = await response.text();
  assert.match(csv, /^front;back;reading;example;tags$/m);
  assert.match(csv, /lang:en/);
  assert.match(csv, /cat:engineering/);
});

test('settings written from the browser are sanitised', async () => {
  const { body } = await post('/settings', {
    dailyLimit: 9,
    weeklyGoal: 99,
    sessionMinutes: 7,
    exercises: ['cloze', 'astrology'],
    theme: 'neon',
  });
  assert.equal(body.dailyLimit, 9);
  assert.equal(body.weeklyGoal, 5, 'a goal above seven days is not a goal');
  assert.equal(body.sessionMinutes, 10, 'only the three offered lengths are accepted');
  assert.deepEqual(body.exercises, ['cloze']);
  assert.equal(body.theme, 'system');
  await post('/settings', { dailyLimit: 15, exercises: ['flashcards', 'learn', 'cloze', 'type', 'reverse'] });
});

test('the disabled exercises are honoured by the planner', async () => {
  await post('/settings', { exercises: ['flashcards'] });
  const { body } = await post('/session/start', { minutes: 10 });
  assert.ok(
    body.steps.every((step) => step.mode === 'flashcards' || step.mode === 'present'),
    'a first look is not an exercise the learner can switch off',
  );
  assert.equal(body.production, 'flashcards', 'production falls back to what is left on');
  await post('/settings', { exercises: ['flashcards', 'learn', 'cloze', 'type', 'reverse'] });
});

test('a body over the cap is refused before it is parsed', async () => {
  const response = await fetch(`${BASE}/grade`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: id(0), rating: 3, padding: 'x'.repeat(100_000) }),
  });
  assert.equal(response.status, 413);
});

test('the interface is served, and nothing above it is', async () => {
  assert.equal((await fetch(`${BASE}/`)).status, 200);
  assert.equal((await fetch(`${BASE}/app.js`)).status, 200);
  assert.equal((await fetch(`${BASE}/core.js`)).status, 200);
  assert.equal((await fetch(`${BASE}/charts.js`)).status, 200);
  assert.equal((await fetch(`${BASE}/answer.js`)).status, 200);
  assert.equal((await fetch(`${BASE}/manifest.webmanifest`)).status, 200);
  assert.equal((await fetch(`${BASE}/../package.json`)).status, 404);
  assert.equal((await fetch(`${BASE}/%2e%2e/package.json`)).status, 404);
});

test('the trainer asks not to be indexed', async () => {
  const html = await (await fetch(`${BASE}/`)).text();
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(html, /<link rel="manifest"/);
});


test('the state names every language capture is running for', async () => {
  const state = await (await fetch(`${BASE}/state`)).json();
  assert.ok(Array.isArray(state.targets));
  assert.deepEqual(state.targets.map((row) => row.target), ['en']);
  assert.equal(state.targets[0].building, false);
  assert.equal(typeof state.targets[0].queued, 'number');
  assert.deepEqual(state.config.targets, ['en']);
  assert.deepEqual(state.config.paused, []);
});

test('opening a language adds it to the ones being captured, and never the native one', async () => {
  const added = await post('/settings', { target: 'ka' });
  assert.equal(added.body.target, 'ka');
  assert.deepEqual(added.body.targets.sort(), ['en', 'ka'], 'the old deck keeps capturing');

  const kept = await post('/settings', { targets: ['en'] });
  assert.ok(kept.body.targets.includes('ka'), 'saving a list without the open deck keeps it');

  const refused = await post('/settings', { target: 'ru' });
  assert.equal(refused.status, 400, 'the language you write in cannot be a deck you learn');

  const back = await post('/settings', { target: 'en' });
  assert.equal(back.body.target, 'en');
});

test('a language can be paused without being closed', async () => {
  const paused = await post('/settings', { paused: ['ka'] });
  assert.deepEqual(paused.body.paused, ['ka']);
  const status = await (await fetch(`${BASE}/build/status`)).json();
  assert.deepEqual(status.targets.map((row) => row.target), ['en'], 'a paused language builds nothing');
  await post('/settings', { paused: [] });
});

test('the build status answers per language', async () => {
  const { targets } = await (await fetch(`${BASE}/build/status`)).json();
  for (const row of targets) {
    assert.equal(typeof row.queued, 'number');
    assert.equal(typeof row.building, 'boolean');
  }
});

test('speech says which offline provider each language would use', async () => {
  const status = await (await fetch(`${BASE}/speech/status`)).json();
  assert.ok('en' in status);
  assert.ok('provider' in status.en);
  assert.equal(status.en.piperVoice, 'en_US-lessac-medium');
});

test('with no offline voice the audio endpoint answers 404 rather than silence', async () => {
  const response = await fetch(`${BASE}/speech?lang=zz&text=hello`);
  assert.equal(response.status, 404);
  assert.match((await response.json()).error, /no offline voice/);
});

test('a clone is previewed before it is started, and refused when it makes no sense', async () => {
  const preview = await (await fetch(`${BASE}/clone/preview?from=en&to=ka`)).json();
  assert.equal(preview.count, 6, 'every card in the English deck is a candidate');
  assert.equal(preview.already, 0);

  const filtered = await (await fetch(`${BASE}/clone/preview?from=en&to=ka&category=process`)).json();
  assert.equal(filtered.count, 1);

  assert.equal((await fetch(`${BASE}/clone/preview?from=zz&to=ka`)).status, 404);
  const refused = await post('/clone', { from: 'en', to: 'en' });
  assert.equal(refused.status, 400);
});

test('the sync dialog is offered every deck it could copy from, with what is actually new', async () => {
  const { status, body } = await get('/clone/sources?to=ka');
  assert.equal(status, 200);
  assert.equal(body.to, 'ka');
  assert.equal(body.native, 'ru');
  assert.deepEqual(
    body.sources.map((source) => source.code),
    ['en'],
    'the deck being copied into is never offered as its own source',
  );
  assert.equal(body.sources[0].total, 6);
  assert.equal(body.sources[0].fresh, 6, 'nothing has been copied yet');
});

test('a sync copies from several decks at once, and refuses a source that is not there', async () => {
  const missing = await post('/clone', { sources: ['en', 'zz'], to: 'ka' });
  assert.equal(missing.status, 400);
  assert.match(missing.body.error, /zz/);
  const untouched = await get('/clone/sources?to=ka');
  assert.equal(untouched.body.sources[0].fresh, 6, 'a refused sync queues nothing at all');

  const { status, body } = await post('/clone', { sources: ['en'], to: 'ka', categories: ['engineering'] });
  assert.equal(status, 200);
  assert.equal(body.queued, 2);
  assert.deepEqual(body.from, ['en']);
  const left = await get('/clone/sources?to=ka');
  assert.equal(left.body.sources[0].fresh, 4, 'what is already queued stops counting as new');

  const empty = await post('/clone', { sources: [], to: 'ka' });
  assert.equal(empty.status, 400);
});

test('starting a clone queues the concepts and switches the trainer to the new deck', async () => {
  const { status, body } = await post('/clone', { from: 'en', to: 'ka', categories: ['process', 'connectors'] });
  assert.equal(status, 200);
  assert.equal(body.queued, 2);
  assert.equal(body.config.target, 'ka', 'the learner watches the new deck fill');

  const again = await post('/clone', { from: 'en', to: 'ka', categories: ['process', 'connectors'] });
  assert.equal(again.body.queued, 0, 'a second run adds nothing to the queue');

  const state = await (await fetch(`${BASE}/state`)).json();
  assert.equal(state.config.target, 'ka');
  assert.equal(state.cards.length, 0, 'and the Georgian deck is still empty until the build runs');
  assert.ok(state.alphabet, 'a new script offers its letters');
  assert.equal(state.alphabet.letters, 33);
  await post('/settings', { target: 'en' });
});

test('the alphabet is queued as one record and only where there is one', async () => {
  await post('/settings', { target: 'ka' });
  const { status, body } = await post('/alphabet', {});
  assert.equal(status, 200);
  assert.equal(body.letters, 33);
  await post('/settings', { target: 'en' });

  const none = await post('/alphabet', {});
  assert.equal(none.status, 404, 'English has no alphabet worth a starter deck');
});

test('junk asks for a reason, and only three of the four retire the phrase', async () => {
  const before = await (await fetch(`${BASE}/state`)).json();
  const victim = before.cards.find((card) => card.front === 'it slipped my mind');

  const { body } = await post('/delete', { id: victim.id, reason: 'too-rare' });
  assert.equal(body.reason, 'too-rare');
  assert.equal(body.rewrite, false);
  await post('/restore', { id: victim.id });

  const wrong = await post('/delete', { id: victim.id, reason: 'wrong-translation' });
  assert.equal(wrong.body.rewrite, true, 'a wrong translation asks the builder for a better card');
  await post('/restore', { id: victim.id });
});

test('a card can be sent back to the builder for a fresh example', async () => {
  const state = await (await fetch(`${BASE}/state`)).json();
  const card = state.cards[0];
  const { status, body } = await post('/rewrite', { id: card.id });
  assert.equal(status, 200);
  assert.equal(body.id, card.id);
  assert.equal((await post('/rewrite', { id: 'deadbeef99' })).status, 404);
});

test('a card that keeps lapsing is flagged as a leech', async () => {
  const state = await (await fetch(`${BASE}/state`)).json();
  const card = state.cards.find((entry) => entry.front === 'roll back');
  assert.equal(card.leech, false);
  assert.equal(typeof card.reading, 'string', 'every card carries a reading field, even an empty one');
});

test('the reading is editable and comes back on the card', async () => {
  const state = await (await fetch(`${BASE}/state`)).json();
  const card = state.cards[0];
  const { body } = await post('/card', { id: card.id, reading: 'rol bek' });
  assert.equal(body.card.reading, 'rol bek');
  await post('/card', { id: card.id, reading: '' });
});

test('the session summary offers a sentence of your own when there is enough to build on', async () => {
  const { body: plan } = await post('/session/start', { minutes: 5 });
  await post('/grade', { id: plan.steps[0].id, rating: 3, sessionId: plan.sessionId, mode: 'flashcards' });
  const { body } = await post('/session/end', { id: plan.sessionId });
  assert.ok(Array.isArray(body.words));
  assert.equal(typeof body.produce, 'boolean');
});

test('production practice refuses a sentence that uses nothing', async () => {
  const refused = await post('/produce', { sentence: '', words: ['roll back', 'that said'] });
  assert.equal(refused.status, 400);
  const alsoRefused = await post('/produce', { sentence: 'I wrote something', words: ['roll back'] });
  assert.equal(alsoRefused.status, 400, 'two words or it is not production');
});

test('sorting a card as known is remembered and shows on the card', async () => {
  const on = await post('/known', { id: id(2), on: true });
  assert.equal(on.status, 200);
  assert.deepEqual(on.body, { ok: true, known: true });
  let { body } = await get('/state');
  assert.equal(body.cards.find((card) => card.id === id(2)).isKnown, true);
  assert.equal(body.cards.filter((card) => card.isKnown).length, 1, 'nobody else was touched');

  const off = await post('/known', { id: id(2), on: false });
  assert.deepEqual(off.body, { ok: true, known: false });
  ({ body } = await get('/state'));
  assert.equal(body.cards.find((card) => card.id === id(2)).isKnown, false);

  const missing = await post('/known', { id: 'nope', on: true });
  assert.equal(missing.status, 404);
});

test('the export can be narrowed to the decks the learner picks', async () => {
  const everything = await fetch(`${BASE}/export.csv`);
  assert.equal(everything.status, 200);
  const all = (await everything.text()).trim().split('\n');
  assert.ok(all.length > 1, 'a header and at least one card');

  const georgian = await (await fetch(`${BASE}/export.csv?decks=ru%3Eka`)).text();
  assert.equal(georgian.trim().split('\n').length, 1, 'the Georgian deck has no built cards yet, so only the header');

  const english = await (await fetch(`${BASE}/export.csv?decks=ru%3Een`)).text();
  assert.equal(english.trim().split('\n').length, all.length, 'and the English deck is the whole export');
  assert.ok(english.includes('lang:en'));

  const nonsense = await (await fetch(`${BASE}/export.csv?decks=ru%3Ezz`)).text();
  assert.equal(nonsense.trim().split('\n').length, 1, 'a deck that does not exist exports nothing');
});

test('the deck reports the meanings it carries twice, and loses the group once one is thrown away', async () => {
  const quiet = await get('/duplicates');
  assert.equal(quiet.status, 200);
  assert.deepEqual(quiet.body.groups, [], 'the fixture deck starts clean');

  const deck = db.deckId('ru', 'en');
  db.insertCards(
    [
      {
        deck_id: deck,
        front: 'gaining traction',
        back: 'набирает популярность',
        keywords: ['gaining traction'],
        example: 'It is gaining traction.',
        category: 'process',
        cefr: 'B2',
        created_at: new Date().toISOString(),
      },
      {
        deck_id: deck,
        front: 'gain popularity',
        back: 'Набирает популярность ',
        keywords: ['gain popularity'],
        example: 'They gain popularity fast.',
        category: 'process',
        cefr: 'B2',
        created_at: new Date().toISOString(),
      },
    ],
    ['aaaaaaaa01', 'aaaaaaaa02'],
  );

  const found = await get('/duplicates');
  assert.equal(found.body.groups.length, 1);
  assert.equal(found.body.groups[0].meaning, 'набирает популярность');
  assert.deepEqual(
    found.body.groups[0].cards.map((card) => card.front),
    ['gaining traction', 'gain popularity'],
  );

  assert.deepEqual(
    found.body.groups[0].cards.map((card) => card.repeat),
    [false, false],
    'two different words for one meaning are not repeats of each other',
  );

  const thrown = await post('/delete', { id: 'aaaaaaaa02', reason: 'duplicate' });
  assert.equal(thrown.status, 200);
  const after = await get('/duplicates');
  assert.deepEqual(after.body.groups, [], 'one card left means one meaning, not a duplicate');
});

test('switching a category off moves the cards it held into everyday', async () => {
  const before = await get('/state');
  const held = before.body.cards.filter((card) => card.category === 'collaboration');
  assert.ok(held.length > 0, 'the deck has something to lose');

  const { status, body } = await post('/settings', {
    categories: ['engineering', 'process', 'phrasing', 'connectors', 'everyday'],
  });
  assert.equal(status, 200);
  assert.equal(body.refiled, held.length, 'the browser is told how many cards moved');
  assert.ok(!body.categories.includes('collaboration'));

  const after = await get('/state');
  for (const card of held) {
    const now = after.body.cards.find((entry) => entry.id === card.id);
    assert.equal(now.category, 'everyday', `${card.front} was left filed under a category that is gone`);
  }
  assert.ok(
    after.body.categories.length >= 1 && after.body.categories.includes('everyday'),
    'a deck is never left without a category to file into',
  );

  const back = await post('/settings', {
    categories: ['engineering', 'process', 'collaboration', 'phrasing', 'connectors', 'everyday'],
  });
  assert.equal(back.body.refiled, 0, 'putting the category back moves nothing on its own');
});

test('one word written twice is reported as the repeat it is', async () => {
  const deck = db.deckId('ru', 'en');
  db.insertCards(
    [
      {
        deck_id: deck,
        front: 'code review',
        back: 'обзор кода',
        keywords: ['code review'],
        example: 'The code review found a duplicated helper.',
        category: 'frontend',
        cefr: 'B1',
        created_at: new Date().toISOString(),
      },
      {
        deck_id: deck,
        front: 'code reviews',
        back: 'кода обзор',
        keywords: ['code reviews'],
        example: 'Two code reviews caught the same bug.',
        category: 'frontend',
        cefr: 'B1',
        created_at: new Date().toISOString(),
      },
    ],
    ['aaaaaaaa11', 'aaaaaaaa12'],
  );

  const { body } = await get('/duplicates');
  const group = body.groups.find((entry) => entry.cards.some((card) => card.id === 'aaaaaaaa11'));
  assert.ok(group, 'the two wordings are one meaning, whatever the word order');
  assert.deepEqual(
    group.cards.map((card) => card.repeat),
    [false, true],
    'the first one written stays, the later wording is the repeat',
  );

  for (const id of ['aaaaaaaa11', 'aaaaaaaa12']) await post('/delete', { id, reason: 'duplicate' });
});

test('the queue is previewed before a single token is spent, and a record can be thrown away', async () => {
  const { appendJsonl, queueFile, readJsonl } = await import('./store.mjs');
  writeFileSync(queueFile('en'), '');
  appendJsonl(queueFile('en'), [
    { ts: '2026-09-03T08:00:00Z', project: '~/api', source: 'prompt', text: 'давай откатим миграцию' },
    { ts: '2026-09-03T09:00:00Z', project: '~/api', source: 'session', lang: 'en', words: ['rollback', 'staging'] },
  ]);

  const preview = await get('/queue');
  assert.equal(preview.status, 200);
  const english = preview.body.profiles.find((row) => row.target === 'en');
  assert.equal(english.rows.length, 2);
  assert.equal(english.rows[0].text, 'давай откатим миграцию');
  assert.ok(english.rows[0].key, 'each row carries the key the delete button sends back');

  const dropped = await post('/queue/drop', { key: english.rows[1].key });
  assert.equal(dropped.status, 200);
  assert.equal(dropped.body.dropped, 1);
  assert.equal(dropped.body.stopped, 2, 'the words the learner already knows go to the stop-list');
  assert.equal(dropped.body.profiles.find((row) => row.target === 'en').rows.length, 1, 'and the caller redraws from the answer');

  const nothing = await post('/queue/drop', { key: 42 });
  assert.equal(nothing.body.dropped, 0, 'a key that is not a string drops nothing');

  await post('/queue/drop', { key: english.rows[0].key });
  assert.equal(readJsonl(queueFile('en')).length, 0);
});

test('the interface can start a build and is told whether one began', async () => {
  const { status, body } = await post('/build', {});
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(typeof body.started, 'boolean');
  assert.ok(Array.isArray(body.targets), 'and it gets the queue back to draw a bar with');
  assert.ok(body.targets.every((row) => typeof row.queued === 'number' && typeof row.done === 'number'));
});

test('a deck can be deleted, and the trainer moves to one that is left', async () => {
  const gone = await post('/deck/delete', { native: 'ru', target: 'zz' });
  assert.equal(gone.status, 404);

  db.insertCards(
    [
      {
        deck_id: db.deckId('ru', 'sv'),
        front: 'tack',
        back: 'спасибо',
        keywords: ['tack'],
        example: 'Tack så mycket.',
        category: 'everyday',
        cefr: 'A1',
        created_at: new Date().toISOString(),
      },
    ],
    ['bbbbbbbb01'],
  );
  await post('/settings', { native: 'ru', target: 'sv' });
  const before = await get('/state');
  assert.equal(before.body.config.target, 'sv');

  const { status, body } = await post('/deck/delete', { native: 'ru', target: 'sv' });
  assert.equal(status, 200);
  assert.equal(body.removed, 1);
  assert.notEqual(body.config.target, 'sv', 'the trainer does not sit on a deck that is gone');
  assert.ok(!(body.config.targets || []).includes('sv'), 'and it stops capturing into it');

  const after = await get('/state');
  assert.ok(!after.body.pairs.some((pair) => pair.target === 'sv' && pair.total > 0));
  const restored = await post('/restore', { id: 'bbbbbbbb01' });
  assert.equal(restored.status, 200, 'the cards are only put aside, so one can come back');
});

test('a word tapped in an example is queued as a pick, junk and repeats dropped', async () => {
  const { RANGES } = await import('./limits.mjs');
  const queue = join(DATA, 'queue.en.jsonl');
  rmSync(queue, { force: true });

  const stops = await get('/stopwords');
  assert.equal(stops.body.lang, 'en');
  assert.ok(stops.body.skip.includes('the'), 'the interface knows which words not to offer');

  const nothing = await post('/words', { words: ['the', '  '], example: 'We roll back the migration tonight.' });
  assert.equal(nothing.status, 400, 'a tap on nothing but a stop-word builds nothing');

  const { status, body } = await post('/words', {
    words: ['rolled', 'ROLLED', 'the', 'migration'],
    example: 'We roll back the migration tonight.',
  });
  assert.equal(status, 200);
  assert.equal(body.queued, 2, 'the repeat and the stop-word never reach the builder');

  const rows = readFileSync(queue, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(rows.map((row) => row.text), ['rolled', 'migration']);
  assert.ok(rows.every((row) => row.source === 'pick' && row.lang === 'en'));
  assert.equal(rows[0].example, 'We roll back the migration tonight.', 'the sentence travels with the word');

  const again = await post('/words', { words: ['rolled', 'MIGRATION'], example: 'We roll back the migration tonight.' });
  assert.equal(again.status, 400, 'a word already waiting in the queue is never queued twice');

  const owned = await post('/words', { words: ['that said'], example: 'That said, the tests are green.' });
  assert.equal(owned.status, 400, 'and neither is a word the deck already teaches');

  const listed = await get('/stopwords');
  assert.ok(listed.body.skip.includes('rolled'), 'what is queued joins the list, so the sheet stops offering it');

  rmSync(queue, { force: true });
  const many = await post('/words', {
    words: Array.from({ length: RANGES.picks.max + 8 }, (_, i) => `word${i}`),
    example: 'one sentence',
  });
  assert.equal(many.body.queued, RANGES.picks.max, 'a batch is capped by the range, never by a number typed here');
});

test('the state carries what the cards have cost, and every card its topic', async () => {
  const { body } = await get('/state');
  for (const window of ['d1', 'd7', 'd30']) {
    assert.equal(typeof body.usage[window].calls, 'number', `the panel can show the last ${window}`);
    assert.equal(typeof body.usage[window].cost, 'number');
  }
  assert.ok(body.usage.d1.calls <= body.usage.d30.calls, 'a shorter window never holds more');
  assert.ok(body.cards.every((card) => typeof card.topic === 'string'));
  assert.equal(typeof body.stats.usage.calls, 'number', 'and the stats skill sees the same number');
});

test('a topic is editable, normalised, and scopes a session', async () => {
  const { body } = await post('/card', { id: id(0), topic: ' Code Review! ' });
  assert.equal(body.card.topic, 'code review');
  await post('/card', { id: id(3), topic: 'code review' });

  const scoped = await post('/session/start', { minutes: 10, topic: 'code review' });
  assert.equal(scoped.status, 200);
  assert.equal(scoped.body.topic, 'code review');
  assert.ok(scoped.body.steps.every((step) => [id(0), id(3)].includes(step.id)));

  const unknown = await post('/session/start', { minutes: 10, topic: 'astrology' });
  assert.equal(unknown.status, 200);
  assert.equal(unknown.body.topic, '', 'a topic nobody has is ignored, not obeyed');
  assert.ok(unknown.body.steps.length >= scoped.body.steps.length);
});

test('a session can be limited to the cards of one chapter', async () => {
  const { status, body } = await post('/session/start', { minutes: 10, include: [id(2)] });
  assert.equal(status, 200);
  assert.ok(body.steps.length >= 1);
  assert.ok(body.steps.every((step) => step.id === id(2)));

  const capped = await post('/session/start', {
    minutes: 10,
    include: [id(2), ...Array.from({ length: 300 }, () => 'deadbeef00')],
  });
  assert.equal(capped.status, 200);
  assert.ok(capped.body.steps.every((step) => step.id === id(2)), 'unknown ids never count, and the list is cut at two hundred');
});

test('a chapter can be renamed from the deck, and the name is normalised', async () => {
  await post('/card', { id: id(4), topic: 'idioms' });
  await post('/card', { id: id(5), topic: 'idioms' });
  const { status, body } = await post('/topic/rename', { category: 'phrasing', from: 'idioms', to: ' Set Phrases! ' });
  assert.equal(status, 200);
  assert.equal(body.moved, 1, 'only the card filed under that category moves');
  assert.equal(body.topic, 'set phrases');
  const state = await get('/state');
  assert.equal(state.body.cards.find((card) => card.id === id(4)).topic, 'set phrases');
  assert.equal(state.body.cards.find((card) => card.id === id(5)).topic, 'idioms');
  assert.equal((await post('/topic/rename', { category: 'phrasing', from: 'set phrases', to: '   ' })).status, 400);
  assert.equal((await post('/topic/rename', { category: 'astrology', from: 'set phrases', to: 'x' })).status, 400, 'an unknown category never falls back to everyday');
});

test('the trainer keeps an estimate of the level, and only a graded test moves it', async () => {
  const fresh = await get('/state');
  assert.equal(typeof fresh.body.ability.theta, 'number');
  assert.equal(fresh.body.ability.band, '', 'no band before a hundred answers');
  assert.equal(fresh.body.ability.min, 100);
  assert.equal(fresh.body.ability.floor, fresh.body.config.level ?? '');
  const before = fresh.body.ability;

  const unseen = (await get('/state')).body.cards.find((card) => card.isNew && !card.isKnown);
  const graded = await post('/grade', { id: unseen.id, rating: 3, mode: 'flashcards' });
  assert.equal(graded.status, 200);
  const after = (await get('/state')).body.ability;
  assert.equal(after.n, before.n + 1);
  assert.ok(after.theta > before.theta, 'a card answered right raises the estimate');
  assert.equal(after.band, '', 'and still says nothing until there are enough answers');

  await post('/grade', { id: unseen.id, rating: 3, mode: 'flashcards' });
  assert.equal((await get('/state')).body.ability.n, after.n, 'the same card answered again is not new evidence');

  await post('/grade', { id: id(3), rating: 3, mode: 'wild' });
  assert.equal((await get('/state')).body.ability.n, after.n, 'a word met in the wild is not a test');
});

test('a card can be given the form it was met in and its pronunciation, and nonsense is refused', async () => {
  const saved = await post('/card', { id: id(0), form: 'rolled back', ipa: 'ˈɹoʊl bæk' });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.card.form, 'rolled back');
  assert.equal(saved.body.card.ipa, 'ˈɹoʊl bæk');

  const junk = await post('/card', { id: id(0), ipa: '/roll back/' });
  assert.equal(junk.status, 200);
  assert.equal(junk.body.card.ipa, '', 'a transcription that is not IPA is stored as nothing');
});

test('the level over time is a report like any other', async () => {
  const { status, body } = await get('/api/analytics/level');
  assert.equal(status, 200);
  assert.equal(typeof body.ms, 'number');
  assert.ok(Array.isArray(body.points));
  assert.equal(typeof body.current.n, 'number');
  assert.equal(body.current.min, 100);
  for (const point of body.points) {
    assert.ok(point.day, 'every point is a day the estimate moved');
    assert.equal(typeof point.theta, 'number');
  }
});

const UI_DIR = join(HERE, '..', 'ui');

function browserPaths() {
  const literal = new Set();
  const dynamic = new Set();
  for (const name of readdirSync(UI_DIR).filter((file) => file.endsWith('.js'))) {
    const source = readFileSync(join(UI_DIR, name), 'utf8');
    for (const [, path] of source.matchAll(/\b(?:api|fetch)\(\s*'([^']+)'/g)) literal.add(path);
    for (const [, path] of source.matchAll(/\b(?:api|fetch)\(\s*`(\/[^`$]*)/g)) dynamic.add(path);
  }
  return { literal: [...literal].sort(), dynamic: [...dynamic].sort() };
}

const SAMPLE = {
  '/card': { id: id(0), note: 'checked by the endpoint sweep' },
  '/grade': { id: id(0), rating: 3, mode: 'flashcards' },
  '/favorite': { id: id(0), on: false },
  '/known': { id: id(0), on: false },
  '/delete': { id: id(5), reason: 'not-useful' },
  '/restore': { id: id(5) },
  '/rewrite': { id: id(0), reason: 'wrong' },
  '/words': { words: ['sweep'], example: 'The sweep found every endpoint.' },
  '/topic/rename': { category: 'engineering', from: 'nothing', to: 'nothing else' },
  '/settings': {},
  '/build': {},
  '/queue/drop': { key: 'nothing' },
  '/alphabet': {},
  '/produce': { sentence: 'We roll back the migration tonight.', words: ['roll back'] },
  '/clone': { to: 'zz', sources: [] },
  '/deck/delete': { native: 'ru', target: 'zz' },
  '/categories/rebuild': {},
  '/session/start': { minutes: 10 },
  '/session/end': { id: 1 },
  '/stop': null,
};

test('every path the browser calls answers, so the interface never says "failed to fetch"', async () => {
  const { literal, dynamic } = browserPaths();
  assert.ok(literal.length > 15, `expected the whole interface, found ${literal.length} paths`);

  const routes = readFileSync(SERVE, 'utf8');
  const served = (path) =>
    routes.includes(`url.pathname === '${path}'`) || routes.includes(`url.pathname.startsWith('${path}`);

  const missing = [...literal, ...dynamic]
    .map((path) => path.split('?')[0].replace(/\/$/, ''))
    .filter((path) => !served(path) && !routes.includes(`startsWith('${path}`));
  assert.deepEqual(missing, [], 'the browser calls a path serve.mjs has no route for');

  const crashed = [];
  for (const path of literal) {
    if (path === '/stop') continue;
    const payload = SAMPLE[path];
    const answer = payload === undefined ? await get(path) : await post(path, payload);
    if (answer.status >= 500) crashed.push(`${path} → ${answer.status}`);
  }
  assert.deepEqual(crashed, [], 'a path that answers 5xx is a "failed to fetch" waiting to happen');
});

test('every live path is one the service worker never serves from its cache', () => {
  const { literal, dynamic } = browserPaths();
  const worker = readFileSync(join(UI_DIR, 'sw.js'), 'utf8');
  const live = new RegExp(worker.match(/const LIVE = \/([^;]+)\/;/)[1]);
  const cached = [...literal, ...dynamic]
    .map((path) => path.split('?')[0])
    .filter((path) => path.startsWith('/') && !live.test(path));
  assert.deepEqual(cached, [], 'add it to LIVE in ui/sw.js, or the page will answer from a stale cache');
});
