import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTER_SIZE, chaptersOf, summarize, topicsIn } from './chapters.mjs';

const card = (index, overrides = {}) => ({
  id: String(index).padStart(10, '0'),
  category: 'engineering',
  topic: 'code review',
  created_at: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
  isNew: index % 2 === 0,
  isDue: index % 3 === 0,
  mastery: index % 5 === 0 ? 1 : 0.2,
  ...overrides,
});

test('a topic of ninety-five cards is three chapters of forty, forty and fifteen', () => {
  const cards = Array.from({ length: 95 }, (_, index) => card(index));
  const chapters = chaptersOf(cards);
  assert.equal(CHAPTER_SIZE, 40);
  assert.deepEqual(chapters.map((chapter) => [chapter.part, chapter.parts, chapter.cards.length]), [
    [1, 3, 40],
    [2, 3, 40],
    [3, 3, 15],
  ]);
  assert.equal(chapters[0].cards[0].id, card(0).id, 'the oldest card opens the first chapter');
  assert.equal(chapters[2].total, 15);
  assert.equal(chapters[2].seen, 15 - chapters[2].cards.filter((entry) => entry.isNew).length);
  assert.equal(typeof chapters[0].mastery, 'number');
});

test('a card appended later lands in the last part without renumbering the earlier ones', () => {
  const cards = Array.from({ length: 41 }, (_, index) => card(index));
  const before = chaptersOf(cards);
  const after = chaptersOf([...cards, card(41)]);
  assert.deepEqual(
    before[0].cards.map((entry) => entry.id),
    after[0].cards.map((entry) => entry.id),
    'the first chapter is stable',
  );
  assert.equal(after[1].cards.length, 2);
  assert.equal(after[1].cards.at(-1).id, card(41).id);
});

test('categories follow the order given, topics follow their size, and the unsorted go last', () => {
  const cards = [
    card(1, { category: 'everyday', topic: 'airport' }),
    card(2, { category: 'everyday', topic: 'airport' }),
    card(3, { category: 'everyday', topic: '' }),
    card(4, { category: 'everyday', topic: 'renting a flat' }),
    card(5, { category: 'engineering', topic: 'deploys' }),
    card(6, { category: 'engineering', topic: 'code review' }),
    card(7, { category: 'zebra', topic: 'zoo' }),
    card(8, { category: 'alpha', topic: 'a' }),
  ];
  const chapters = chaptersOf(cards, { order: ['everyday', 'engineering'] });
  assert.deepEqual(
    chapters.map((chapter) => `${chapter.category}/${chapter.topic}`),
    ['everyday/airport', 'everyday/renting a flat', 'everyday/', 'engineering/code review', 'engineering/deploys', 'alpha/a', 'zebra/zoo'],
  );
  assert.ok(chapters.every((chapter) => chapter.parts === 1));
  assert.deepEqual(topicsIn(cards.filter((entry) => entry.category === 'everyday')), [
    { topic: 'airport', n: 2 },
    { topic: 'renting a flat', n: 1 },
    { topic: '', n: 1 },
  ]);
  assert.deepEqual(chaptersOf([]), []);
});

test('summarize counts what the overview and the chapters both show', () => {
  const totals = summarize([card(0), card(1), card(3)]);
  assert.deepEqual(totals, { total: 3, seen: 2, due: 2, learned: 1, mastery: (1 + 0.2 + 0.2) / 3 });
  assert.deepEqual(summarize([]), { total: 0, seen: 0, due: 0, learned: 0, mastery: 0 });
});

test('a chapter is shown with a capital, whatever script it is written in', async () => {
  const { titleOf } = await import('./chapters.mjs');
  assert.equal(titleOf('code review'), 'Code review');
  assert.equal(titleOf('аэропорт'), 'Аэропорт');
  assert.equal(titleOf(''), '');
  assert.equal(titleOf(null), '');
});

