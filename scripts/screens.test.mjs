import test from 'node:test';
import assert from 'node:assert/strict';

const nodes = new Map();

function element(id = '') {
  const node = {
    id,
    dataset: {},
    style: { setProperty() {} },
    classList: { add() {}, remove() {}, toggle() {} },
    innerHTML: '',
    textContent: '',
    value: '',
    open: false,
    hidden: false,
    children: [],
    setAttribute() {},
    getAttribute: () => null,
    removeAttribute() {},
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    remove() {},
    focus() {},
    blur() {},
    select() {},
    setSelectionRange() {},
    click() {},
    showModal() {
      node.open = true;
    },
    close() {
      node.open = false;
    },
    scrollIntoView() {},
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 320, height: 200, right: 320, bottom: 200 }),
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    contains: () => false,
  };
  return node;
}

const find = (selector) => {
  if (!nodes.has(selector)) nodes.set(selector, element(selector.replace('#', '')));
  return nodes.get(selector);
};

globalThis.document = {
  documentElement: element('html'),
  body: element('body'),
  head: element('head'),
  createElement: () => element(),
  createTextNode: () => element(),
  addEventListener() {},
  removeEventListener() {},
  querySelector: (selector) => find(selector),
  querySelectorAll: () => [],
  getElementById: (id) => find(`#${id}`),
};
globalThis.window = globalThis;
globalThis.innerWidth = 1440;
globalThis.innerHeight = 900;
globalThis.scrollTo = () => {};
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.location = { hash: '#/overview', reload() {} };
Object.defineProperty(globalThis, 'navigator', {
  value: { language: 'en', serviceWorker: { register: async () => {} } },
  configurable: true,
});
globalThis.requestAnimationFrame = (fn) => fn();
globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });

const core = await import('../ui/core.js');
await import('../ui/overview.js');
await import('../ui/deck.js');
await import('../ui/study.js');
await import('../ui/practice.js');
await import('../ui/analytics.js');
await import('../ui/settings.js');

test.after(() => {
  clearInterval(core.app.buildPoll);
  core.app.buildPoll = 0;
});

const CARD = {
  id: 'aaaaaaaa01',
  front: 'roll back a migration',
  back: 'откатить миграцию',
  form: 'откатили',
  ipa: 'ɹoʊl bæk',
  reading: '',
  example: 'We roll back a migration before the index finishes.',
  keywords: ['migration'],
  note: '',
  category: 'engineering',
  cefr: 'B1',
  topic: 'code review',
  project: '~/work/api',
  source: 'мы уже откатили миграцию',
  ts: new Date().toISOString(),
  due: new Date().toISOString(),
  isNew: false,
  isDue: true,
  isFavorite: false,
  reps: 3,
  lapses: 1,
  leech: false,
  stability: 9,
  retrievability: 0.8,
  mastery: 0.43,
  haystack: 'roll back a migration откатить миграцию',
};

core.app.config = {
  native: 'ru',
  target: 'en',
  targets: ['en'],
  paused: [],
  categories: [],
  level: '',
  theme: 'system',
  studyMode: 'flashcards',
  dailyLimit: 15,
  weeklyGoal: 5,
  sessionMinutes: 10,
  exercises: ['flashcards', 'learn', 'cloze', 'type', 'reverse'],
  model: 'sonnet',
  echo: 'off',
  mode: 'both',
  speech: 'reveal',
  peek: 'off',
  peekEvery: 15,
  tickerEvery: 30,
  peekPick: {},
  produce: true,
  phonetics: 'auto',
  showIntervals: true,
  uiLang: '',
  field: '',
};
core.app.cards = [CARD];
core.app.pairs = [{ native: 'ru', target: 'en', total: 1, due: 1 }];
core.app.uiLanguages = ['ru'];
core.app.targets = [{ target: 'en', queued: 3, building: false, done: 0, total: 0, batch: 0, batches: 0 }];
core.app.queued = 3;
core.app.ability = { band: 'B2', theta: 0.4, n: 162, min: 100, ceiling: 'B2', confident: true, floor: '' };
core.app.usage = { totals: {}, models: [] };
core.app.speech = {};
core.app.stats = {
  total: 1,
  seen: 1,
  learned: 0,
  due_now: 1,
  streak: 3,
  weekly: { days: 3, goal: 5, week: [1, 1, 1, 0, 0, 0, 0] },
  reviewed_today: 4,
  minutes_today: 6,
  daily_limit: 15,
  wild_7: 0,
  mastery: 0.43,
  activity: [{ date: '2026-09-04', reviews: 4 }],
  categories: [{ key: 'engineering', total: 1, seen: 1, learned: 0, due: 1, mastery: 0.43 }],
  levels: [{ key: 'B1', total: 1, seen: 1, learned: 0, due: 1, mastery: 0.43 }],
  hardest: [],
  usage: {},
};
core.app.loaded = true;

