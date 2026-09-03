import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA = mkdtempSync(join(tmpdir(), 'loanword-clone-'));
process.env.CLAUDE_PLUGIN_DATA = DATA;

const db = await import('./db.mjs');
const {
  cloneRecord,
  copiedInto,
  planClone,
  selectForClone,
  sourcePair,
  suggestStarter,
  STARTER_CATEGORIES,
  STARTER_LEVELS,
} =
  await import('./clone.mjs');
const { cardId, commit, config, queueFile, readJsonl, saveSettings } = await import('./store.mjs');

saveSettings({ native: 'ru', target: 'en' });

const SOURCE = [
  { front: 'roll back', back: 'откатить', category: 'engineering', cefr: 'B1', example: 'Roll back now.' },
  { front: 'deadline', back: 'срок', category: 'process', cefr: 'A2', example: 'The deadline moved.' },
  { front: 'push back', back: 'возразить', category: 'collaboration', cefr: 'B2', example: 'I would push back.' },
  { front: 'that said', back: 'при этом', category: 'connectors', cefr: 'B1', example: 'That said, it works.' },
  { front: 'kettle', back: 'чайник', category: 'everyday', cefr: 'A1', example: 'Put the kettle on.' },
];

const english = db.deckId('ru', 'en');
db.tx(() =>
  db.insertCards(
    SOURCE.map((card) => ({
      ...card,
      deck_id: english,
      type: 'phrase',
      keywords: [],
      project: '~/work/api',
      ts: '2026-05-01T00:00:00Z',
      created_at: '2026-05-01T00:00:00Z',
      starred: card.front === 'deadline',
    })),
    SOURCE.map((card) => cardId({ ...card, native: 'ru', target: 'en' })),
  ),
);
db.saveState(cardId({ ...SOURCE[0], native: 'ru', target: 'en' }), english, {
  due: '2026-06-01T00:00:00Z',
  stability: 12,
  difficulty: 5,
  reps: 4,
  lapses: 1,
  state: 2,
});

const snapshot = () => ({
  cards: db.all('SELECT id, front, back, deck_id, starred FROM cards ORDER BY id').map((row) => ({ ...row })),
  state: db.all('SELECT card_id, due, stability, reps FROM fsrs_state ORDER BY card_id').map((row) => ({ ...row })),
});

test('the filter keeps what was asked for and skips what is already there', () => {
  const cards = db.cardsOfDeck(english);
  assert.equal(selectForClone(cards).length, 5, 'no filter means the whole deck');
  assert.equal(selectForClone(cards, { categories: ['everyday'] }).length, 1);
  assert.equal(selectForClone(cards, { levels: ['B1'] }).length, 2);
  assert.equal(selectForClone(cards, { categories: ['process'], levels: ['B1'] }).length, 0);
  assert.equal(selectForClone(cards, { skip: new Set(cards.map((card) => card.id)) }).length, 0);
  assert.equal(selectForClone(cards, { categories: ['nonsense'] }).length, 5, 'rubbish is not a filter');
});

test('a clone record carries the concept and the context, never the schedule', () => {
  const card = db.cardsOfDeck(english).find((entry) => entry.front === 'deadline');
  const record = cloneRecord(card, 'ru');
  assert.equal(record.source, 'clone');
  assert.equal(record.lang, 'ru');
  assert.equal(record.text, 'срок', 'the native side is what the builder is asked to render');
  assert.equal(record.origin, card.id);
  assert.equal(record.starred, true);
  assert.equal(record.category, 'process');
  assert.equal(record.cefr, 'A2');
  assert.equal(record.project, '~/work/api');
  assert.equal(record.stability, undefined);
  assert.equal(record.due, undefined);
  assert.equal(record.reps, undefined);
});

