import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CODES,
  EXTRA_LANGUAGES,
  LANGUAGES,
  NAME_PAIRS,
  codeOf,
  isKnownLanguage,
  isPickable,
  isRtl,
  isUnspaced,
  languageName,
  languageOf,
  scriptOf,
} from './languages.mjs';

test('the picker is one list, and the trainer and the hook read the same one', async () => {
  const browser = await import('../ui/languages.js');
  assert.equal(browser.LANGUAGES, LANGUAGES, 'one array, imported from ui/');
  assert.equal(NAME_PAIRS.length, LANGUAGES.length);
  assert.deepEqual(NAME_PAIRS[0], [LANGUAGES[0].code, LANGUAGES[0].name]);
});

test('every language is a two-letter code with a name and a script', () => {
  for (const entry of LANGUAGES) {
    assert.match(entry.code, /^[a-z]{2}$/, entry.code);
    assert.ok(entry.name.trim(), `${entry.code} has no name`);
    assert.ok(entry.script.trim(), `${entry.code} has no script`);
  }
  assert.equal(new Set(CODES).size, CODES.length, 'no code appears twice');
  assert.ok(CODES.length >= 30, `only ${CODES.length} languages offered`);
});

test('no language in the picker falls back to Latin by accident', () => {
  const latin = LANGUAGES.filter((entry) => entry.script === 'latin').map((entry) => entry.code);
  assert.deepEqual(
    latin.sort(),
    ['cs', 'da', 'de', 'en', 'es', 'fi', 'fr', 'hu', 'id', 'it', 'nl', 'no', 'pl', 'pt', 'ro', 'sv', 'tr', 'vi'],
    'anything else claiming Latin is a lookup that was never filled in',
  );
  for (const entry of LANGUAGES) {
    if (latin.includes(entry.code)) continue;
    assert.notEqual(scriptOf(entry.code), 'latin', `${entry.code} is not written in Latin`);
  }
});

test('the scripts that need special handling are marked', () => {
  assert.equal(scriptOf('ka'), 'georgian');
  assert.equal(scriptOf('hy'), 'armenian');
  assert.equal(scriptOf('hi'), 'devanagari');
  assert.equal(scriptOf('bn'), 'bengali');
  assert.equal(scriptOf('th'), 'thai');
  assert.equal(scriptOf('am'), 'ethiopic');
  assert.equal(scriptOf('ko'), 'hangul');
  assert.equal(scriptOf('zh'), 'cjk');
  assert.ok(isUnspaced('zh') && isUnspaced('ja') && isUnspaced('th'));
  assert.ok(!isUnspaced('ko'), 'Korean is written with spaces');
  assert.ok(!isUnspaced('en'));
});

test('right-to-left covers the languages that need it, including the five added', () => {
  for (const code of ['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'ug', 'yi', 'ku']) {
    assert.ok(isRtl(code), `${code} lays out right to left`);
  }
  for (const code of ['en', 'ru', 'ka', 'ja', 'hi']) assert.ok(!isRtl(code));
  assert.deepEqual(
    EXTRA_LANGUAGES.map((entry) => entry.code).sort(),
    ['ku', 'ps', 'sd', 'ug', 'yi'],
    'known for direction and script, not offered as decks',
  );
});

test('the five extra codes are known for direction, but never offered as decks', () => {
  for (const code of ['ps', 'sd', 'ug', 'yi', 'ku']) {
    assert.ok(isKnownLanguage(code), `${code} must resolve to a script and a direction`);
    assert.ok(!isPickable(code), `${code} has no stop-list, so it cannot be a deck`);
  }
  for (const code of CODES) assert.ok(isPickable(code));
});

test('an unknown code is unknown, not silently Latin-named', () => {
  assert.equal(isKnownLanguage('en'), true);
  assert.equal(isKnownLanguage('xx'), false);
  assert.equal(isKnownLanguage(''), false);
  assert.equal(isKnownLanguage(null), false);
  assert.equal(languageOf('xx'), null);
  assert.equal(languageName('xx'), 'XX');
  assert.equal(languageName('ka'), 'ქართული');
  assert.equal(codeOf('EN-gb'), 'en');
  assert.equal(codeOf(null), '');
});
