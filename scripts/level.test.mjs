import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BANDS,
  CENTRE,
  GAIN_FLOOR,
  MIN_ANSWERS,
  MIN_PER_BAND,
  THETA_LIMIT,
  ceilingOf,
  estimate,
  expected,
  gain,
  itemDifficulty,
  labelOf,
  levelFor,
  outcome,
  replay,
  seedTheta,
  update,
  windowOf,
} from './level.mjs';

const near = (actual, wanted, slack = 0.01) =>
  assert.ok(Math.abs(actual - wanted) <= slack, `${actual} is not within ${slack} of ${wanted}`);

test('a learner with no floor starts at the centre of B1', () => {
  assert.equal(seedTheta(''), -0.5);
  assert.equal(seedTheta('C1'), CENTRE.C1);
  assert.equal(seedTheta('nonsense'), -0.5);
  assert.equal(seedTheta(undefined), -0.5);
});

test('an item is as hard as its band, nudged by how hard the card has proved', () => {
  assert.equal(itemDifficulty('B2', 5.5), CENTRE.B2, 'an average card sits on its band');
  assert.ok(itemDifficulty('B2', 10) > CENTRE.B2);
  assert.ok(itemDifficulty('B2', 1) < CENTRE.B2);
  near(itemDifficulty('B2', 10), 0.5 + 0.5, 0.001);
  assert.equal(itemDifficulty('B2', 99), itemDifficulty('B2', 10), 'difficulty is clamped to the FSRS range');
  assert.equal(itemDifficulty('', 5), null, 'a card with no band says nothing about the learner');
  assert.equal(itemDifficulty('Z9', 5), null);
});

test('Hard is a recall that cost something, Again is a miss', () => {
  assert.equal(outcome(1), 0);
  assert.equal(outcome(2), 0.5);
  assert.equal(outcome(3), 1);
  assert.equal(outcome(4), 1);
  assert.equal(outcome(0), null);
  assert.equal(outcome('3'), 1, 'a rating arrives as text from the browser');
  assert.equal(outcome(null), null);
});

test('four choices carry a quarter of a chance before the learner knows anything', () => {
  assert.equal(expected(0, 0, 'learn'), 0.625);
  assert.equal(expected(0, 0, 'flashcards'), 0.5);
  assert.ok(expected(2, 0, 'cloze') > 0.85);
  assert.ok(expected(-2, 0, 'cloze') < 0.15);
});

test('the estimate settles as answers arrive, but never stops moving', () => {
  assert.equal(gain(0), 1.8);
  near(gain(10), 1.2, 1e-9);
  near(gain(100), 0.3, 1e-9);
  assert.equal(gain(1e9), GAIN_FLOOR, 'a learner who keeps learning keeps moving');
});

test('the worked example in proficiency.md holds', () => {
  const tenth = update({ theta: -0.5, n: 9, label: '' }, {
    first: true,
    rating: 3,
    mode: 'flashcards',
    cefr: 'B2',
    difficulty: 5.5,
  });
  near(tenth.theta, 0.38);
  assert.equal(tenth.n, 10);
  assert.deepEqual(tenth.bands, { B2: 1 });

  const hundredth = update({ theta: tenth.theta, n: 99, label: tenth.label }, {
    first: true,
    rating: 1,
    mode: 'flashcards',
    cefr: 'C1',
    difficulty: 5.5,
  });
  near(hundredth.theta, 0.31);
  assert.equal(hundredth.n, 100);
});

test('only the first answer to a card is evidence; meeting it again is learning', () => {
  const state = { theta: -0.5, n: 4, label: 'B1', bands: { B1: 4 } };
  const again = { first: false, rating: 3, mode: 'flashcards', cefr: 'B1', difficulty: 5 };
  assert.equal(update(state, again), state, 'a repeat leaves the estimate exactly where it was');
  assert.equal(update(state, { ...again, first: undefined }), state, 'a row from before the rule says nothing');
  assert.notEqual(update(state, { ...again, first: true }), state);
});

test('two hundred right answers on A1 cards can never report above A1', () => {
  let state = { theta: -0.5, n: 0, label: '', bands: {} };
  for (let round = 0; round < 200; round += 1) {
    state = update(state, { first: true, rating: 3, mode: 'flashcards', cefr: 'A1', difficulty: 5 });
  }
  const reading = estimate(state);
  assert.equal(reading.band, 'A1', 'the deck holds nothing harder, so neither can the estimate');
  assert.equal(reading.ceiling, 'A1');
  assert.ok(state.theta <= THETA_LIMIT, 'and the scale has an end');
});

