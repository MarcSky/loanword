import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AGAIN_GAP,
  AGAIN_GAP_MAX,
  PASS_RATE_FLOOR,
  PASS_WINDOW,
  PRESENT_COST,
  PRODUCTION_STABILITY_DAYS,
  WARMUP_RETRIEVABILITY,
  clozeOf,
  coreSteps,
  exerciseFor,
  typable,
  followUp,
  holdNewCards,
  newFractionFor,
  passRate,
  planSession,
  productionMode,
  progressAt,
  requeue,
  shouldHoldNewCards,
  stepsFor,
  warmupFor,
} from './session.mjs';

const CATEGORIES = ['engineering', 'process', 'collaboration', 'phrasing', 'connectors', 'everyday'];

const seeded = (start = 1) => {
  let value = start;
  return () => {
    value = (value * 16807) % 2147483647;
    return value / 2147483647;
  };
};

const review = (index, overrides = {}) => ({
  id: `r${index}`,
  category: CATEGORIES[index % CATEGORIES.length],
  seen: true,
  stability: 3,
  retrievability: 0.5 + (index % 10) / 100,
  example: `an example with word${index} in it`,
  front: `word${index}`,
  hasDistractors: true,
  ...overrides,
});

const fresh = (index, overrides = {}) => ({
  id: `n${index}`,
  category: CATEGORIES[index % CATEGORIES.length],
  seen: false,
  stability: 0,
  retrievability: 0,
  front: `new${index}`,
  example: '',
  hasDistractors: true,
  ...overrides,
});

const many = (count, make) => Array.from({ length: count }, (_, index) => make(index));

test('the step budget matches the research formula for each length', () => {
  assert.equal(coreSteps(5), 26);
  assert.equal(coreSteps(10), 52);
  assert.equal(coreSteps(15), 77);
  assert.equal(warmupFor(5), 2);
  assert.equal(warmupFor(10), 3);
  assert.equal(warmupFor(15), 3);
  assert.equal(stepsFor(5), 28);
  assert.equal(newFractionFor(5), 0.2);
  assert.equal(newFractionFor(15), 0.3);
});

test('an unknown length falls back rather than dividing by nothing', () => {
  assert.equal(warmupFor(7), 3);
  assert.equal(newFractionFor(7), 0.25);
  assert.ok(coreSteps(7) > 0);
});

test('the warm-up takes the cards FSRS is most confident about', () => {
  const due = [
    review(0, { id: 'weak', retrievability: 0.4 }),
    review(1, { id: 'sure-a', retrievability: 0.98 }),
    review(2, { id: 'sure-b', retrievability: 0.95 }),
    review(3, { id: 'sure-c', retrievability: 0.93 }),
    review(4, { id: 'middling', retrievability: 0.7 }),
  ];
  const plan = planSession({ due, fresh: [], minutes: 10, random: seeded() });
  const warmup = plan.steps.filter((step) => step.warmup);
  assert.equal(warmup.length, 3);
  assert.deepEqual(warmup.map((step) => step.id), ['sure-a', 'sure-b', 'sure-c']);
  assert.ok(warmup.every((step) => due.find((card) => card.id === step.id).retrievability >= WARMUP_RETRIEVABILITY));
});

test('a five-minute session warms up with two cards, not three', () => {
  const due = many(20, (index) => review(index, { retrievability: 0.99 }));
  const plan = planSession({ due, fresh: [], minutes: 5, random: seeded() });
  assert.equal(plan.steps.filter((step) => step.warmup).length, 2);
});

test('nothing is marked warm-up when no card is confident enough', () => {
  const due = many(6, (index) => review(index, { retrievability: 0.3 }));
  const plan = planSession({ due, fresh: [], minutes: 10, random: seeded() });
  assert.equal(plan.steps.filter((step) => step.warmup).length, 0);
  assert.equal(plan.steps.length, 6, 'every due card is still asked');
});

