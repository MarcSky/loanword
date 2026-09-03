import { buildChoices, frontOf, backOf, rankDistractors } from './quiz.js';
import { shuffle } from './plan.js';

export const TYPES = ['tf', 'mc', 'match', 'written'];
export const ANSWER_WITH = ['term', 'definition', 'both'];
export const MATCH_SIZE = 4;
const DISTRACTOR_POOL = 400;
export const DEFAULT_COUNT = 20;

const NEAR_MISSES = 6;

const lower = (value) => String(value ?? '').toLowerCase().trim();

export const sideOf = (answerWith, random = Math.random) =>
  answerWith === 'both' ? (random() < 0.5 ? 'term' : 'definition') : answerWith === 'term' ? 'term' : 'definition';

export const facesOf = (card, side) =>
  side === 'term'
    ? { prompt: card.back, answer: card.front, promptSide: 'definition', answerSide: 'term' }
    : { prompt: card.front, answer: card.back, promptSide: 'term', answerSide: 'definition' };

export const answerOf = (side) => (side === 'term' ? frontOf : backOf);

export function splitAcross(items, buckets) {
  const out = buckets.map(() => []);
  items.forEach((item, index) => out[index % buckets.length].push(item));
  return out;
}

export function eligibleCards(cards) {
  return cards.filter((card) => !card.isKnown);
}

export function buildTest(cards, { count = DEFAULT_COUNT, answerWith = 'both', types = ['mc'], random = Math.random } = {}) {
  const asked = TYPES.filter((type) => types.includes(type));
  const deck = shuffle(cards, random);
  const pool = deck.slice(0, Math.max(0, Math.min(count, cards.length)));
  const nearby = deck.slice(0, Math.max(DISTRACTOR_POOL, pool.length));
  if (!asked.length || !pool.length) return [];
  const enabled = cards.length < 2 ? ['written'] : asked;

  const questions = [];
  const groups = splitAcross(pool, enabled);
  enabled.forEach((type, at) => {
    const chunk = groups[at];
    if (type === 'match') {
      for (let i = 0; i < chunk.length; i += MATCH_SIZE) {
        const block = chunk.slice(i, i + MATCH_SIZE);
        if (block.length < 2) {
          for (const card of block) questions.push(multipleChoice(card, nearby, answerWith, random));
          continue;
        }
        const side = sideOf(answerWith, random);
        const items = block.map((card) => ({ id: card.id, ...facesOf(card, side) }));
        questions.push({ kind: 'match', side, items, options: shuffle(items.map((item) => item.answer), random) });
      }
      return;
    }
    for (const card of chunk) {
      if (type === 'tf') questions.push(trueFalse(card, nearby, answerWith, random));
      else if (type === 'mc') questions.push(multipleChoice(card, nearby, answerWith, random));
      else {
        const side = sideOf(answerWith, random);
        questions.push({ kind: 'written', id: card.id, ...facesOf(card, side) });
      }
    }
  });
  return questions.map((question, n) => ({ ...question, n }));
}

function trueFalse(card, cards, answerWith, random) {
  const side = sideOf(answerWith, random);
  const faces = facesOf(card, side);
  const answer = answerOf(faces.answerSide);
  const near = shuffle(rankDistractors(card, cards, answer).slice(0, NEAR_MISSES), random).map(answer);
  const truth = !near.length || random() < 0.5;
  return { kind: 'tf', id: card.id, ...faces, shown: truth ? faces.answer : near[0], truth };
}

function multipleChoice(card, cards, answerWith, random) {
  const side = sideOf(answerWith, random);
  const faces = facesOf(card, side);
  const choices = buildChoices(card, cards, (list) => shuffle(list, random), answerOf(faces.answerSide));
  return { kind: 'mc', id: card.id, ...faces, choices };
}

export const pointsOf = (question) => (question.kind === 'match' ? question.items.length : 1);

export function isAnswered(question, answer) {
  if (answer === undefined || answer === null) return false;
  if (question.kind === 'match') return question.items.every((item) => answer[item.id]);
  if (question.kind === 'written') return String(answer).trim().length > 0;
  return true;
}

const sameText = (a, b) => lower(a) === lower(b);

function scoreQuestion(question, answer, check = sameText) {
  const points = pointsOf(question);
  if (question.skipped || !isAnswered(question, answer)) return { points, earned: 0, skipped: true };
  let earned = 0;
  if (question.kind === 'tf') earned = answer === question.truth ? 1 : 0;
  else if (question.kind === 'mc') earned = sameText(answer, question.answer) ? 1 : 0;
  else if (question.kind === 'written') earned = check(answer, question.answer) ? 1 : 0;
  else earned = question.items.filter((item) => sameText(answer[item.id], item.answer)).length;
  return { points, earned, skipped: false };
}

export function scoreTest(questions, answers, check = sameText) {
  const results = questions.map((question) => scoreQuestion(question, answers[question.n], check));
  const total = results.reduce((sum, row) => sum + row.points, 0);
  const earned = results.reduce((sum, row) => sum + row.earned, 0);
  return { total, earned, accuracy: total ? earned / total : 0, results };
}

export function sortCounts(verdicts) {
  const values = Object.values(verdicts);
  return { known: values.filter(Boolean).length, learning: values.filter((value) => value === false).length };
}
