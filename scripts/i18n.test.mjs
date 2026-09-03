import test from 'node:test';
import assert from 'node:assert/strict';
import { audit, keys, languages } from './i18n.mjs';

const ALL = keys();

test('every string the interface renders is discoverable', () => {
  assert.ok(ALL.length > 100, `expected the full interface, found ${ALL.length} keys`);

  assert.ok(ALL.includes('Start quiz'));
  assert.ok(ALL.includes('{n} due right now'));
  assert.ok(ALL.includes('card|cards'));
  assert.ok(ALL.includes('Engineering'), 'keys reached through a variable are listed too');
});

test('no key is an empty or whitespace-only string', () => {
  assert.deepEqual(ALL.filter((key) => !key.trim()), []);
});

for (const lang of languages()) {
  test(`the ${lang} dictionary is complete and well-formed`, () => {
    const report = audit(lang, ALL);
    assert.ok(report.readable, `ui/i18n/${lang}.json does not parse as an object`);
    assert.deepEqual(report.missing, [], 'untranslated keys');
    assert.deepEqual(report.unused, [], 'entries the interface no longer renders');
    assert.deepEqual(report.broken, [], 'wrong type, or a dropped {placeholder}');
  });
}

test('there is no en.json — English lives in the source', () => {
  assert.ok(!languages().includes('en'));
});
