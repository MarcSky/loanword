import test from 'node:test';
import assert from 'node:assert/strict';
import { alphabetRecord, lettersOf, offerAlphabet } from './alphabet.mjs';

test('Georgian is thirty-three letters, in order, with nothing archaic', () => {
  const letters = lettersOf('ka');
  assert.equal(letters.length, 33);
  assert.equal(letters[0], 'ა');
  assert.equal(letters.at(-1), 'ჰ');
  assert.equal(new Set(letters).size, 33);
  assert.ok(letters.every((letter) => /\p{Script=Georgian}/u.test(letter)));
});

test('the other scripts come with their own alphabet', () => {
  assert.equal(lettersOf('el').length, 24);
  assert.equal(lettersOf('he').length, 22);
  assert.equal(lettersOf('ar').length, 28);
  assert.equal(lettersOf('ru').length, 33);
  assert.equal(lettersOf('ja').length, 46, 'the kana, not the kanji');
  assert.ok(lettersOf('hy').length > 30);
  assert.ok(lettersOf('th').length > 40);
});

test('a language with no alphabet to learn says so instead of guessing', () => {
  assert.deepEqual(lettersOf('zh'), [], 'Chinese has no alphabet, and a starter deck would be a lie');
  assert.deepEqual(lettersOf('en'), [], 'nobody learning English needs the Latin letters');
  assert.deepEqual(lettersOf(''), []);
  assert.ok(lettersOf('ka').length > 0);
  assert.equal(lettersOf('zh').length, 0);
});

test('an alphabet record carries every letter and asks for letter cards', () => {
  const record = alphabetRecord('ru', 'ka');
  assert.equal(record.source, 'alphabet');
  assert.equal(record.type, 'letter');
  assert.equal(record.lang, 'ka');
  assert.equal(record.native, 'ru');
  assert.equal(record.letters.length, 33);
  assert.equal(record.cefr, 'A1');
  assert.equal(alphabetRecord('ru', 'zh'), null, 'no alphabet, no record');
});

test('the starter is offered only for a new script on an empty deck', () => {
  assert.ok(offerAlphabet({ native: 'ru', target: 'ka', cards: [] }));
  assert.equal(offerAlphabet({ native: 'ru', target: 'ka', cards: [{ id: 'a' }] }), null, 'the deck is not empty');
  assert.equal(offerAlphabet({ native: 'ru', target: 'bg', cards: [] }), null, 'the same script needs no lesson');
  assert.equal(offerAlphabet({ native: 'en', target: 'zh', cards: [] }), null, 'and there must be one to offer');
  assert.equal(offerAlphabet({ native: 'ru', target: 'ka', cards: [] }).letters, 33);
});
