export const AGAIN_GAP = 3;
export const AGAIN_GAP_MAX = 5;

const PRESENT_GAP = 3;
const PRESENT_GAP_MAX = 5;

export const PASS_RATE_FLOOR = 0.8;
export const PASS_WINDOW = 20;

export function shuffle(list, random = Math.random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const insertAfter = (queue, index, step, low, high, random) => {
  const gap = low + Math.floor(random() * (high - low + 1));
  const next = [...queue];
  next.splice(Math.min(queue.length, index + 1 + gap), 0, step);
  return next;
};

export const requeue = (queue, index, step, random = Math.random) =>
  insertAfter(queue, index, { ...step, repeat: true, warmup: false }, AGAIN_GAP, AGAIN_GAP_MAX, random);

export const followUp = (queue, index, step, mode, random = Math.random) =>
  insertAfter(
    queue,
    index,
    { ...step, mode, warmup: false, presented: true },
    PRESENT_GAP,
    PRESENT_GAP_MAX,
    random,
  );

export function holdNewCards(queue, index = 0) {
  let count = 0;
  return queue.filter((step, at) => {
    if (at <= index) return true;
    if (step.seen || step.mode !== 'present') return true;
    count += 1;
    return count % 2 === 0;
  });
}

export function passRate(ratings) {
  const window = ratings.slice(-PASS_WINDOW);
  if (!window.length) return 1;
  return window.filter((rating) => rating >= 3).length / window.length;
}

export const shouldHoldNewCards = (ratings) =>
  ratings.length >= PASS_WINDOW && passRate(ratings) < PASS_RATE_FLOOR;

export const progressAt = ({ index = 0, total = 0, planned = 0 } = {}) =>
  Math.min(1, Math.max(0, index) / Math.max(1, total, planned));