test('cloning a five-card deck queues five records, and a second run queues none', () => {
  const before = snapshot();

  const first = planClone({ native: 'ru', from: 'en', to: 'ka' });
  assert.equal(first.queued, 5);
  const queued = readJsonl(queueFile('ka'));
  assert.equal(queued.length, 5);
  assert.ok(queued.every((row) => row.origin && row.source === 'clone'));

  const georgian = db.deckId('ru', 'ka');
  db.tx(() =>
    db.insertCards(
      queued.map((row) => ({
        deck_id: georgian,
        type: 'phrase',
        front: `ka:${row.text}`,
        back: row.text,
        keywords: [],
        example: 'ქართული მაგალითი.',
        reading: 'kartuli magaliti',
        category: row.category,
        cefr: row.cefr,
        project: row.project,
        ts: row.ts,
        created_at: row.ts,
        starred: row.starred,
        origin_id: row.origin,
      })),
      queued.map((row) => cardId({ front: `ka:${row.text}`, back: row.text, native: 'ru', target: 'ka' })),
    ),
  );
  writeFileSync(queueFile('ka'), '');

  const second = planClone({ native: 'ru', from: 'en', to: 'ka' });
  assert.equal(second.queued, 0, 'nothing is cloned twice');
  assert.equal(second.skipped, 5);

  planClone({ native: 'ru', from: 'en', to: 'hy' });
  const twice = planClone({ native: 'ru', from: 'en', to: 'hy' });
  assert.equal(twice.queued, 0, 'and a clone still waiting in the queue is not queued again');
  writeFileSync(queueFile('hy'), '');

  const cloned = db.cardsOfDeck(georgian);
  assert.equal(cloned.length, 5);
  const deadline = cloned.find((card) => card.back === 'срок');
  assert.equal(deadline.starred, true, 'the star travels');
  assert.equal(deadline.category, 'process');
  assert.equal(deadline.reading, 'kartuli magaliti');
  assert.equal(db.stateOfCard(deadline.id), null, 'and the schedule starts from nothing');

  const after = snapshot();
  assert.deepEqual(
    after.cards.filter((card) => card.deck_id === english),
    before.cards.filter((card) => card.deck_id === english),
    'the source deck is byte for byte what it was',
  );
  assert.deepEqual(after.state, before.state, 'and so is every schedule row in it');
});

test('a clone across two different native languages is refused', () => {
  assert.throws(() => planClone({ native: 'ru', from: 'en', to: 'en' }), /onto itself/);
  assert.throws(() => planClone({ native: 'ru', from: 'en', to: 'ru' }), /cannot also be a deck/);
  assert.throws(() => planClone({ native: 'es', from: 'en', to: 'ka' }), /no es>en deck/);
  assert.throws(() => planClone({ native: 'ru', from: '', to: 'ka' }), TypeError);
});

test('a new script on an empty deck is offered the everyday start', () => {
  const offer = suggestStarter({ native: 'ru', target: 'ka', cards: [] });
  assert.deepEqual(offer.categories, STARTER_CATEGORIES);
  assert.deepEqual(offer.levels, STARTER_LEVELS);
  assert.deepEqual(STARTER_CATEGORIES, ['everyday', 'collaboration']);
  assert.deepEqual(STARTER_LEVELS, ['A1', 'A2', 'B1']);
  assert.equal(suggestStarter({ native: 'ru', target: 'ka', cards: [{ id: 'a' }] }), null);
  assert.equal(suggestStarter({ native: 'ru', target: 'bg', cards: [] }), null, 'the same script needs no head start');
});

test.after(() => {
  db.close();
  rmSync(DATA, { recursive: true, force: true });
});

test('one place knows what has already been copied, queue included', () => {
  const native = 'ru';
  const target = 'sv';
  assert.equal(copiedInto(native, target).size, 0, 'a deck that does not exist has copied nothing');

  const source = db.deckId(native, 'en');
  db.insertCards(
    [
      { deck_id: source, front: 'ship it', back: 'выкатить', keywords: [], example: '', category: 'engineering', cefr: 'B1', created_at: new Date().toISOString() },
    ],
    ['copied-1'],
  );
  const waiting = db.cardsOfDeck(source).length;

  const first = planClone({ native, from: 'en', to: target });
  assert.equal(first.queued, waiting, 'every card in the source deck is queued once');
  const copied = copiedInto(native, target);
  assert.equal(copied.size, waiting, 'the queue counts, not just the cards already built');
  assert.ok(copied.has('copied-1'));

  const again = planClone({ native, from: 'en', to: target });
  assert.equal(again.queued, 0, 'a second run finds nothing left to copy');
  assert.equal(selectForClone(db.cardsOfDeck(source), { skip: copiedInto(native, target) }).length, 0);
});

