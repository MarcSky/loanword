import test from 'node:test';
import assert from 'node:assert/strict';
import { isLanguage, scriptOf, scriptRatio } from './lang.mjs';

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

test('script ratio needs enough letters to judge', () => {
  assert.equal(scriptRatio('ok', 'latin'), 0);
  assert.equal(scriptRatio('', 'latin'), 0);
  assert.equal(scriptRatio('12345678', 'latin'), 0);
  assert.equal(scriptRatio('hello there friend', 'latin'), 1);
  assert.equal(scriptRatio('anything', 'klingon'), 0, 'unknown script never matches');
});

// Different scripts: the alphabet alone decides.
test('separates languages that use different scripts', () => {
  const greek = 'πρέπει να επαναφέρουμε τη μετάβαση σήμερα';
  assert.ok(isLanguage(greek, 'el', 'en'));
  assert.ok(!isLanguage(greek, 'en', 'el'));

  assert.ok(isLanguage('roll back the migration today', 'en', 'el'));
  assert.ok(!isLanguage('roll back the migration today', 'el', 'en'));

  assert.ok(isLanguage('デプロイをロールバックする必要があります', 'ja', 'en'));
  assert.ok(!isLanguage('デプロイをロールバックする必要があります', 'en', 'ja'));
});

// Same script: this is the case the alphabet heuristic cannot see.
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
  // Same script, no word list for either side: nothing better than the alphabet.
  assert.ok(isLanguage('aquesta paraula no existeix encara', 'ca', 'ro'));
});

test('a tie does not claim the text', () => {
  assert.ok(!isLanguage('alpha beta gamma delta epsilon zeta', 'es', 'en'), 'no votes either way');
});
