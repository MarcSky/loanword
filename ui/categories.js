export const TINTS = ['sky', 'peach', 'rose', 'lavender', 'butter', 'mint'];

export const CORE = ['phrasing', 'connectors', 'everyday'];

const CATALOGUE = [
  ['engineering', 'Engineering', 'terminal-window', 'Code, systems, debugging, review'],
  ['process', 'Process', 'flow-arrow', 'Plans, estimates, releases, specs'],
  ['collaboration', 'Collaboration', 'users-three', 'Meetings, feedback, asking, disagreeing'],
  ['phrasing', 'Phrasing', 'quotes', 'Set phrases and idioms that resist translation'],
  ['connectors', 'Connectors', 'git-branch', 'However, in terms of, that said, provided that'],
  ['everyday', 'Everyday', 'coffee', 'General vocabulary and everything unplaced'],
  ['devops', 'DevOps', 'package'],
  ['data', 'Data', 'database'],
  ['security', 'Security', 'shield-check'],
  ['testing', 'Testing', 'bug'],
  ['frontend', 'Frontend', 'code'],
  ['product', 'Product', 'presentation-chart'],
  ['design', 'Design', 'palette'],
  ['typography', 'Typography', 'text-aa'],
  ['photography', 'Photography', 'camera'],
  ['video', 'Video', 'video-camera'],
  ['art', 'Art', 'paint-brush'],
  ['marketing', 'Marketing', 'megaphone'],
  ['seo', 'SEO', 'magnifying-glass-plus'],
  ['content', 'Content', 'book-open'],
  ['social', 'Social media', 'users-four'],
  ['advertising', 'Advertising', 'microphone-stage'],
  ['analytics', 'Analytics', 'chart-line'],
  ['business', 'Business', 'briefcase'],
  ['sales', 'Sales', 'currency-dollar'],
  ['finance', 'Finance', 'scales'],
  ['negotiation', 'Negotiation', 'handshake'],
  ['startup', 'Startup', 'rocket-launch'],
  ['hr', 'People and hiring', 'users'],
  ['legal', 'Legal', 'gavel'],
  ['politics', 'Politics', 'globe'],
  ['news', 'News', 'newspaper'],
  ['science', 'Science', 'flask'],
  ['math', 'Mathematics', 'math-operations'],
  ['research', 'Research', 'test-tube'],
  ['education', 'Education', 'graduation-cap'],
  ['history', 'History', 'clock-counter-clockwise'],
  ['nature', 'Nature', 'tree'],
  ['environment', 'Environment', 'leaf'],
  ['health', 'Health', 'heartbeat'],
  ['medicine', 'Medicine', 'first-aid-kit'],
  ['fitness', 'Fitness', 'barbell'],
  ['sport', 'Sport', 'person-simple-run'],
  ['mindfulness', 'Mindfulness', 'brain'],
  ['food', 'Food', 'fork-knife'],
  ['cooking', 'Cooking', 'cooking-pot'],
  ['travel', 'Travel', 'airplane-tilt'],
  ['transport', 'Transport', 'car'],
  ['housing', 'Housing', 'house-line'],
  ['shopping', 'Shopping', 'shopping-cart'],
  ['clothing', 'Clothing', 't-shirt'],
  ['weather', 'Weather', 'cloud-sun'],
  ['family', 'Family', 'house'],
  ['pets', 'Pets', 'dog'],
  ['music', 'Music', 'music-notes'],
  ['cinema', 'Cinema', 'film-slate'],
  ['books', 'Books', 'books'],
  ['gaming', 'Gaming', 'game-controller'],
  ['religion', 'Religion', 'church'],
];

export const CATEGORY = Object.fromEntries(
  CATALOGUE.map(([key, label, icon, blurb], index) => [
    key,
    { label, icon, tint: TINTS[index % TINTS.length], blurb: blurb || '' },
  ]),
);

export const ALL_CATEGORIES = CATALOGUE.map(([key]) => key);

export const DEFAULT_CATEGORIES = ['engineering', 'process', 'collaboration', ...CORE];

export const FIELDS = [
  ['it', 'Software', ['engineering', 'process', 'devops', 'data', 'security', 'testing']],
  ['product', 'Product', ['product', 'design', 'process', 'analytics', 'collaboration']],
  ['marketing', 'Marketing', ['marketing', 'seo', 'content', 'social', 'advertising', 'analytics']],
  ['business', 'Business', ['business', 'sales', 'finance', 'negotiation', 'hr', 'legal']],
  ['design', 'Design', ['design', 'typography', 'photography', 'video', 'art']],
  ['science', 'Science', ['science', 'math', 'research', 'education', 'nature']],
  ['health', 'Health', ['health', 'medicine', 'fitness', 'sport', 'mindfulness']],
  ['hospitality', 'Food and travel', ['food', 'cooking', 'travel', 'transport', 'shopping']],
  ['media', 'Media', ['music', 'cinema', 'books', 'gaming', 'news']],
  ['life', 'Everyday life', ['food', 'travel', 'housing', 'family', 'weather', 'shopping']],
];

export const knownCategory = (key) => ALL_CATEGORIES.includes(key);

const FIELD_KEYS = FIELDS.map(([key]) => key);

export const knownField = (key) => key === 'custom' || FIELD_KEYS.includes(key);

export function categoriesOf(chosen) {
  const wanted = Array.isArray(chosen) ? chosen.filter(knownCategory) : [];
  const keys = new Set([...(wanted.length ? wanted : DEFAULT_CATEGORIES), ...CORE]);
  return ALL_CATEGORIES.filter((key) => keys.has(key));
}

export function groupByCategory(cards) {
  const buckets = new Map();
  for (const card of cards) {
    const bucket = buckets.get(card.category);
    if (bucket) bucket.push(card);
    else buckets.set(card.category, [card]);
  }
  return buckets;
}

export function categoriesForField(key) {
  const found = FIELDS.find(([code]) => code === key);
  return found ? categoriesOf(found[2]) : categoriesOf([]);
}