test('after the warm-up the weakest cards come first', () => {
  const due = [
    review(0, { id: 'a', retrievability: 0.2 }),
    review(1, { id: 'b', retrievability: 0.6 }),
    review(2, { id: 'c', retrievability: 0.45 }),
  ];
  const plan = planSession({ due, fresh: [], minutes: 10, random: seeded() });
  assert.deepEqual(plan.steps.map((step) => step.id), ['a', 'c', 'b']);
});

test('no two consecutive steps share a domain while another domain is available', () => {
  const due = many(30, (index) => review(index));
  const newCards = many(10, (index) => fresh(index));
  const plan = planSession({ due, fresh: newCards, minutes: 15, random: seeded(7) });
  for (let index = 1; index < plan.steps.length; index++) {
    assert.notEqual(
      plan.steps[index].category,
      plan.steps[index - 1].category,
      `steps ${index - 1} and ${index} repeat ${plan.steps[index].category}`,
    );
  }
});

test('the domain rule holds across the seam between warm-up and the body', () => {
  const due = [
    review(0, { id: 'w1', category: 'engineering', retrievability: 0.99 }),
    review(1, { id: 'w2', category: 'engineering', retrievability: 0.98 }),
    review(2, { id: 'w3', category: 'process', retrievability: 0.97 }),
    review(3, { id: 'b1', category: 'engineering', retrievability: 0.5 }),
    review(4, { id: 'b2', category: 'phrasing', retrievability: 0.4 }),
    review(5, { id: 'b3', category: 'process', retrievability: 0.3 }),
  ];
  const plan = planSession({ due, fresh: [], minutes: 10, random: seeded() });
  for (let index = 1; index < plan.steps.length; index++) {
    assert.notEqual(plan.steps[index].category, plan.steps[index - 1].category, `at step ${index}`);
  }
  assert.equal(plan.steps.filter((step) => step.warmup).length, 3);
});

test('a small pool from few domains still never repeats one back to back', () => {
  const due = [
    review(0, { id: 'a', category: 'engineering', retrievability: 0.95 }),
    review(1, { id: 'b', category: 'engineering', retrievability: 0.94 }),
    review(2, { id: 'c', category: 'process', retrievability: 0.93 }),
    review(3, { id: 'd', category: 'process', retrievability: 0.2 }),
    review(4, { id: 'e', category: 'phrasing', retrievability: 0.1 }),
  ];
  const plan = planSession({ due, fresh: [], minutes: 15, random: seeded(5) });
  for (let index = 1; index < plan.steps.length; index++) {
    assert.notEqual(plan.steps[index].category, plan.steps[index - 1].category, `at step ${index}`);
  }
});

test('no two new cards land next to each other', () => {
  const plan = planSession({
    due: many(30, (index) => review(index)),
    fresh: many(9, (index) => fresh(index)),
    minutes: 15,
    random: seeded(3),
  });
  for (let index = 1; index < plan.steps.length; index++) {
    assert.equal(plan.steps[index].seen || plan.steps[index - 1].seen, true, `two new cards adjacent at ${index}`);
  }
});

test('new material is spread through rather than blocked at the front', () => {
  const plan = planSession({
    due: many(40, (index) => review(index)),
    fresh: many(12, (index) => fresh(index)),
    minutes: 15,
    random: seeded(11),
  });
  const positions = plan.steps.map((step, index) => (step.seen ? null : index)).filter((value) => value !== null);
  assert.ok(positions.length > 4);
  assert.ok(positions.at(-1) > plan.steps.length / 2, 'the last new card is in the second half');
  assert.ok(positions[0] > 0, 'and the first is not the opening step');
});