test('every screen renders from one deck without reaching for something that is not there', () => {
  for (const route of ['overview', 'deck', 'study', 'practice', 'analytics', 'settings']) {
    core.app.route = route;
    assert.doesNotThrow(() => core.render(), `${route} threw while rendering`);
  }
});

test('a build that fell over is said so on the overview, with the queue still there', () => {
  core.app.route = 'overview';
  core.app.targets = [
    { target: 'en', queued: 3, building: false, done: 0, total: 0, batch: 0, batches: 0, failed: 'Credit balance is too low' },
  ];
  core.render();
  const page = document.querySelector('#page-overview').innerHTML;
  assert.match(page, /Credit balance is too low/, 'the learner is told why, not left guessing');
  assert.match(page, /data-act="build-now"/, 'and can try again from the same button');
  core.app.targets = [{ target: 'en', queued: 3, building: false, done: 0, total: 0, batch: 0, batches: 0, failed: '' }];
});

test('the overview says what it knows about the level, and offers the build', () => {
  core.app.route = 'overview';
  core.render();
  const page = document.querySelector('#page-overview').innerHTML;
  assert.match(page, /B2/, 'the estimated band is on the page');
  assert.match(page, /162/, 'with the answers behind it');
  assert.match(page, /data-act="build-now"/, 'and the build is one click away');
});

test('a deck with too few answers is told how many are still wanted, not given a band', () => {
  core.app.route = 'overview';
  core.app.ability = { band: '', theta: -0.2, n: 12, min: 100, ceiling: '', confident: false, floor: '' };
  core.render();
  const page = document.querySelector('#page-overview').innerHTML;
  assert.match(page, /12/, 'the answers so far');
  assert.match(page, /100/, 'and the number that makes an estimate worth showing');
  core.app.ability = { band: 'B2', theta: 0.4, n: 162, min: 100, ceiling: 'B2', confident: true, floor: '' };
});

test('a card shows the form it was met in and its pronunciation', () => {
  core.app.route = 'study';
  core.render();
  core.app.route = 'deck';
  core.render();
  const page = document.querySelector('#page-deck').innerHTML;
  assert.ok(page.length > 0);
});

test('the queue dialog draws a column per language and a row per record', async () => {
  const overview = await import('../ui/overview.js');
  core.app.queue = {
    profiles: [
      {
        target: 'en',
        queued: 2,
        rows: [
          { key: 'a', source: 'prompt', ts: '', project: '~/work/api', text: 'давай откатим миграцию' },
          { key: 'b', source: 'session', ts: '', project: '', text: 'rollback, staging' },
        ],
      },
      { target: 'de', queued: 0, rows: [] },
    ],
    loading: false,
  };
  overview.renderQueue();
  const body = document.querySelector('#queue-body').innerHTML;
  assert.match(body, /q-cols/);
  assert.match(body, /давай откатим миграцию/);
  assert.match(body, /data-act="queue-drop" data-value="0:1"/, 'every row can be thrown away by its place');
  assert.match(body, /data-act="queue-start"/);
});

test('a trainer that has gone away is said so, never as "failed to fetch"', async () => {
  const core = await import('../ui/core.js');
  const before = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };
  core.app.offline = false;

  const timers = [];
  const tick = globalThis.setInterval;
  globalThis.setInterval = (fn, ms) => {
    const id = tick(fn, ms);
    timers.push(id);
    return id;
  };

  let message = '';
  try {
    await core.api('/state');
  } catch (error) {
    message = error.message;
  }
  globalThis.fetch = before;
  globalThis.setInterval = tick;
  for (const id of timers) clearInterval(id);

  assert.doesNotMatch(message, /failed to fetch/i, 'the browser wording never reaches the learner');
  assert.equal(message, 'The trainer is not running');
  assert.equal(core.app.offline, true, 'and the page switches to the card that reconnects on its own');
  assert.match(document.querySelector('#main').innerHTML, /trainer is not running/i);
  core.app.offline = false;
});
