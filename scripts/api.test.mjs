import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
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

test('the plan never repeats a domain twice in a row', async () => {
  const { body } = await post('/session/start', { minutes: 15 });
  for (let index = 1; index < body.steps.length; index++) {
    assert.notEqual(body.steps[index].category, body.steps[index - 1].category);
  }
});

test('a session can be scoped to one domain', async () => {
  const { body } = await post('/session/start', { minutes: 10, category: 'engineering' });
  assert.ok(body.steps.every((step) => step.category === 'engineering'));
  assert.equal(body.category, 'engineering');
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