test('the new-card share follows the session length', () => {
  const due = many(90, (index) => review(index));
  const newCards = many(40, (index) => fresh(index));
  const short = planSession({ due, fresh: newCards, minutes: 5, random: seeded() });
  const long = planSession({ due, fresh: newCards, minutes: 15, random: seeded() });
  assert.equal(short.counts.new, Math.floor((coreSteps(5) * 0.2) / PRESENT_COST));
  assert.equal(long.counts.new, Math.floor((coreSteps(15) * 0.3) / PRESENT_COST));
  assert.ok(long.counts.new > short.counts.new);
});

test('the daily limit caps new cards even when the session has room', () => {
  const plan = planSession({
    due: many(60, (index) => review(index)),
    fresh: many(40, (index) => fresh(index)),
    minutes: 15,
    newLimit: 3,
    random: seeded(),
  });
  assert.equal(plan.counts.new, 3);
});

test('a limit of zero means a review-only session', () => {
  const plan = planSession({
    due: many(20, (index) => review(index)),
    fresh: many(10, (index) => fresh(index)),
    minutes: 10,
    newLimit: 0,
    random: seeded(),
  });
  assert.equal(plan.counts.new, 0);
  assert.ok(plan.counts.reviews > 0);
});

test('a session never exceeds its budget', () => {
  const plan = planSession({
    due: many(400, (index) => review(index)),
    fresh: many(200, (index) => fresh(index)),
    minutes: 5,
    random: seeded(),
  });
  assert.ok(plan.steps.length <= plan.budget, `${plan.steps.length} steps against a budget of ${plan.budget}`);
});

test('a short pool produces a short session rather than a padded one', () => {
  const plan = planSession({ due: many(3, (index) => review(index)), fresh: [], minutes: 15, random: seeded() });
  assert.equal(plan.steps.length, 3);
  assert.equal(plan.counts.total, 3);
});

test('an empty pool is an empty plan, not a crash', () => {
  const plan = planSession({ due: [], fresh: [], minutes: 10 });
  assert.deepEqual(plan.steps, []);
  assert.equal(plan.counts.total, 0);
  assert.deepEqual(plan.domains, []);
});

test('every step names a card that was handed in', () => {
  const due = many(12, (index) => review(index));
  const newCards = many(4, (index) => fresh(index));
  const plan = planSession({ due, fresh: newCards, minutes: 10, random: seeded() });
  const known = new Set([...due, ...newCards].map((card) => card.id));
  assert.ok(plan.steps.every((step) => known.has(step.id)));
  assert.equal(new Set(plan.steps.map((step) => step.id)).size, plan.steps.length, 'and never twice');
});

test('a new card is shown before it is ever graded', () => {
  assert.equal(exerciseFor(fresh(0)), 'present');
  assert.equal(exerciseFor(fresh(0, { hasDistractors: false })), 'present', 'a small deck changes nothing');
  assert.equal(exerciseFor(fresh(0), { exercises: ['flashcards'] }), 'present', 'it is not an exercise to switch off');
});

test('a letter card is only ever recognised or typed', () => {
  assert.equal(exerciseFor({ type: 'letter', seen: true, stability: 40, reps: 9 }), 'flashcards');
  assert.equal(exerciseFor({ type: 'letter', seen: true, stability: 40 }, { exercises: ['type'] }), 'type');
  assert.equal(exerciseFor({ type: 'letter', seen: false }), 'flashcards', 'letters skip the present step');
});

test('a settling card is asked by cloze when the example allows it', () => {
  assert.equal(exerciseFor(review(0, { stability: 3 })), 'cloze');
  assert.equal(
    exerciseFor(review(0, { stability: 3, example: 'nothing matching here' })),
    'flashcards',
    'a cloze with nothing to fill in is not asked',
  );
});

test('a card that holds is asked for production, alternating direction', () => {
  const even = exerciseFor(review(0, { stability: 40, reps: 4 }));
  const odd = exerciseFor(review(0, { stability: 40, reps: 5 }));
  assert.notEqual(even, odd, 'the direction flips on review count, not on chance');
  assert.deepEqual([even, odd].sort(), ['reverse', 'type']);
  assert.ok(['type', 'reverse'].includes(exerciseFor(review(0, { stability: PRODUCTION_STABILITY_DAYS }))));
});

