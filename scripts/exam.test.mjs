import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MATCH_SIZE,
  TYPES,
  buildTest,
  eligibleCards,
  facesOf,
  isAnswered,
  pointsOf,
  scoreTest,
  sideOf,
  sortCounts,
  splitAcross,
} from './exam.mjs';

const CARDS = Array.from({ length: 12 }, (_, i) => ({
  id: `c${i}`,
  front: `word${i}`,
  back: `meaning${i}`,
  isKnown: i % 4 === 0,
}));

const seeded = (seed = 7) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

test('cards sorted as known stay out of Learn and Test', () => {
  assert.deepEqual(
    eligibleCards(CARDS).map((card) => card.id),
    CARDS.filter((card) => !card.isKnown).map((card) => card.id),
  );
});

test('answer with term asks the definition and expects the word', () => {
  assert.equal(sideOf('term'), 'term');
  assert.equal(sideOf('definition'), 'definition');
  assert.equal(sideOf('both', () => 0.2), 'term');
  assert.equal(sideOf('both', () => 0.9), 'definition');
  assert.deepEqual(facesOf(CARDS[1], 'term'), {
    prompt: 'meaning1',
    answer: 'word1',
    promptSide: 'definition',
    answerSide: 'term',
  });
});

test('a choice is never the right answer twice, even with a twin card in the deck', () => {
  const twins = [...CARDS, { id: 'dup', front: 'word1', back: 'meaning1' }];
  const questions = buildTest(twins, { count: twins.length, types: ['mc'], answerWith: 'both', random: seeded() });
  for (const question of questions) {
    assert.equal(question.choices.length, 4);
    assert.equal(new Set(question.choices.map((choice) => choice.toLowerCase())).size, 4);
    assert.ok(question.choices.includes(question.answer));
  }
});

test('a true or false question shows a plausible other answer, never the right one twice', () => {
  const questions = buildTest(CARDS, { count: 6, types: ['tf'], answerWith: 'both', random: seeded(21) });
  for (const question of questions) {
    if (question.truth) assert.equal(question.shown, question.answer);
    else assert.notEqual(question.shown, question.answer);
  }
});

test('a pool is dealt evenly across the enabled question types', () => {
  assert.deepEqual(splitAcross([1, 2, 3, 4, 5], ['a', 'b']), [
    [1, 3, 5],
    [2, 4],
  ]);
});

test('a test honours the count and groups questions by type in a fixed order', () => {
  const questions = buildTest(CARDS, { count: 10, types: [...TYPES], answerWith: 'both', random: seeded() });
  const kinds = questions.map((question) => question.kind);
  const order = kinds.filter((kind, i) => kinds.indexOf(kind) === i);
  assert.deepEqual(order, ['tf', 'mc', 'match', 'written']);
  const cards = questions.reduce((sum, question) => sum + pointsOf(question), 0);
  assert.equal(cards, 10, 'every card in the pool is asked once');
  assert.ok(questions.every((question, n) => question.n === n));
  const match = questions.find((question) => question.kind === 'match');
  assert.ok(match.items.length >= 2 && match.items.length <= MATCH_SIZE);
  assert.equal(match.options.length, match.items.length);
  const mc = questions.find((question) => question.kind === 'mc');
  assert.equal(mc.choices.length, 4);
  assert.ok(mc.choices.includes(mc.answer));
});

test('a single stray card never becomes a matching block of one', () => {
  const questions = buildTest(CARDS.slice(0, 5), { count: 5, types: ['match'], random: seeded(3) });
  assert.deepEqual(
    questions.map((question) => question.kind),
    ['match', 'mc'],
  );
});

test('a true/false question shows the real answer or a plausible other one', () => {
  const [q] = buildTest(CARDS, { count: 1, types: ['tf'], answerWith: 'definition', random: () => 0.1 });
  assert.equal(q.kind, 'tf');
  assert.equal(q.truth, true);
  assert.equal(q.shown, q.answer);
  const [f] = buildTest(CARDS, { count: 1, types: ['tf'], answerWith: 'definition', random: () => 0.9 });
  assert.equal(f.truth, false);
  assert.notEqual(f.shown, f.answer);
});

test('nothing enabled, or nothing to ask, yields an empty test', () => {
  assert.deepEqual(buildTest(CARDS, { types: [] }), []);
  assert.deepEqual(buildTest([], { types: ['mc'] }), []);
});

test('scoring counts every matched pair and treats blanks as skipped', () => {
  const questions = buildTest(CARDS, { count: 8, types: ['tf', 'mc', 'match', 'written'], random: seeded(11) });
  const answers = {};
  for (const question of questions) {
    if (question.kind === 'tf') answers[question.n] = question.truth;
    if (question.kind === 'mc') answers[question.n] = question.answer;
    if (question.kind === 'match') answers[question.n] = Object.fromEntries(question.items.map((item) => [item.id, item.answer]));
  }
  const score = scoreTest(questions, answers);
  const written = questions.filter((question) => question.kind === 'written').length;
  assert.equal(score.total, 8);
  assert.equal(score.earned, 8 - written);
  assert.ok(score.results.filter((row) => row.skipped).length === written);

  const written_ = questions.find((question) => question.kind === 'written');
  assert.equal(isAnswered(written_, '   '), false);
  answers[written_.n] = written_.answer.toUpperCase();
  assert.equal(scoreTest(questions, answers).earned, 8 - written + 1, 'case never matters');
  answers[written_.n] = 'nope';
  assert.equal(scoreTest(questions, answers, () => true).earned, 8 - written + 1, 'a forgiving checker can be plugged in');
});

test('a half-filled matching block is still unanswered', () => {
  const [match] = buildTest(CARDS.slice(0, 4), { count: 4, types: ['match'], random: seeded(5) });
  const [first] = match.items;
  assert.equal(isAnswered(match, { [first.id]: first.answer }), false);
});

test('the sort tally counts both piles', () => {
  assert.deepEqual(sortCounts({ a: true, b: false, c: true }), { known: 2, learning: 1 });
  assert.deepEqual(sortCounts({}), { known: 0, learning: 0 });
});
