import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QUICK_MS,
  TYPO_MIN_LENGTH,
  TYPO_MIN_LENGTH_DENSE,
  articlesFor,
  checkTyped,
  editDistance,
  normalize,
  ratingFor,
  stripArticle,
  typoMinLength,
} from './answer.mjs';

test('the browser and the tests grade with the same code', async () => {
  const browser = await import('../ui/answer.js');
  assert.equal(browser.checkTyped, checkTyped, 'one implementation, imported from ui/');
});

test('normalisation folds case, accents and stray punctuation', () => {
  assert.equal(normalize('  Roll   BACK!  '), 'roll back');
  assert.equal(normalize('Café'), 'cafe');
  assert.equal(normalize('naïve résumé'), 'naive resume');
  assert.equal(normalize('«откатить»'), 'откатить');
  assert.equal(normalize(null), '');
  assert.equal(normalize(undefined), '');
});

test('normalisation keeps apostrophes and hyphens, which carry meaning', () => {
  assert.equal(normalize("it's up-to-date"), "it's up-to-date");
});

test('a leading article is not the thing being tested', () => {
  assert.equal(stripArticle('the commit', 'en'), 'commit');
  assert.equal(stripArticle('un despliegue', 'es'), 'despliegue');
  assert.equal(stripArticle('to deploy', 'en'), 'deploy');
  assert.equal(stripArticle('commit', 'en'), 'commit', 'a bare word keeps every letter');
  assert.equal(stripArticle('the', 'en'), 'the', 'the article alone is the whole answer');
});

test('the article list belongs to the language being answered in', () => {
  assert.equal(stripArticle('to jest', 'pl'), 'to jest', 'Polish has no articles; "to" is a pronoun');
  assert.equal(stripArticle('the build', 'en'), 'build');
  assert.equal(stripArticle('o projeto', 'pt'), 'projeto');
  assert.equal(stripArticle('o projeto', 'ru'), 'o projeto', 'Russian borrows no article list');
  assert.deepEqual(articlesFor('pl'), []);
  assert.ok(articlesFor('de').includes('der'));
});

test('diacritics are folded only where folding is safe', () => {
  assert.equal(normalize('Café', 'fr'), 'cafe', 'Latin loses its accents');
  assert.equal(normalize('Ελλάδα', 'el'), 'ελλαδα', 'Greek loses its tonos');
  const withSign = normalize('कि', 'hi');
  const withoutSign = normalize('क', 'hi');
  assert.notEqual(withSign, withoutSign, 'a Devanagari vowel sign is a letter, not an accent');
  assert.equal(normalize('كِتاب', 'ar'), normalize('كِتاب', 'ar'));
});

test('a Hindi answer is judged on its vowel signs', () => {
  assert.equal(checkTyped('किताब', 'किताब', [], 'hi').verdict, 'exact');
  assert.equal(checkTyped('कताब', 'किताब', [], 'hi').correct, false, 'a dropped sign is a different word');
});

test('two characters is a whole answer in a dense script', () => {
  assert.equal(typoMinLength('zh'), TYPO_MIN_LENGTH_DENSE);
  assert.equal(typoMinLength('ja'), TYPO_MIN_LENGTH_DENSE);
  assert.equal(typoMinLength('en'), TYPO_MIN_LENGTH);
  assert.equal(checkTyped('开如', '开始', [], 'zh').verdict, 'close', 'one wrong character out of two');
  assert.equal(checkTyped('完全不同', '开始', [], 'zh').correct, false);
});

test('edit distance is bounded and stops early', () => {
  assert.equal(editDistance('commit', 'commit'), 0);
  assert.equal(editDistance('commit', 'commmit'), 1);
  assert.equal(editDistance('commit', 'comit'), 1);
  assert.equal(editDistance('commit', 'cimmot'), 2);
  assert.equal(editDistance('commit', 'entirely different'), 3, 'past the cap it just says "too far"');
  assert.equal(editDistance('', ''), 0);
});

test('an exact answer is exact, whatever the case and spacing', () => {
  assert.deepEqual(checkTyped('roll back', 'roll back'), { correct: true, verdict: 'exact', expected: 'roll back' });
  assert.equal(checkTyped('  ROLL   back  ', 'roll back').verdict, 'exact');
  assert.equal(checkTyped('the rollback', 'rollback').verdict, 'exact');
});

test('a diacritic is not a mistake', () => {
  assert.equal(checkTyped('despliegue', 'despliégue').verdict, 'exact');
  assert.equal(checkTyped('ecrire', 'écrire').verdict, 'exact');
});

test('one slip in a long word is forgiven and says so', () => {
  const result = checkTyped('reconcilliation', 'reconciliation');
  assert.equal(result.correct, true);
  assert.equal(result.verdict, 'close', 'forgiven, but not pretended to be perfect');
});

test('a slip in a short word is a different word', () => {
  assert.equal('bug'.length < TYPO_MIN_LENGTH, true);
  assert.equal(checkTyped('bag', 'bug').correct, false);
  assert.equal(checkTyped('hit', 'hot').correct, false);
});

test('two slips are never forgiven, however long the word', () => {
  assert.equal(checkTyped('reconcilliatoin', 'reconciliation').correct, false);
});

test('an empty answer is neither right nor a typo', () => {
  assert.deepEqual(checkTyped('', 'commit'), { correct: false, verdict: 'empty', expected: 'commit' });
  assert.equal(checkTyped('   ', 'commit').verdict, 'empty');
  assert.equal(checkTyped('!!!', 'commit').verdict, 'empty', 'punctuation alone is nothing typed');
});

test('a keyword counts as an acceptable answer', () => {
  const result = checkTyped('roll back', 'revert', ['roll back', 'undo']);
  assert.equal(result.correct, true);
  assert.equal(result.verdict, 'exact');
});

test('a bad alternatives list is ignored rather than fatal', () => {
  assert.equal(checkTyped('commit', 'commit', null).correct, true);
  assert.equal(checkTyped('commit', 'commit', [null, 7, '']).correct, true);
});

test('a wrong answer is wrong and names what was wanted', () => {
  const result = checkTyped('rebase', 'roll back');
  assert.equal(result.correct, false);
  assert.equal(result.verdict, 'wrong');
  assert.equal(result.expected, 'roll back');
});

test('the rating follows the answer and how long it took', () => {
  assert.equal(ratingFor({ correct: false, verdict: 'wrong' }), 1);
  assert.equal(ratingFor({ correct: true, verdict: 'close', ms: 100 }), 2, 'a forgiven typo is Hard, never Easy');
  assert.equal(ratingFor({ correct: true, verdict: 'exact', ms: QUICK_MS - 1 }), 4);
  assert.equal(ratingFor({ correct: true, verdict: 'exact', ms: QUICK_MS + 1 }), 3);
  assert.equal(ratingFor({ correct: true, verdict: 'exact' }), 3, 'with no timing, assume it was considered');
});

test('a multi-word phrase is compared as a phrase', () => {
  assert.equal(checkTyped('ship it behind a flag', 'ship it behind a flag').verdict, 'exact');
  assert.equal(checkTyped('ship it behind flag', 'ship it behind a flag').correct, false, 'a missing word is missing');
});

test('Cyrillic answers grade the same way as Latin ones', () => {
  assert.equal(checkTyped('Откатить', 'откатить').verdict, 'exact');
  assert.equal(checkTyped('перестроть', 'перестроить').verdict, 'close');
  assert.equal(checkTyped('собрать', 'перестроить').correct, false);
});
