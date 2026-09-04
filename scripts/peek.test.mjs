import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_EVERY_MINUTES,
  PEEK_POOLS,
  candidates,
  parsePick,
  peekDue,
  pickPeek,
  renderPeek,
} from './peek.mjs';
import { LEECH_LAPSES } from './store-paths.mjs';

const row = (front, overrides = {}) => ({
  front,
  back: `значение ${front}`,
  reading: '',
  example: `An example with ${front}.`,
  cefr: 'B1',
  starred: false,
  lapses: 0,
  seen: true,
  r: 0.5,
  ...overrides,
});

const DECK = [
  row('solid', { r: 0.99 }),
  row('slipping', { r: 0.4 }),
  row('loved', { r: 0.98, starred: true }),
  row('stubborn', { r: 0.95, lapses: LEECH_LAPSES }),
  row('fresh', { seen: false, r: 0 }),
  row('advanced', { r: 0.97, cefr: 'C1' }),
  row('beginner', { r: 0.96, cefr: 'A1' }),
];

const fronts = (list) => list.map((entry) => entry.front).sort();

test('a card is due the first time, and then only after the interval', () => {
  assert.equal(peekDue(null, 0, 15), true, 'the first prompt of a session always earns one');
  assert.equal(peekDue(1_000_000, 1_000_000 + 60_000, 15), false);
  assert.equal(peekDue(1_000_000, 1_000_000 + 15 * 60_000, 15), true);
  assert.equal(peekDue(1_000_000, 1_000_000 + 61_000, 1), true, 'a one-minute interval is honoured');
  assert.equal(peekDue(1_000_000, 1_000_000 + 61_000, 0), true, 'a nonsense interval falls back to a minute');
  assert.equal(DEFAULT_EVERY_MINUTES, 15);
});

test('the pick is a list, however it was written down', () => {
  assert.deepEqual(parsePick(['starred', 'B1']), ['starred', 'B1']);
  assert.deepEqual(parsePick('starred, b1'), ['starred', 'B1'], 'a comma-separated string is the same thing');
  assert.deepEqual(parsePick('starred slipping'), ['starred', 'slipping'], 'and so is a space-separated one');
  assert.deepEqual(parsePick('starred,starred'), ['starred'], 'never twice');
  assert.deepEqual(parsePick('astrology,D9'), [], 'anything it does not know is dropped');
  assert.deepEqual(parsePick(''), []);
  assert.deepEqual(parsePick(null), []);
  assert.deepEqual(parsePick(PEEK_POOLS.join(',')), PEEK_POOLS);
});

test('the modes the first version shipped still mean something', () => {
  assert.deepEqual(parsePick('mixed'), ['starred', 'slipping']);
  assert.deepEqual(parsePick('hard'), ['slipping']);
  assert.deepEqual(parsePick('off'), []);
});

test('each state draws from the pool it names', () => {
  assert.deepEqual(fronts(candidates(DECK, ['starred'])), ['loved']);
  assert.deepEqual(fronts(candidates(DECK, ['slipping'])), ['slipping']);
  assert.deepEqual(fronts(candidates(DECK, ['leech'])), ['stubborn']);
  assert.deepEqual(fronts(candidates(DECK, ['new'])), ['fresh']);
});

test('states are combined, not narrowed', () => {
  assert.deepEqual(fronts(candidates(DECK, ['starred', 'new'])), ['fresh', 'loved']);
  assert.deepEqual(
    fronts(candidates(DECK, ['starred', 'slipping', 'leech'])),
    ['loved', 'slipping', 'stubborn'],
  );
});

test('a level narrows whatever the states left', () => {
  assert.deepEqual(fronts(candidates(DECK, ['C1'])), ['advanced'], 'a level on its own is a filter');
  assert.deepEqual(fronts(candidates(DECK, ['A1', 'C1'])), ['advanced', 'beginner']);
  assert.deepEqual(fronts(candidates(DECK, ['starred', 'B1'])), ['loved'], 'starred, and B1');
  assert.deepEqual(
    fronts(candidates(DECK, ['starred', 'C1'])),
    [],
    'nothing starred at C1 means nothing is shown — never a card you did not ask for',
  );
});

