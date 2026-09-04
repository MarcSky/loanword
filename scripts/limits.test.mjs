import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_CHARS, MAX_IDS, RANGES, SESSION_LENGTHS, USAGE_WINDOWS, clampInt, intIn, textIn } from './limits.mjs';
import { PLUGIN_ROOT } from './store-paths.mjs';

test('a number inside its range is taken, one outside it is refused', () => {
  assert.equal(intIn(15, RANGES.dailyLimit), 15);
  assert.equal(intIn('15', RANGES.dailyLimit), 15, 'a form sends its number as text');
  assert.equal(intIn(22.7, RANGES.dailyLimit), 22, 'a fraction of a card is no card');
  assert.equal(intIn(3, RANGES.dailyLimit), 3);
  assert.equal(intIn(100, RANGES.dailyLimit), 100);
  assert.equal(intIn(2, RANGES.dailyLimit), undefined);
  assert.equal(intIn(101, RANGES.dailyLimit), undefined);
  for (const bad of [null, undefined, '', 'abc', true, false, [], {}, NaN, Infinity]) {
    assert.equal(intIn(bad, RANGES.dailyLimit), undefined, `${JSON.stringify(bad)} is not a number`);
  }
});

test('a number the learner types is pulled into its range instead of being lost', () => {
  assert.equal(clampInt(500, RANGES.dailyLimit), 100);
  assert.equal(clampInt(0, RANGES.dailyLimit), 3);
  assert.equal(clampInt('7.9', RANGES.dailyLimit), 7);
  assert.equal(clampInt(240, RANGES.peekEvery), 120);
  assert.equal(clampInt(9, RANGES.weeklyGoal), 7);
  assert.equal(clampInt('abc', RANGES.peekEvery), undefined, 'nonsense is still nonsense');
});

test('text is trimmed to its cap, and anything that is not text is empty', () => {
  assert.equal(textIn('  code review  ', MAX_CHARS.topic), 'code review');
  assert.equal(textIn('x'.repeat(60), MAX_CHARS.topic).length, MAX_CHARS.topic);
  assert.equal(textIn(42, MAX_CHARS.topic), '');
  assert.equal(textIn(null, MAX_CHARS.field), '');
});

test('the ranges the interface offers are the ones the plugin manifest promises', () => {
  const manifest = JSON.parse(readFileSync(join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  const limit = manifest.userConfig.daily_limit;
  assert.equal(limit.min, RANGES.dailyLimit.min);
  assert.equal(limit.max, RANGES.dailyLimit.max);
  assert.equal(limit.default, RANGES.dailyLimit.fallback);
  const every = manifest.userConfig.peek_every;
  assert.equal(every.min, RANGES.peekEvery.min);
  assert.equal(every.max, RANGES.peekEvery.max);
  assert.equal(every.default, RANGES.peekEvery.fallback);
  assert.deepEqual(SESSION_LENGTHS, [5, 10, 15]);
  assert.equal(MAX_IDS, 200);
  assert.deepEqual(RANGES.picks, { min: 1, max: 12, fallback: 12 }, 'one sheet of tapped words');
  assert.equal(MAX_CHARS.word, 48, 'a tapped word is a word, never a paragraph');
  assert.deepEqual(USAGE_WINDOWS, { d1: 0, d7: 6, d30: 29 }, 'the spend panel offers 1D, 7D and 30D');
});

test('the settings screen offers exactly the range the rules enforce', () => {
  const source = readFileSync(new URL('../ui/settings.js', import.meta.url), 'utf8');
  assert.match(source, /min="\$\{RANGES\.dailyLimit\.min\}" max="\$\{RANGES\.dailyLimit\.max\}"/);
  assert.match(source, /min="\$\{RANGES\.peekEvery\.min\}" max="\$\{RANGES\.peekEvery\.max\}"/);
  assert.doesNotMatch(source, /max="50"/, 'a hard-coded bound is a bound that drifts');
});
