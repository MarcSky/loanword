import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA = mkdtempSync(join(tmpdir(), 'loanword-filing-'));
process.env.CLAUDE_PLUGIN_DATA = DATA;
process.env.LOANWORD_NO_BUILD = '1';

const { BATCH_CARDS, acceptedFilings, busy, progressFile, promptFor, readProgress, rebuildInBackground } =
  await import('./reclassify.mjs');
const { jsonArray } = await import('./build.mjs');
const { writeJson } = await import('./store.mjs');

const CARDS = [
  { id: 'aaaaaaaa01', front: 'roll back', back: 'откатить', example: 'Roll it back.', category: 'everyday' },
  { id: 'aaaaaaaa02', front: 'the funnel', back: 'воронка', example: 'The funnel leaks.', category: 'everyday' },
];

test.after(() => rmSync(DATA, { recursive: true, force: true }));

test('the filing prompt offers only the categories the learner chose', () => {
  const prompt = promptFor(CARDS, { native: 'ru', target: 'en', categories: ['marketing', 'seo'] });
  assert.match(prompt, /exactly this list: phrasing, connectors, everyday, marketing, seo\./);
  assert.doesNotMatch(prompt, /engineering/);
  assert.match(prompt, /"id":"aaaaaaaa01"/, 'each card goes in by id');
  assert.match(prompt, /"front":"roll back"/);
  assert.doesNotMatch(prompt, /"reps"/, 'and nothing the model has no use for');
});

test('a reply is read by the same reader the card builder uses', () => {
  assert.deepEqual(jsonArray('here you go [{"id":"a","category":"seo"}] hope that helps'), [
    { id: 'a', category: 'seo' },
  ]);
  assert.throws(() => jsonArray('no array here'), /no JSON array/);
  assert.equal(BATCH_CARDS, 60, 'the deck is filed in the same size batches the builder reads');
});

test('a filing is taken only for a card in the batch, into a category on the list', () => {
  const allowed = ['phrasing', 'connectors', 'everyday', 'marketing', 'seo'];
  const out = acceptedFilings(
    [
      { id: 'aaaaaaaa02', category: 'MARKETING' },
      { id: 'aaaaaaaa02', category: 'seo' },
      { id: 'not-in-the-batch', category: 'seo' },
      { id: 'aaaaaaaa01', category: 'engineering' },
      { id: 'aaaaaaaa01', category: 'маркетинг' },
      { id: 'aaaaaaaa01', category: 'everyday' },
      null,
      { category: 'seo' },
    ],
    CARDS,
    allowed,
  );
  assert.deepEqual(out, [{ id: 'aaaaaaaa02', category: 'marketing' }]);
});

test('nothing is written when the model returns nonsense', () => {
  assert.deepEqual(acceptedFilings('not an array', CARDS, ['seo']), []);
  assert.deepEqual(acceptedFilings([], CARDS, ['seo']), []);
});

test('a rebuild reports how far it has got, and stands down while one is running', () => {
  assert.equal(busy(), false);
  assert.equal(readProgress(), null);

  writeJson(progressFile(), { total: 187, done: 60, batch: 1, batches: 4, startedAt: 'now' });
  assert.equal(readProgress().total, 187);
  assert.equal(readProgress().done, 60);

  rmSync(progressFile(), { force: true });
  assert.equal(readProgress(), null, 'a finished rebuild leaves nothing behind');
  assert.equal(rebuildInBackground(), false, 'and it never spawns while builds are switched off');
});