test('the same meaning is copied into a deck once, whichever language it comes from', () => {
  const native = 'ru';
  const target = 'da';
  const en = db.deckId(native, 'nl');
  const ka = db.deckId(native, 'pl');
  const card = (deck, front, back) => ({
    deck_id: deck,
    front,
    back,
    keywords: [],
    example: `${front} in a sentence`,
    category: 'everyday',
    cefr: 'A1',
    created_at: new Date().toISOString(),
  });
  db.insertCards([card(en, 'hello', 'привет'), card(en, 'thank you', 'спасибо')], ['dup-en-1', 'dup-en-2']);
  db.insertCards(
    [card(ka, 'გამარჯობა', 'Привет '), card(ka, 'მადლობა', 'спасибо'), card(ka, 'კარგი', 'хорошо')],
    ['dup-ka-1', 'dup-ka-2', 'dup-ka-3'],
  );

  const first = planClone({ native, from: 'nl', to: target });
  assert.equal(first.queued, 2);
  assert.equal(first.duplicates, 0);

  const second = planClone({ native, from: 'pl', to: target });
  assert.equal(second.queued, 1, 'only the meaning the deck does not have yet');
  assert.equal(second.duplicates, 2, 'and it says how many it recognised');

  const queued = readJsonl(queueFile(target)).map((row) => row.text);
  assert.deepEqual(queued, ['привет', 'спасибо', 'хорошо']);
});

test('two words for one meaning both survive a build — only clones are deduplicated', () => {
  const target = 'nb';
  const out = commit(
    [
      { front: 'stor', back: 'большой', keywords: ['stor'], example: 'Et stort hus.', category: 'everyday', cefr: 'A1' },
      { front: 'diger', back: 'Большой', keywords: ['diger'], example: 'En diger stein.', category: 'everyday', cefr: 'B2' },
    ],
    { native: 'ru', target },
  );
  assert.equal(out.added, 2, 'capture is not the place to collapse synonyms');
  const cards = db.cardsOfDeck(db.deckId('ru', target));
  assert.equal(new Set(cards.map((entry) => entry.concept)).size, 1, 'but they share one concept');
});

test('a deck written from another language can still be the source', () => {
  assert.deepEqual(sourcePair('ka', 'ru'), { native: 'ru', target: 'ka' });
  assert.deepEqual(sourcePair('ru>ka', 'en'), { native: 'ru', target: 'ka' });
  assert.deepEqual(sourcePair('RU>KA', 'en'), { native: 'ru', target: 'ka' });

  const source = db.deckId('ru', 'fi');
  db.insertCards(
    [
      {
        deck_id: source,
        front: 'kiitos',
        back: 'спасибо',
        keywords: ['kiitos'],
        example: 'Kiitos avusta.',
        category: 'everyday',
        cefr: 'A1',
        created_at: new Date().toISOString(),
      },
    ],
    ['cross-1'],
  );

  const plan = planClone({ native: 'en', from: 'ru>fi', to: 'fi' });
  assert.equal(plan.queued, 1);
  assert.equal(plan.source, 'ru>fi');
  assert.equal(plan.native, 'en', 'the deck being written is the English one');

  const [record] = readJsonl(queueFile('fi'));
  assert.equal(record.lang, 'ru', 'the builder is told which language the meaning is in');
  assert.equal(record.text, 'спасибо');
  assert.equal(record.phrase, 'kiitos', 'and it gets the phrase the old deck used as a second witness');
  assert.equal(record.phrase_lang, 'fi');
  assert.equal(record.origin, 'cross-1');
});

test('a deck is never copied onto itself, whichever way it is named', () => {
  assert.throws(() => planClone({ native: 'ru', from: 'en', to: 'en' }), /onto itself/);
  assert.throws(() => planClone({ native: 'ru', from: 'ru>en', to: 'en' }), /onto itself/);
  assert.throws(() => planClone({ native: 'ru', from: 'ru>zz', to: 'sv' }), /no ru>zz deck/);
});
