import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_CATEGORIES,
  CATEGORY,
  CORE,
  DEFAULT_CATEGORIES,
  FIELDS,
  TINTS,
  categoriesForField,
  categoriesOf,
  groupByCategory,
  knownCategory,
} from './categories.mjs';

test('the catalogue is a closed list, so a category can never be misspelled into existence', () => {
  assert.ok(ALL_CATEGORIES.length > 40, `expected a long list, found ${ALL_CATEGORIES.length}`);
  assert.equal(new Set(ALL_CATEGORIES).size, ALL_CATEGORIES.length, 'no key twice');
  assert.equal(knownCategory('marketing'), true);
  assert.equal(knownCategory('Marketing'), false, 'the key is the key, not a label');
  assert.equal(knownCategory('маркетинг'), false);
  assert.equal(knownCategory(''), false);
});

test('every category carries what the interface needs to draw it', () => {
  for (const key of ALL_CATEGORIES) {
    const info = CATEGORY[key];
    assert.ok(info, `${key} is in the list but has no entry`);
    assert.ok(info.label, `${key} has no label`);
    assert.ok(info.icon, `${key} has no icon`);
    assert.ok(TINTS.includes(info.tint), `${key} has a tint the stylesheet does not define`);
  }
  assert.equal(new Set(Object.values(CATEGORY).map((info) => info.icon)).size, ALL_CATEGORIES.length, 'no icon twice');
  assert.equal(new Set(Object.values(CATEGORY).map((info) => info.label)).size, ALL_CATEGORIES.length, 'no label twice');
});

test('the three that hold a deck together are always on', () => {
  for (const chosen of [[], ['marketing'], ['nonsense'], ALL_CATEGORIES]) {
    const enabled = categoriesOf(chosen);
    for (const key of CORE) assert.ok(enabled.includes(key), `${key} survives ${JSON.stringify(chosen)}`);
  }
  assert.deepEqual(categoriesOf([]), DEFAULT_CATEGORIES.filter((key) => DEFAULT_CATEGORIES.includes(key)).length ? categoriesOf(DEFAULT_CATEGORIES) : []);
});

test('a deck can never be left with no category at all', () => {
  for (const chosen of [[], null, 'marketing', ['nonsense'], ['everyday'], CORE]) {
    const enabled = categoriesOf(chosen);
    assert.ok(enabled.length >= 1, `${JSON.stringify(chosen)} left nothing for a card to be filed under`);
    assert.ok(enabled.includes('everyday'), 'and there is always somewhere to put a card that fits nowhere');
  }
});

test('a name the catalogue does not know is dropped rather than stored', () => {
  assert.deepEqual(categoriesOf(['marketing', 'nope', 'seo']), ['phrasing', 'connectors', 'everyday', 'marketing', 'seo']);
  assert.deepEqual(categoriesOf('marketing'), categoriesOf([]), 'a string is not a list');
  assert.deepEqual(categoriesOf(null), categoriesOf([]));
});

test('the enabled list always reads in catalogue order, whatever order it was chosen in', () => {
  const forwards = categoriesOf(['seo', 'marketing', 'analytics']);
  const backwards = categoriesOf(['analytics', 'seo', 'marketing']);
  assert.deepEqual(forwards, backwards);
  assert.deepEqual(
    forwards,
    ALL_CATEGORIES.filter((key) => forwards.includes(key)),
    'the interface can rely on one order',
  );
});

test('cards are bucketed by category in one pass, whatever the catalogue holds', () => {
  const cards = [
    { id: 'a', category: 'engineering' },
    { id: 'b', category: 'everyday' },
    { id: 'c', category: 'engineering' },
    { id: 'd', category: 'retired-key' },
  ];
  const buckets = groupByCategory(cards);
  assert.deepEqual(buckets.get('engineering').map((card) => card.id), ['a', 'c'], 'order is kept');
  assert.deepEqual(buckets.get('everyday').map((card) => card.id), ['b']);
  assert.ok(buckets.has('retired-key'), 'a category the catalogue dropped still groups, the caller decides what to show');
  assert.equal(buckets.get('marketing'), undefined, 'an empty category is absent, not an empty array');
  assert.equal(groupByCategory([]).size, 0);
});

test('every field offers categories the catalogue knows', () => {
  assert.ok(FIELDS.length >= 8, `expected a choice of fields, found ${FIELDS.length}`);
  for (const [key, label, keys] of FIELDS) {
    assert.ok(key && label, 'a field needs a key and a label');
    assert.ok(keys.length >= 4, `${key} offers too little to be worth picking`);
    for (const category of keys) assert.ok(knownCategory(category), `${key} points at ${category}`);
    const enabled = categoriesForField(key);
    for (const category of keys) assert.ok(enabled.includes(category), `${key} enables ${category}`);
    for (const category of CORE) assert.ok(enabled.includes(category));
  }
  assert.deepEqual(categoriesForField('no such field'), categoriesOf([]), 'an unknown field falls back to the default');
});
