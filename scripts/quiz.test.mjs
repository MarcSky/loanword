import test from 'node:test';
import assert from 'node:assert/strict';
import {
  frontOf,
  CHOICES,
  REVEALING,
  SWIPE_THRESHOLD,
  studyAction,
  buildChoices,
  flyDirection,
  rankDistractors,
  similarity,
  swipeTint,
  swipeVerdict,
} from './quiz.mjs';

const card = (id, overrides = {}) => ({
  id,
  front: `front ${id}`,
  back: `back ${id}`,
  category: 'everyday',
  cefr: 'B1',
  pos: 'noun',
  keywords: [],
  ...overrides,
});

test('the browser and the tests pick distractors with the same code', async () => {
  const browser = await import('../ui/quiz.js');
  assert.equal(browser.buildChoices, buildChoices);
});

test('a wrong answer that looks like the right one outranks an unrelated card', () => {
  const target = card('a', {
    front: 'roll back the migration',
    back: 'откатить миграцию',
    category: 'engineering',
    pos: 'verb',
  });
  const near = card('b', {
    front: 'rebuild the index',
    back: 'перестроить индекс',
    category: 'engineering',
    pos: 'verb',
  });
  const far = card('c', { front: 'deadline', back: 'срок', category: 'process', pos: 'noun' });

  assert.ok(similarity(target, near) > similarity(target, far));
  assert.deepEqual(rankDistractors(target, [far, near]).map((entry) => entry.id), ['b', 'c']);
});

test('a shared keyword counts for more than a shared domain', () => {
  const target = card('a', { keywords: ['ship'], category: 'process' });
  const sameKeyword = card('b', { keywords: ['ship'], category: 'everyday', pos: 'verb' });
  const sameDomain = card('c', { category: 'process', pos: 'verb' });
  assert.ok(similarity(target, sameKeyword) > similarity(target, sameDomain));
});

test('two cards with the same meaning are never both offered', () => {
  const target = card('a', { back: 'срок' });
  const twin = card('b', { back: 'срок' });
  const other = card('c', { back: 'что-то ещё' });
  const ranked = rankDistractors(target, [twin, other]);
  assert.deepEqual(ranked.map((entry) => entry.id), ['c'], 'the twin of the answer is not a wrong answer');

  const duplicate = card('d', { back: 'что-то ещё' });
  assert.equal(rankDistractors(target, [other, duplicate]).length, 1, 'and neither are two of each other');
});

test('a thin deck still fills the exercise', () => {
  const target = card('a');
  const choices = buildChoices(target, [card('b'), card('c')]);
  assert.ok(choices.includes(target.back));
  assert.equal(new Set(choices).size, choices.length);
  assert.ok(choices.length <= CHOICES);

  const full = buildChoices(target, Array.from({ length: 20 }, (_, index) => card(`x${index}`)));
  assert.equal(full.length, CHOICES);
  assert.ok(full.includes(target.back));
});

test('a swipe below the threshold is not a grade', () => {
  assert.equal(swipeVerdict({ dx: 10, width: 800 }), 0);
  assert.equal(swipeVerdict({ dx: -10, width: 800 }), 0);
  assert.equal(swipeVerdict({}), 0);
});

test('left is Again, right is Good, and nothing else has a gesture', () => {
  assert.equal(swipeVerdict({ dx: -200, width: 800 }), 1);
  assert.equal(swipeVerdict({ dx: 200, width: 800 }), 3);
  assert.equal(swipeVerdict({ dx: -SWIPE_THRESHOLD - 1, width: 0 }), 1);
});

test('a mostly vertical drag is a scroll, not a grade', () => {
  assert.equal(swipeVerdict({ dx: 200, dy: 400, width: 800 }), 0);
  assert.equal(swipeVerdict({ dx: 200, dy: 50, width: 800 }), 3);
});

test('the card flies the way the grade points', () => {
  assert.equal(flyDirection(1), -1);
  assert.equal(flyDirection(2), -1);
  assert.equal(flyDirection(3), 1);
  assert.equal(flyDirection(4), 1);
});

test('the tint follows the thumb and stays quiet near the middle', () => {
  assert.deepEqual(swipeTint(2), { tint: '', reach: 0 });
  assert.equal(swipeTint(-100).tint, 'again');
  assert.equal(swipeTint(100).tint, 'good');
  assert.equal(swipeTint(10_000).reach, 1, 'the tint never runs past full');
});

const KEYS = { lengths: 3, reasons: 4, choices: 4 };
const at = (state) => ({ started: true, ...KEYS, ...state });

test('before a session starts the keys pick a length or begin', () => {
  assert.deepEqual(studyAction('2', { started: false, lengths: 3 }), { act: 'pick-minutes', value: 2 });
  assert.deepEqual(studyAction('Enter', { started: false, lengths: 3 }), { act: 'start-planned' });
  assert.equal(studyAction('4', { started: false, lengths: 3 }), null, 'there are only three lengths');
  assert.equal(studyAction('d', { started: false, lengths: 3 }), null);
});

