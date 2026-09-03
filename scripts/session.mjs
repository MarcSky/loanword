export * from '../ui/plan.js';

import { shuffle } from '../ui/plan.js';

export const PRESENT_COST = 2;

const WARMUP = { 5: 2, 10: 3, 15: 3 };

export const WARMUP_RETRIEVABILITY = 0.9;

const NEW_FRACTION = { 5: 0.2, 10: 0.25, 15: 0.3 };

const SECONDS_PER_REVIEW = 10;
const SECONDS_PER_NEW = 15;
const OVERHEAD_SECONDS = 10;

export const PRODUCTION_STABILITY_DAYS = 7;


export const MODES = ['flashcards', 'learn', 'cloze', 'type', 'reverse'];
const LETTER_MODES = ['flashcards', 'type'];

export const warmupFor = (minutes) => WARMUP[minutes] ?? 3;
export const newFractionFor = (minutes) => NEW_FRACTION[minutes] ?? 0.25;

export function coreSteps(minutes, share = newFractionFor(minutes)) {
  const perStep = SECONDS_PER_REVIEW * (1 - share) + SECONDS_PER_NEW * share;
  return Math.max(1, Math.floor((minutes * 60 - OVERHEAD_SECONDS) / perStep));
}

const has = (list, mode) => !list || !list.length || list.includes(mode);

export function productionMode(exercises = MODES) {
  for (const mode of ['type', 'reverse', 'flashcards']) if (has(exercises, mode)) return mode;
  return 'flashcards';
}

const TYPABLE_WORDS = 4;
const TYPABLE_CHARS = 24;

export const typable = (front) => {
  const text = String(front || '').trim();
  return text.length > 0 && text.length <= TYPABLE_CHARS && text.split(/\s+/).length <= TYPABLE_WORDS;
};

export function exerciseFor(card, { exercises = MODES, fallback = 'flashcards' } = {}) {
  if (card.type === 'letter') {
    for (const mode of LETTER_MODES) if (has(exercises, mode)) return mode;
    return 'flashcards';
  }

  if (!card.seen) return 'present';

  const stability = Number(card.stability) || 0;
  const reps = Number(card.reps) || 0;
  const wanted =
    stability < PRODUCTION_STABILITY_DAYS
      ? ['cloze', 'flashcards', 'learn']
      : reps % 2 === 0
        ? ['reverse', 'type', 'flashcards']
        : ['type', 'reverse', 'flashcards'];

  for (const mode of wanted) {
    if (!has(exercises, mode)) continue;
    if (mode === 'cloze' && !clozeOf(card)) continue;
    if (mode === 'learn' && !card.hasDistractors) continue;
    if (mode === 'type' && !typable(card.front)) continue;
    return mode;
  }
  return has(exercises, fallback) ? fallback : 'flashcards';
}

export function clozeOf(card) {
  const example = String(card.example || '').trim();
  const answer = String(card.front || '').trim();
  if (!example || !answer || answer.length < 2) return null;
  const escaped = answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])(${escaped})(?=[^\\p{L}\\p{N}]|$)`, 'iu');
  const match = example.match(pattern);
  if (!match) return null;
  const at = match.index + match[1].length;
  return {
    text: example.replace(pattern, (_, before) => `${before}…`),
    before: example.slice(0, at),
    after: example.slice(at + match[2].length),
    answer: match[2],
    example,
  };
}

function weave(reviews, fresh, seed = null) {
  const out = [];
  const pool = [...reviews];
  const queue = [...fresh];
  const gap = queue.length ? Math.max(1, Math.floor((pool.length + queue.length) / (queue.length + 1))) : Infinity;

  let previous = seed;
  let sinceNew = 0;
  while (pool.length || queue.length) {
    const wantNew = queue.length > 0 && (sinceNew >= gap || pool.length === 0);
    const primary = wantNew ? queue : pool;
    const secondary = wantNew ? pool : queue;
    const last = previous;

    let source = primary;
    let index = 0;
    if (last) {
      const different = primary.findIndex((card) => card.category !== last.category);
      if (different >= 0) {
        index = different;
      } else {
        const swap = secondary.findIndex((card) => card.category !== last.category);
        if (swap >= 0) {
          source = secondary;
          index = swap;
        }
      }
    }

    const [card] = source.splice(index, 1);
    out.push(card);
    previous = card;
    sinceNew = source === queue ? 0 : sinceNew + 1;
  }
  return out;
}

function spread(cards) {
  const pool = [...cards];
  const out = [];
  while (pool.length) {
    const last = out[out.length - 1];
    const index = last ? Math.max(0, pool.findIndex((card) => card.category !== last.category)) : 0;
    out.push(...pool.splice(index, 1));
  }
  return out;
}

export function planSession({
  due = [],
  fresh = [],
  minutes = 10,
  newLimit = Infinity,
  exercises = MODES,
  random = Math.random,
} = {}) {
  const warmupWanted = warmupFor(minutes);
  const core = coreSteps(minutes);

  const confident = due
    .filter((card) => (Number(card.retrievability) || 0) >= WARMUP_RETRIEVABILITY)
    .sort((a, b) => b.retrievability - a.retrievability);
  const warmup = spread(confident.slice(0, Math.min(warmupWanted, Math.max(0, due.length - 1))));
  const warmupIds = new Set(warmup.map((card) => card.id));

  const reviews = due
    .filter((card) => !warmupIds.has(card.id))
    .sort((a, b) => (Number(a.retrievability) || 0) - (Number(b.retrievability) || 0));

  const share = newFractionFor(minutes);
  const newWanted = Math.min(Math.floor((core * share) / PRESENT_COST), newLimit, fresh.length);
  const newCards = shuffle(fresh, random).slice(0, Math.max(0, newWanted));

  const room = Math.max(0, core - newCards.length * PRESENT_COST);
  const body = weave(spread(reviews.slice(0, room)), newCards, warmup[warmup.length - 1] || null);

  const ordered = [...warmup, ...body];
  const steps = ordered.map((card, index) => ({
    id: card.id,
    category: card.category,
    seen: !!card.seen,
    warmup: index < warmup.length,
    mode: exerciseFor(card, { exercises }),
  }));

  return {
    minutes,
    budget: warmupWanted + core,
    steps,
    production: productionMode(exercises),
    counts: {
      total: steps.length,
      reviews: steps.filter((step) => step.seen).length,
      new: steps.filter((step) => !step.seen).length,
      presented: steps.filter((step) => step.mode === 'present').length,
      warmup: warmup.length,
    },
    domains: [...new Set(steps.map((step) => step.category))],
  };
}