test('the estimate is held inside the six bands it can name', () => {
  let state = { theta: -0.5, n: 0, label: '', bands: {} };
  for (let round = 0; round < 500; round += 1) {
    state = update(state, { first: true, rating: 4, mode: 'flashcards', cefr: 'C2', difficulty: 10 });
  }
  assert.equal(state.theta, THETA_LIMIT);
  assert.equal(estimate({ theta: 99, n: 999, label: 'C2', bands: { C2: 99 } }).theta, THETA_LIMIT);
  assert.equal(estimate({ theta: -99, n: 999, label: 'A1', bands: { A1: 99 } }).theta, -THETA_LIMIT);
});

test('a band is only reportable once the learner has met ten cards of it', () => {
  assert.equal(ceilingOf({}), '');
  assert.equal(ceilingOf({ B1: MIN_PER_BAND - 1 }), '', 'nine cards are not a band');
  assert.equal(ceilingOf({ B1: MIN_PER_BAND }), 'B1');
  assert.equal(ceilingOf({ A2: 40, B1: MIN_PER_BAND, C1: 2 }), 'B1', 'the highest band actually met');
  assert.equal(ceilingOf({ B1: 'many' }), '', 'a broken tally counts for nothing');

  const reading = estimate({ theta: 2.4, n: 400, label: 'C2', bands: { B1: 300, B2: 100 } });
  assert.equal(reading.band, 'B2', 'a deck with no C1 cards cannot report C1');
  assert.equal(reading.ceiling, 'B2');
});

test('only a graded test counts, and the same state comes back when it does not', () => {
  const state = { theta: -0.5, n: 4, label: 'B1', bands: { B1: 4 } };
  const met = { first: true, rating: 3, cefr: 'B1', difficulty: 5 };
  for (const mode of ['wild', 'produce', '']) {
    assert.equal(update(state, { ...met, mode }), state, `${mode} is not a test`);
  }
  assert.equal(update(state, { ...met, mode: 'cloze', rating: 9 }), state, 'no outcome');
  assert.equal(update(state, { ...met, mode: 'cloze', cefr: '' }), state, 'no band');
  assert.notEqual(update(state, { ...met, mode: 'type' }), state);
});

test('the label crosses a boundary only once it is clear of it', () => {
  assert.equal(labelOf(0.1, ''), 'B2', 'with nothing to hold on to the nearest band wins');
  assert.equal(labelOf(0.1, 'B1'), 'B1', 'a step over the boundary is not a new level');
  assert.equal(labelOf(0.16, 'B1'), 'B2');
  assert.equal(labelOf(-0.1, 'B2'), 'B2');
  assert.equal(labelOf(-0.16, 'B2'), 'B1');
  assert.equal(labelOf(-9, 'C2'), 'A1', 'a long fall is still a fall');
  assert.equal(labelOf(9, ''), 'C2');
});

test('a replay of the log is the state the log would have left', () => {
  const reviews = Array.from({ length: 12 }, () => ({
    first: true,
    rating: 3,
    mode: 'flashcards',
    cefr: 'B2',
    difficulty: 5.5,
  }));
  const replayed = replay(reviews, -0.5);
  let folded = { theta: -0.5, n: 0, label: '', bands: {} };
  for (const review of reviews) folded = update(folded, review);
  assert.deepEqual(replayed, folded);
  assert.equal(replay([], -0.5).n, 0);
  assert.equal(replay(null).theta, -0.5, 'no log, no estimate');
});

test('no band is shown before a hundred first answers', () => {
  assert.equal(MIN_ANSWERS, 100);
  const bands = { B1: 60, B2: 40 };
  const shy = estimate({ theta: 0.4, n: MIN_ANSWERS - 1, label: 'B2', bands });
  assert.equal(shy.band, '');
  assert.equal(shy.confident, false);
  assert.equal(shy.min, MIN_ANSWERS);
  const sure = estimate({ theta: 0.4, n: MIN_ANSWERS, label: 'B2', bands });
  assert.equal(sure.band, 'B2');
  assert.equal(sure.confident, true);
  assert.equal(estimate(null).theta, -0.5);
  assert.equal(estimate({ theta: 'x', n: -3, label: 'zz' }).n, 0, 'a broken row reads as a fresh deck');
});

test('the window is the band and the one above, and C2 has nothing above it', () => {
  assert.deepEqual(windowOf('B1'), ['B1', 'B2']);
  assert.deepEqual(windowOf('C2'), ['C2', 'C2']);
  assert.deepEqual(windowOf(''), ['B1', 'B2'], 'the old B1 floor is what no estimate means');
  assert.deepEqual(windowOf('nonsense'), ['B1', 'B2']);
  assert.equal(BANDS.length, 6);
});

test('a floor set by hand beats the arithmetic', () => {
  const state = { theta: 2.4, n: 400, label: 'C2', bands: { C1: 200, C2: 200 } };
  assert.equal(levelFor({ level: 'A2' }, state), 'A2');
  assert.equal(levelFor({ level: '' }, state), 'C2');
  assert.equal(levelFor({}, { theta: 0, n: 3, label: 'B2' }), '', 'too few answers to name a level');
});