test('undo is only offered while the toast is still up', () => {
  assert.deepEqual(studyAction('u', at({ mode: 'flashcards', canUndo: true })), { act: 'undo-junk' });
  assert.equal(studyAction('u', at({ mode: 'flashcards', canUndo: false })), null);
});

test('the junk panel swallows every other key until it is answered', () => {
  const junking = at({ mode: 'flashcards', junking: true, revealed: true });
  assert.deepEqual(studyAction('Escape', junking), { act: 'junk-cancel' });
  assert.deepEqual(studyAction('3', junking), { act: 'junk-reason', value: 3 });
  assert.deepEqual(studyAction('5', junking), { act: 'none' }, 'there is no fifth reason');
  assert.deepEqual(studyAction('d', junking), { act: 'none' }, 'and nothing else fires behind it');
});

test('escape leaves, and the summary has its own two keys', () => {
  assert.deepEqual(studyAction('Escape', at({ mode: 'flashcards' })), { act: 'quit' });
  assert.deepEqual(studyAction('r', at({ finished: true })), { act: 'more-minutes' });
  assert.deepEqual(studyAction('Enter', at({ finished: true })), { act: 'done' });
  assert.equal(studyAction('1', at({ finished: true })), null);
});

test('a first look is acknowledged, never graded', () => {
  const present = at({ mode: 'present' });
  assert.deepEqual(studyAction('Enter', present), { act: 'present-next' });
  assert.deepEqual(studyAction(' ', present), { act: 'present-next' });
  assert.equal(studyAction('3', present), null, 'a new card cannot be graded on sight');
  assert.equal(studyAction('d', present), null);
});

test('a typed exercise checks first and grades second', () => {
  assert.deepEqual(studyAction('Enter', at({ mode: 'type' })), { act: 'check' });
  assert.deepEqual(studyAction('Enter', at({ mode: 'type', result: true })), { act: 'grade-result' });
  assert.deepEqual(studyAction('Enter', at({ mode: 'cloze' })), { act: 'check' });
  assert.equal(studyAction('2', at({ mode: 'type' })), null, 'digits are part of the answer, not a grade');
});

test('the four-choice exercise picks, then moves on', () => {
  assert.deepEqual(studyAction('3', at({ mode: 'learn' })), { act: 'choose', value: 3 });
  assert.equal(studyAction('5', at({ mode: 'learn' })), null);
  assert.deepEqual(studyAction('Enter', at({ mode: 'learn', answered: true })), { act: 'grade-answer' });
  assert.equal(studyAction('2', at({ mode: 'learn', answered: true })), null, 'answered means answered');
});

test('a flashcard reveals before it can be graded or thrown away', () => {
  const hidden = at({ mode: 'flashcards' });
  assert.deepEqual(studyAction(' ', hidden), { act: 'reveal' });
  assert.equal(studyAction('3', hidden), null, 'no grading a card you have not looked at');
  assert.equal(studyAction('d', hidden), null);

  const shown = at({ mode: 'flashcards', revealed: true });
  assert.deepEqual(studyAction('1', shown), { act: 'grade', value: 1 });
  assert.deepEqual(studyAction('4', shown), { act: 'grade', value: 4 });
  assert.equal(studyAction('5', shown), null);
  assert.deepEqual(studyAction('d', shown), { act: 'junk-open' });
  assert.deepEqual(studyAction(' ', shown), { act: 'none' }, 'space is spent once the answer is up');
});

test('reverse behaves like a flashcard, and nothing else does', () => {
  assert.ok(REVEALING.has('flashcards') && REVEALING.has('reverse'));
  assert.ok(!REVEALING.has('learn') && !REVEALING.has('type') && !REVEALING.has('present'));
  assert.deepEqual(studyAction('3', at({ mode: 'reverse', revealed: true })), { act: 'grade', value: 3 });
});

test('speaking is offered on every card, whatever the exercise', () => {
  for (const mode of ['present', 'flashcards', 'reverse', 'learn', 'type', 'cloze']) {
    assert.deepEqual(studyAction('s', at({ mode })), { act: 'speak' }, mode);
  }
});

test('the same picker can offer the word instead of the meaning', () => {
  const card = { id: 'a', front: 'roll back', back: 'откатить', category: 'engineering', pos: 'verb' };
  const pool = [
    card,
    { id: 'b', front: 'ship it', back: 'выкатить', category: 'engineering', pos: 'verb' },
    { id: 'c', front: 'push back', back: 'возразить', category: 'engineering', pos: 'verb' },
    { id: 'd', front: 'the deadline', back: 'срок сдачи', category: 'process', pos: 'noun' },
    { id: 'e', front: 'roll back', back: 'откатить назад', category: 'process', pos: 'verb' },
  ];
  const choices = buildChoices(card, pool, (list) => list, frontOf);
  assert.equal(choices.length, CHOICES);
  assert.ok(choices.includes('roll back'), 'the answer is the word this time');
  assert.equal(new Set(choices).size, choices.length, 'the twin front never becomes a second right answer');
  for (const choice of choices) assert.ok(pool.some((entry) => entry.front === choice));
});
