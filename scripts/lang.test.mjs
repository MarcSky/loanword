import test from 'node:test';
import assert from 'node:assert/strict';
import { isLanguage, isUnspaced, minWordLength, scriptOf, scriptRatio, sentences, trimToSentence } from './lang.mjs';
import { LANGUAGES } from './languages.mjs';

test('maps languages to their script', () => {
  assert.equal(scriptOf('es'), 'latin');
  assert.equal(scriptOf('en'), 'latin');
  assert.equal(scriptOf('ru'), 'cyrillic');
  assert.equal(scriptOf('ja'), 'cjk');
  assert.equal(scriptOf('ar'), 'arabic');
  assert.equal(scriptOf('xx'), 'latin', 'unknown languages default to latin');
  assert.equal(scriptOf(''), 'latin');
  assert.equal(scriptOf(undefined), 'latin');
});

test('no language in the picker lands on the fallback by accident', () => {
  const LATIN = new Set([
    'cs', 'da', 'de', 'en', 'es', 'fi', 'fr', 'hu', 'id', 'it', 'nl', 'no', 'pl', 'pt', 'ro', 'sv', 'tr', 'vi',
  ]);
  for (const { code } of LANGUAGES) {
    if (LATIN.has(code)) continue;
    assert.notEqual(scriptOf(code), 'latin', `${code} is not written in Latin, and the lookup must say so`);
    assert.ok(scriptRatio('x'.repeat(20), scriptOf(code)) < 1, `${scriptOf(code)} has no pattern`);
  }
});

test('Georgian is Georgian, and English is not', () => {
  const georgian = 'მიგრაციის დაბრუნება საჭიროა მანამ, სანამ ინდექსი თავიდან არ აშენდება.';
  assert.ok(isLanguage(georgian, 'ka', 'ru'), 'a Georgian sentence passes as Georgian');
  assert.ok(!isLanguage('the deployment keeps stalling on the same index rebuild', 'ka', 'ru'));
  assert.ok(!isLanguage(georgian, 'ru', 'ka'));
});

test('the scripts that share a family are still told apart', () => {
  const japanese = 'デプロイをロールバックする必要があります。';
  const chinese = '我们需要回滚这次部署，因为索引还没有重建完成。';
  assert.ok(isLanguage(japanese, 'ja', 'zh'), 'kana settles it');
  assert.ok(!isLanguage(japanese, 'zh', 'ja'));
  assert.ok(isLanguage(chinese, 'zh', 'ja'), 'no kana means Chinese');
  assert.ok(!isLanguage(chinese, 'ja', 'zh'));
});

test('two languages in one alphabet are told apart by their function words', () => {
  const ukrainian = 'потрібно відкотити міграцію, якщо індекс ще не перебудувався до кінця';
  const russian = 'нужно откатить миграцию, если индекс ещё не перестроился до конца';
  assert.ok(isLanguage(ukrainian, 'uk', 'ru'));
  assert.ok(!isLanguage(ukrainian, 'ru', 'uk'));
  assert.ok(isLanguage(russian, 'ru', 'uk'));
  assert.ok(!isLanguage(russian, 'uk', 'ru'));
});

test('a word is shorter in some scripts than in others', () => {
  assert.equal(minWordLength('latin'), 4);
  assert.equal(minWordLength('cyrillic'), 4);
  assert.equal(minWordLength('hangul'), 2);
  assert.equal(minWordLength('cjk'), 1, 'one character can be a whole word');
  assert.equal(minWordLength('devanagari'), 3);
  assert.equal(minWordLength('klingon'), 4, 'an unknown script gets the safe floor');
});

test('the scripts written without spaces are marked as such', () => {
  assert.ok(isUnspaced('zh') && isUnspaced('ja') && isUnspaced('th'));
  assert.ok(!isUnspaced('ko') && !isUnspaced('en') && !isUnspaced('ka'));
});

