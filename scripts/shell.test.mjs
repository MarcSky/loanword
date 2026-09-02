import test from 'node:test';
import assert from 'node:assert/strict';
import { WIDE, greetingKey, railOpen, railState } from './shell.mjs';

test('with nothing stored the sidebar opens only on a wide screen', () => {
  assert.equal(railOpen(WIDE, null), true);
  assert.equal(railOpen(WIDE - 1, null), false);
  assert.equal(railOpen(WIDE, undefined), true);
});

test('a stored choice wins at any width', () => {
  assert.equal(railOpen(2000, 'closed'), false);
  assert.equal(railOpen(400, 'open'), true);
  assert.equal(railOpen(400, 'garbage'), false);
});

test('the state attribute is one of two words', () => {
  assert.equal(railState(true), 'open');
  assert.equal(railState(false), 'closed');
});

test('the greeting follows the hour', () => {
  assert.equal(greetingKey(0), 'Good morning');
  assert.equal(greetingKey(11), 'Good morning');
  assert.equal(greetingKey(12), 'Good afternoon');
  assert.equal(greetingKey(17), 'Good afternoon');
  assert.equal(greetingKey(18), 'Good evening');
  assert.equal(greetingKey(23), 'Good evening');
});
