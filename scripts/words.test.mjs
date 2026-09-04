import test from 'node:test';
import assert from 'node:assert/strict';
import { piecesOf, segmenter, wordCount, words } from './words.mjs';

test('a sentence is cut into the words a reader sees, lower-cased', () => {
  assert.deepEqual(words('We roll back the migration tonight.', 'en'), [
    'we',
    'roll',
    'back',
    'the',
    'migration',
    'tonight',
  ]);
  assert.equal(wordCount('a rough estimate', 'en'), 3);
  assert.deepEqual(words('   ', 'en'), [], 'whitespace holds no words');
  assert.deepEqual(words(null, 'en'), []);
  assert.deepEqual(words(42, 'en'), ['42'], 'a number is a word-like piece');
});

test('the pieces keep the punctuation and the spaces, so a sentence can be rebuilt', () => {
  const pieces = piecesOf('ვწერ ტესტებს.', 'ka');
  assert.equal(pieces.map((piece) => piece.segment).join(''), 'ვწერ ტესტებს.');
  assert.deepEqual(
    pieces.filter((piece) => piece.isWordLike).map((piece) => piece.segment),
    ['ვწერ', 'ტესტებს'],
    'the picker offers these and never the space or the full stop',
  );
});

test('a writing system without spaces is still cut into words', () => {
  assert.ok(wordCount('テストを書く', 'ja') > 1, 'Japanese has no spaces and still has words');
  assert.ok(words('部署を確認する', 'zh').length > 1);
});

test('the same language reuses one segmenter, and a nonsense tag still works', () => {
  assert.equal(segmenter('ka'), segmenter('KA'), 'the cache is keyed by the language, not the case');
  assert.notEqual(segmenter('ka'), segmenter('ja'));
  assert.deepEqual(words('roll back', 'not-a-language'), ['roll', 'back'], 'a bad tag falls back, never throws');
  assert.deepEqual(words('roll back'), ['roll', 'back'], 'and so does no tag at all');
});