test('the deck opens on cards, and chapters are a view with a fold and a rename of their own', async () => {
  const { readFileSync } = await import('node:fs');
  const deck = readFileSync(new URL('../ui/deck.js', import.meta.url), 'utf8');
  const core = readFileSync(new URL('../ui/core.js', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../ui/index.html', import.meta.url), 'utf8');

  assert.match(core, /view: 'list'/, 'the deck opens on the middle view, the list, not on chapters');
  assert.match(deck, /data-act="deck-view" data-value="chapters"/, 'one button jumps to the chapters view');
  assert.match(deck, /'chapters-fold'/, 'and one folds every chapter at once');
  assert.match(deck, /data-act="chapter-rename"/, 'a chapter is renamed from its own row');
  assert.match(page, /<dialog id="chapter"/, 'in a dialog beside the name');

  assert.match(page, /<dialog id="edit"/, 'a card is edited in a dialog');
  assert.doesNotMatch(deck, /function editRow/, 'never inside the row it lives in');
  assert.match(deck, /\$\('#card'\)\.open/, 'and opening the editor from the card view closes that dialog first');
  assert.match(deck, /<select class="edit" name="topic">/, 'a card is filed into a chapter that exists, never typed into a new one');
  assert.doesNotMatch(deck, /datalist/, 'so no free-text list hangs off the field');
});

test('the chapters of a deck are named once, most cards first, unsorted last', async () => {
  const { namedChapters } = await import('./chapters.mjs');
  const rows = namedChapters(
    [
      card(1, { category: 'everyday', topic: 'airport' }),
      card(2, { category: 'everyday', topic: 'airport' }),
      card(3, { category: 'everyday', topic: '' }),
      card(4, { category: 'engineering', topic: 'deploys' }),
      card(5, { category: 'engineering', topic: 'code review' }),
      card(6, { category: 'engineering', topic: 'code review' }),
    ],
    ['engineering', 'everyday'],
  );
  assert.deepEqual(rows, [
    { category: 'engineering', topic: 'code review', n: 2 },
    { category: 'engineering', topic: 'deploys', n: 1 },
    { category: 'everyday', topic: 'airport', n: 2 },
    { category: 'everyday', topic: '', n: 1 },
  ]);
  assert.deepEqual(namedChapters([]), []);
});

test('practice can be scoped to one chapter, and every mode reads that scope', async () => {
  const { readFileSync } = await import('node:fs');
  const practice = readFileSync(new URL('../ui/practice.js', import.meta.url), 'utf8');
  assert.match(practice, /id="practice-chapter"/, 'the scope is a control on the practice screen');
  assert.match(practice, /const scopedCards = \(\)/);
  assert.doesNotMatch(
    practice.slice(practice.indexOf('const studyPool')),
    /eligibleCards\(app\.cards\)/,
    'the pool every mode draws from is the scoped one',
  );
  assert.match(practice, /state\.chapter = event\.target\.value;[\s\S]{0,160}state\.test = null;/, 'changing it starts the run again');
});

test('a chapter is addressed by one key, whichever screen asks for it', async () => {
  const { chapterKey, chapterOf, inChapter } = await import('./chapters.mjs');
  assert.equal(chapterKey({ category: 'engineering', topic: 'code review' }), 'engineering|code review');
  assert.equal(chapterKey({ category: 'everyday', topic: '' }), 'everyday|', 'the unsorted chapter has a key too');
  assert.equal(chapterKey(), '|');
  assert.deepEqual(chapterOf('engineering|code review'), { category: 'engineering', topic: 'code review' });
  assert.deepEqual(chapterOf('everyday|'), { category: 'everyday', topic: '' });
  assert.equal(chapterOf('nonsense'), null);
  assert.equal(chapterOf(null), null);

  const owned = inChapter('engineering|code review');
  assert.equal(owned({ category: 'engineering', topic: 'code review' }), true);
  assert.equal(owned({ category: 'engineering', topic: 'deploys' }), false);
  assert.equal(owned({ category: 'everyday', topic: 'code review' }), false, 'the same label under another domain is another chapter');
  assert.equal(inChapter('everyday|')({ category: 'everyday' }), true, 'a card with no topic belongs to the unsorted chapter');
  assert.equal(inChapter('nonsense')({ category: 'everyday' }), false);
});
