export const CHAPTER_SIZE = 40;

export const titleOf = (topic) => {
  const text = String(topic ?? '');
  return text ? text[0].toLocaleUpperCase() + text.slice(1) : '';
};

export function summarize(cards) {
  const total = cards.length;
  const seen = cards.filter((card) => !card.isNew);
  return {
    total,
    seen: seen.length,
    due: cards.filter((card) => card.isDue).length,
    learned: cards.filter((card) => card.mastery >= 1).length,
    mastery: total ? cards.reduce((sum, card) => sum + card.mastery, 0) / total : 0,
  };
}

const byCreated = (a, b) =>
  String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.id || '').localeCompare(String(b.id || ''));

export const chapterKey = ({ category = '', topic = '' } = {}) => `${category}|${topic}`;

export function chapterOf(key) {
  const text = String(key ?? '');
  const at = text.indexOf('|');
  return at < 0 ? null : { category: text.slice(0, at), topic: text.slice(at + 1) };
}

export function inChapter(key) {
  const chapter = chapterOf(key);
  if (!chapter) return () => false;
  return (card) => (card.category || '') === chapter.category && (card.topic || '') === chapter.topic;
}

const byWeight = (one, other) =>
  (one.topic === '') - (other.topic === '') || other.n - one.n || one.topic.localeCompare(other.topic);

export function topicsIn(cards) {
  const counts = new Map();
  for (const card of cards) {
    const topic = card.topic || '';
    counts.set(topic, (counts.get(topic) || 0) + 1);
  }
  return [...counts].map(([topic, n]) => ({ topic, n })).sort(byWeight);
}

export function namedChapters(cards, order = []) {
  const rank = new Map(order.map((key, index) => [key, index]));
  const found = new Map();
  for (const card of cards) {
    const category = card.category || '';
    const topic = card.topic || '';
    const key = `${category}\u0000${topic}`;
    const entry = found.get(key) || { category, topic, n: 0 };
    entry.n += 1;
    found.set(key, entry);
  }
  return [...found.values()].sort(
    (one, other) => (rank.get(one.category) ?? Infinity) - (rank.get(other.category) ?? Infinity) || byWeight(one, other),
  );
}

export function chaptersOf(cards, { size = CHAPTER_SIZE, order = [] } = {}) {
  const groups = new Map();
  for (const card of cards) {
    const key = card.category || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(card);
  }
  const rank = new Map(order.map((key, index) => [key, index]));
  const categories = [...groups.keys()].sort((a, b) => {
    const [x, y] = [rank.get(a), rank.get(b)];
    if (x !== undefined || y !== undefined) return (x ?? Infinity) - (y ?? Infinity);
    return a.localeCompare(b);
  });

  const chapters = [];
  for (const category of categories) {
    const owned = groups.get(category);
    for (const { topic } of topicsIn(owned)) {
      const sorted = owned.filter((card) => (card.topic || '') === topic).sort(byCreated);
      const parts = Math.max(1, Math.ceil(sorted.length / size));
      for (let part = 1; part <= parts; part++) {
        const slice = sorted.slice((part - 1) * size, part * size);
        chapters.push({ category, topic, part, parts, cards: slice, ...summarize(slice) });
      }
    }
  }
  return chapters;
}