test('choosing nothing means every card is fair game', () => {
  assert.equal(candidates(DECK, []).length, DECK.length);
  assert.equal(candidates(DECK, '').length, DECK.length);
  assert.equal(candidates([], ['starred']).length, 0);
  assert.equal(candidates([{ front: 'half a card' }], []).length, 0, 'half a card is not a card');
});

test('the card drawn is one of the ones closest to being forgotten', () => {
  const rows = Array.from({ length: 9 }, (_, index) => row(`w${index}`, { r: index / 10 }));
  const picked = pickPeek(rows, ['slipping'], () => 0.99);
  assert.ok(['w0', 'w1', 'w2'].includes(picked.front), `drew ${picked.front} from the wrong third`);
  assert.equal(pickPeek([], ['starred']), null);
});

test('the card reads in five lines and never leaks a whole paragraph', () => {
  const text = renderPeek(
    row('roll back', { reading: 'rol bek', starred: true, lapses: 7, example: 'x'.repeat(400) }),
    { native: 'ru', target: 'en' },
  );
  const lines = text.split('\n').filter(Boolean);
  assert.equal(lines.length, 5, 'a rule, the phrase, its meaning, one example, one footer');
  assert.ok(text.includes('roll back'));
  assert.ok(text.includes('rol bek'));
  assert.ok(text.includes('★') && text.includes('leech') && text.includes('B1'));
  assert.ok(lines[3].length < 120, 'the example is cut, not dumped');
  assert.equal(renderPeek(null), '');
});

test('a card never seen says so instead of claiming a recall score', () => {
  const text = renderPeek(row('fresh', { seen: false, r: 0 }), { native: 'ru', target: 'en' });
  assert.ok(text.includes('new'));
  assert.ok(!text.includes('recall'));
});

import { lineOf, slotNow } from './peek.mjs';

test('the status line shows the weakest card first and cycles on a fixed clock', () => {
  const rows = [
    { front: 'roll back', back: 'откатить', reading: '', seen: true, r: 0.62, lapses: 0, starred: false, cefr: 'B1' },
    { front: 'quorum', back: 'кворум', reading: 'kvorum', seen: false, r: 0, lapses: 0, starred: false, cefr: 'B2' },
    { front: 'flaky', back: 'нестабильный', reading: '', seen: true, r: 0.9, lapses: LEECH_LAPSES, starred: true, cefr: 'C1' },
  ];
  assert.equal(lineOf(rows), 'Loanword · quorum — кворум · kvorum · new', 'unseen cards sort first');
  assert.equal(lineOf(rows, [], { slot: 1 }), 'Loanword · roll back — откатить · 62%');
  assert.equal(lineOf(rows, [], { slot: 2 }), 'Loanword · flaky — нестабильный · leech');
  assert.equal(lineOf(rows, [], { slot: 3 }), lineOf(rows), 'the slot wraps around the pool');
  assert.equal(lineOf(rows, ['starred']), 'Loanword · flaky — нестабильный · leech', 'the peek filter narrows the pool');
  assert.equal(lineOf(rows, ['C2']), '', 'an empty pool prints nothing');
  assert.equal(lineOf([]), '');
  const long = lineOf([{ ...rows[0], back: 'x'.repeat(200) }], [], { width: 30 });
  assert.equal([...long].length, 30);
  assert.ok(long.endsWith('…'));
});

test('the slot is the wall clock divided into intervals', () => {
  assert.equal(slotNow(10, 25_000), 2);
  assert.equal(slotNow(10, 29_999), 2);
  assert.equal(slotNow(10, 30_000), 3);
  assert.equal(slotNow(0, 5_000), 5, 'a nonsense interval falls back to one second');
});