test('production falls back through the exercises that are still on', () => {
  assert.equal(productionMode(['flashcards', 'learn', 'cloze', 'type', 'reverse']), 'type');
  assert.equal(productionMode(['flashcards', 'reverse']), 'reverse');
  assert.equal(productionMode(['flashcards']), 'flashcards');
  assert.equal(productionMode([]), 'type', 'an empty list means nothing was narrowed');
});

test('the typed follow-up lands three to five steps after the first look', () => {
  const queue = Array.from({ length: 20 }, (_, index) => ({ id: `q${index}`, mode: 'flashcards', seen: true }));
  const step = { id: 'new1', mode: 'present', seen: false, category: 'everyday' };
  for (const roll of [0, 0.5, 0.999]) {
    const next = followUp(queue, 3, step, 'type', () => roll);
    const at = next.findIndex((entry) => entry.id === 'new1');
    assert.ok(at - 4 >= 3 && at - 4 <= 5, `landed ${at - 4} steps later`);
    assert.equal(next[at].mode, 'type');
    assert.equal(next[at].presented, true);
    assert.equal(next.length, queue.length + 1);
  }
});

test('the flow channel drops half of the new cards still to come', () => {
  const queue = [
    { id: 'a', mode: 'flashcards', seen: true },
    { id: 'b', mode: 'present', seen: false },
    { id: 'c', mode: 'present', seen: false },
    { id: 'd', mode: 'type', seen: false },
    { id: 'e', mode: 'present', seen: false },
    { id: 'f', mode: 'cloze', seen: true },
    { id: 'g', mode: 'present', seen: false },
  ];
  const held = holdNewCards(queue, 0);
  const ids = held.map((step) => step.id);
  assert.deepEqual(ids, ['a', 'c', 'd', 'f', 'g'], 'order is preserved and every second new card survives');
  assert.equal(holdNewCards(held, 0).length, 4, 'running it again would keep cutting — the session runs it once');
  assert.deepEqual(
    holdNewCards(queue, 5).map((step) => step.id),
    ['a', 'b', 'c', 'd', 'e', 'f'],
    'nothing before the cursor moves, and the one new card still to come is held',
  );
});

test('the progress bar credits the warm-up once it is passed', () => {
  assert.equal(progressAt({ index: 0, total: 10 }), 0);
  assert.equal(progressAt({ index: 3, total: 10 }), 0.3, 'three warm-up cards read as three tenths done');
  assert.equal(progressAt({ index: 12, total: 10, planned: 10 }), 1, 'a requeued card never pushes it past full');
  assert.equal(progressAt({ index: 5, total: 12, planned: 10 }), 5 / 12);
});

test('a disabled exercise is never chosen', () => {
  assert.equal(exerciseFor(review(0, { stability: 3 }), { exercises: ['flashcards', 'learn'] }), 'flashcards');
  assert.equal(exerciseFor(review(0, { stability: 40 }), { exercises: ['reverse'] }), 'reverse');
  assert.equal(exerciseFor(review(0, { stability: 40 }), { exercises: ['cloze'] }), 'flashcards', 'the last resort');
});

test('cloze blanks the phrase and nothing else', () => {
  const gap = clozeOf({ front: 'roll back', example: 'We roll back the migration tonight.' });
  assert.equal(gap.answer, 'roll back');
  assert.equal(gap.text, 'We … the migration tonight.');
  assert.equal(gap.text.includes('roll back'), false);
});

test('cloze matches case-insensitively but keeps what was written', () => {
  const gap = clozeOf({ front: 'roll back', example: 'Roll back the migration.' });
  assert.equal(gap.answer, 'Roll back');
  assert.equal(gap.text, '… the migration.');
});

