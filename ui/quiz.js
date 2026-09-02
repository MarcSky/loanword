export const CHOICES = 4;
export const SWIPE_THRESHOLD = 96;
export const SWIPE_SLOPE = 1;

const lower = (value) => String(value ?? '').toLowerCase().trim();

const firstWord = (value) => lower(value).split(/\s+/)[0] || '';

const wordCount = (value) => lower(value).split(/\s+/).filter(Boolean).length;

export function similarity(card, other) {
  let score = 0;
  const keywords = new Set([...(card.keywords || []), card.front].map(lower).filter(Boolean));
  if ([...(other.keywords || []), other.front].some((word) => keywords.has(lower(word)))) score += 4;
  if (card.pos && card.pos === other.pos) score += 3;
  if (firstWord(card.front) && firstWord(card.front) === firstWord(other.front)) score += 3;
  if (card.category && card.category === other.category) score += 2;
  if (card.cefr && card.cefr === other.cefr) score += 1;
  const gap = Math.abs(wordCount(card.back) - wordCount(other.back));
  score += gap === 0 ? 1 : gap === 1 ? 0.5 : 0;
  return score;
}

export function rankDistractors(card, pool) {
  const seen = new Set([lower(card.back)]);
  const unique = [];
  for (const other of pool) {
    if (!other || other.id === card.id) continue;
    const key = lower(other.back);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(other);
  }
  return unique
    .map((other, index) => ({ other, index, score: similarity(card, other) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.other);
}

export function buildChoices(card, pool, shuffle = (list) => list) {
  const ranked = rankDistractors(card, pool);
  const wanted = CHOICES - 1;
  const picks = shuffle(ranked.slice(0, wanted * 2)).slice(0, wanted);
  if (picks.length < wanted) {
    for (const other of ranked) {
      if (picks.length >= wanted) break;
      if (!picks.includes(other)) picks.push(other);
    }
  }
  return shuffle([card.back, ...picks.map((other) => other.back)]);
}

export function swipeVerdict({ dx = 0, dy = 0, width = 0, threshold = SWIPE_THRESHOLD } = {}) {
  const limit = width ? Math.max(48, Math.min(threshold, width * 0.3)) : threshold;
  if (Math.abs(dx) < limit) return 0;
  if (Math.abs(dy) > Math.abs(dx) * SWIPE_SLOPE) return 0;
  return dx < 0 ? 1 : 3;
}

export const flyDirection = (rating) => (Number(rating) <= 2 ? -1 : 1);

export const swipeTint = (dx, limit = SWIPE_THRESHOLD) => {
  const reach = Math.max(0, Math.min(1, Math.abs(dx) / limit));
  if (reach < 0.15) return { tint: '', reach: 0 };
  return { tint: dx < 0 ? 'again' : 'good', reach };
};

export const REVEALING = new Set(['flashcards', 'reverse']);

export function studyAction(key, state = {}) {
  const { started, finished, mode, revealed, answered, result, junking, choices = 0, reasons = 0, lengths = 0, canUndo } = state;
  const digit = Number(key);
  const letter = String(key).toLowerCase();

  if (!started) {
    if (digit >= 1 && digit <= lengths) return { act: 'pick-minutes', value: digit };
    return key === 'Enter' ? { act: 'start-planned' } : null;
  }

  if (letter === 'u' && canUndo) return { act: 'undo-junk' };

  if (junking) {
    if (key === 'Escape') return { act: 'junk-cancel' };
    if (digit >= 1 && digit <= reasons) return { act: 'junk-reason', value: digit };
    return { act: 'none' };
  }

  if (key === 'Escape') return { act: 'quit' };

  if (finished) {
    if (letter === 'r') return { act: 'more-minutes' };
    return key === 'Enter' ? { act: 'done' } : null;
  }

  if (letter === 's') return { act: 'speak' };

  if (mode === 'present') {
    return key === 'Enter' || key === ' ' ? { act: 'present-next' } : null;
  }

  if (mode === 'cloze' || mode === 'type') {
    if (key !== 'Enter') return null;
    return result ? { act: 'grade-result' } : { act: 'check' };
  }

  if (mode === 'learn') {
    if (answered) return key === 'Enter' || key === ' ' ? { act: 'grade-answer' } : null;
    return digit >= 1 && digit <= choices ? { act: 'choose', value: digit } : null;
  }

  if (!REVEALING.has(mode)) return null;
  if (key === ' ' || key === 'Enter') return revealed ? { act: 'none' } : { act: 'reveal' };
  if (!revealed) return null;
  if (digit >= 1 && digit <= 4) return { act: 'grade', value: digit };
  return letter === 'd' ? { act: 'junk-open' } : null;
}