test('an unspaced reply is cut into sentences, not into words', () => {
  const chinese = '我们需要回滚这次部署。索引还没有重建完成！你要等一下吗？';
  const cut = sentences(chinese);
  assert.equal(cut.length, 3);
  assert.ok(cut[0].endsWith('。'));
  assert.ok(cut.every((line) => line.length < 30));
  assert.deepEqual(sentences(''), []);
  assert.deepEqual(sentences('   \n  '), []);
});

test('a sentence longer than the cap is still cut somewhere sensible', () => {
  const long = `${'x'.repeat(500)}。`;
  assert.ok(sentences(long, 60).every((line) => line.length <= 60));
});

test('a long prompt is trimmed at a sentence end when there is one', () => {
  const text = 'Primera frase corta. Segunda frase un poco más larga que la anterior. Tercera que sobra.';
  const cut = trimToSentence(text, 60);
  assert.ok(cut.length <= 60);
  assert.ok(cut.endsWith('.'), `got ${JSON.stringify(cut)}`);
  assert.equal(trimToSentence('short enough', 60), 'short enough');
  assert.equal(trimToSentence('', 60), '');
});

test('a prompt with no sentence end is cut on a word boundary', () => {
  const cut = trimToSentence('palabra '.repeat(30), 40);
  assert.ok(cut.length <= 40);
  assert.ok(!cut.endsWith('palab'), 'never mid-word');
});

test('script ratio needs enough letters to judge', () => {
  assert.equal(scriptRatio('ok', 'latin'), 0);
  assert.equal(scriptRatio('', 'latin'), 0);
  assert.equal(scriptRatio('12345678', 'latin'), 0);
  assert.equal(scriptRatio('hello there friend', 'latin'), 1);
  assert.equal(scriptRatio('anything', 'klingon'), 0, 'unknown script never matches');
});

test('separates languages that use different scripts', () => {
  const greek = 'πρέπει να επαναφέρουμε τη μετάβαση σήμερα';
  assert.ok(isLanguage(greek, 'el', 'en'));
  assert.ok(!isLanguage(greek, 'en', 'el'));

  assert.ok(isLanguage('roll back the migration today', 'en', 'el'));
  assert.ok(!isLanguage('roll back the migration today', 'el', 'en'));

  assert.ok(isLanguage('デプロイをロールバックする必要があります', 'ja', 'en'));
  assert.ok(!isLanguage('デプロイをロールバックする必要があります', 'en', 'ja'));
});

test('separates spanish from english by function words', () => {
  assert.ok(isLanguage('hay que revertir la migración porque el índice no se reconstruyó', 'es', 'en'));
  assert.ok(!isLanguage('hay que revertir la migración porque el índice no se reconstruyó', 'en', 'es'));

  assert.ok(isLanguage('the deployment keeps timing out and that is not what you want', 'en', 'es'));
  assert.ok(!isLanguage('the deployment keeps timing out and that is not what you want', 'es', 'en'));
});

test('separates german and portuguese from english', () => {
  assert.ok(isLanguage('das ist nicht der richtige weg und die tests werden nicht laufen', 'de', 'en'));
  assert.ok(!isLanguage('das ist nicht der richtige weg und die tests werden nicht laufen', 'en', 'de'));
  assert.ok(isLanguage('não podemos fazer isso para uma migração que está com erro', 'pt', 'en'));
});

test('too little evidence is not a match', () => {
  assert.ok(!isLanguage('sí', 'es', 'en'));
  assert.ok(!isLanguage('ok fine', 'es', 'en'));
  assert.ok(!isLanguage('', 'es', 'en'));
  assert.ok(!isLanguage(null, 'es', 'en'));
  assert.ok(!isLanguage(undefined, 'es', 'en'));
  assert.ok(!isLanguage(42, 'es', 'en'));
});

test('falls back to the alphabet when no function words are known', () => {
  assert.ok(isLanguage('aquesta paraula no existeix encara', 'ca', 'ro'));
});

test('a tie does not claim the text', () => {
  assert.ok(!isLanguage('alpha beta gamma delta epsilon zeta', 'es', 'en'), 'no votes either way');
});