test('cloze refuses a word that is not in the example', () => {
  assert.equal(clozeOf({ front: 'rebase', example: 'We roll back the migration.' }), null);
  assert.equal(clozeOf({ front: 'roll back', example: '' }), null);
  assert.equal(clozeOf({ front: '', example: 'anything' }), null);
  assert.equal(clozeOf({ front: 'a', example: 'a word' }), null, 'a single letter is not an exercise');
});

test('cloze does not match a word inside another word', () => {
  assert.equal(clozeOf({ front: 'back', example: 'The backend is down.' }), null);
  assert.ok(clozeOf({ front: 'back', example: 'Roll back now.' }));
});

test('cloze survives a phrase with regex characters in it', () => {
  const gap = clozeOf({ front: 'a (small) fix', example: 'It was a (small) fix, nothing more.' });
  assert.equal(gap.answer, 'a (small) fix');
});

test('a failed card comes back later in the same session, never next', () => {
  const queue = many(12, (index) => ({ id: `s${index}` }));
  const next = requeue(queue, 2, queue[2], () => 0);
  assert.equal(next.length, 13);
  const positions = next.map((step, index) => (step.id === 's2' ? index : null)).filter((value) => value !== null);
  assert.deepEqual(positions, [2, 2 + 1 + AGAIN_GAP]);
  assert.equal(next[3].id, 's3', 'the very next step is somebody else');
  assert.equal(next[positions[1]].repeat, true);
});

test('the requeue gap stays inside the researched window', () => {
  const queue = many(20, (index) => ({ id: `s${index}` }));
  for (const roll of [0, 0.5, 0.999]) {
    const next = requeue(queue, 0, queue[0], () => roll);
    const second = next.findIndex((step, index) => index > 0 && step.id === 's0');
    assert.ok(second >= 1 + AGAIN_GAP && second <= 1 + AGAIN_GAP_MAX, `gap landed at ${second}`);
  }
});

test('a repeat near the end of the queue lands at the end, not past it', () => {
  const queue = many(4, (index) => ({ id: `s${index}` }));
  const next = requeue(queue, 3, queue[3], () => 0.999);
  assert.equal(next.length, 5);
  assert.equal(next.at(-1).id, 's3');
});

test('the pass rate reads the last twenty answers only', () => {
  assert.equal(passRate([]), 1, 'nothing answered yet is not a failing session');
  assert.equal(passRate([3, 3, 3, 3]), 1);
  assert.equal(passRate([1, 1, 3, 3]), 0.5);
  const window = [...Array(PASS_WINDOW).fill(1), ...Array(PASS_WINDOW).fill(4)];
  assert.equal(passRate(window), 1, 'the older half has scrolled out');
});

test('new cards are held back only once the window is full and the rate has dropped', () => {
  assert.equal(shouldHoldNewCards([1, 1, 1]), false, 'three bad answers is not yet a signal');
  const struggling = Array.from({ length: PASS_WINDOW }, (_, index) => (index % 4 === 0 ? 3 : 1));
  assert.ok(passRate(struggling) < PASS_RATE_FLOOR);
  assert.equal(shouldHoldNewCards(struggling), true);
  assert.equal(shouldHoldNewCards(Array(PASS_WINDOW).fill(3)), false);
});

test('typing is asked only for short fronts; a long phrase is recalled, never spelled out', () => {
  assert.equal(typable('restore'), true);
  assert.equal(typable('roll back a migration'), true);
  assert.equal(typable('off the top of my head'), false);
  assert.equal(typable('previous plugin can not restore'), false);
  assert.equal(typable(''), false);
  const seen = { seen: true, stability: 400, reps: 1, hasDistractors: true, example: '' };
  assert.equal(exerciseFor({ ...seen, front: 'restore' }), 'type');
  assert.notEqual(exerciseFor({ ...seen, front: 'you do not have to restore the old plugin' }), 'type');
});
