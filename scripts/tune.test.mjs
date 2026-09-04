import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA = mkdtempSync(join(tmpdir(), 'loanword-tune-'));
process.env.CLAUDE_PLUGIN_DATA = DATA;

const { HINTS, SHAPES, SPLIT_FLOOR, budgetStopped, busy, forgetTuning, hintFor, readTuning, rememberTuning, saidNothing, tuneFor, unknownFlag } =
  await import('./tune.mjs');

test.after(() => rmSync(DATA, { recursive: true, force: true }));

test('a failure is read for what it says, not for the exit code', () => {
  assert.equal(budgetStopped({ subtype: 'error_max_budget_usd' }), true);
  assert.equal(budgetStopped({ message: 'claude stopped: Reached maximum budget ($3)' }), true);
  assert.equal(budgetStopped({ message: 'claude stopped: something else' }), false);

  assert.equal(unknownFlag({ stderr: "error: unknown option '--bare'" }), true);
  assert.equal(unknownFlag({ reason: 'unrecognized argument' }), true);
  assert.equal(unknownFlag({ stderr: 'boom' }), false);

  assert.equal(saidNothing({}), true, 'exit 1 with nothing on either stream is the silent case');
  assert.equal(saidNothing({ reason: 'Not logged in' }), false);
  assert.equal(saidNothing({ stderr: 'boom' }), false);

  assert.equal(busy({ reason: 'rate limit reached' }), true);
  assert.equal(busy({ stderr: 'HTTP 429' }), true);
  assert.equal(busy({ reason: 'overloaded' }), true);
  assert.equal(busy({ reason: 'nothing of the sort' }), false);
});

test('a cause the learner can fix is named, and never retried', () => {
  assert.equal(hintFor('claude stopped: Not logged in · Please run /login'), 'login');
  assert.equal(hintFor('Invalid API key'), 'login');
  assert.equal(hintFor('Credit balance is too low'), 'credit');
  assert.equal(hintFor('the model is overloaded'), '');
  assert.equal(hintFor(''), '');
  assert.equal(HINTS.length, 2, 'every hint has a line the interface can show');

  assert.equal(tuneFor({ reason: 'Not logged in · Please run /login' }, 'lean').change, 'none', 'no shape fixes a logged-out runner');
  assert.equal(tuneFor({ reason: 'Credit balance is too low' }, 'bare').change, 'none', 'and no shape pays a bill');
});

test('a bare call that says it is logged out is the flag talking, not the learner', () => {
  const tuned = tuneFor({ reason: 'Not logged in · Please run /login' }, 'bare');
  assert.equal(tuned.change, 'shape', 'bare reads no login of its own, so the next shape is tried before blaming the learner');
  assert.equal(tuned.shape, 'lean');
  assert.match(tuned.note, /bare call reads no login/);
  assert.equal(
    tuneFor({ reason: 'Not logged in · Please run /login' }, 'plain').change,
    'none',
    'once the plainest call says it too, the learner really is signed out',
  );
});

test('the command line is tuned by what went wrong, one step at a time', () => {
  assert.equal(tuneFor({ subtype: 'error_max_budget_usd' }).change, 'split');
  assert.equal(tuneFor({ reason: 'rate limit' }).change, 'wait');

  assert.deepEqual(
    { ...tuneFor({ stderr: "unknown option '--bare'" }, 'bare') },
    { change: 'shape', shape: 'lean', note: 'the command line was refused; asking again as lean' },
  );
  assert.equal(tuneFor({ reason: 'the model refused the batch' }, 'lean').change, 'none', 'a real answer is not a flag problem');
  assert.equal(tuneFor({}, 'lean').shape, 'stream', 'a silent failure walks down the same ladder');
  assert.equal(tuneFor({}, 'stream').shape, 'plain');
  assert.equal(tuneFor({}, 'plain').change, 'none', 'the plainest call has nothing left to drop');
  assert.deepEqual(SHAPES, ['bare', 'lean', 'stream', 'plain'], 'best first, plainest last');
  assert.equal(SPLIT_FLOOR, 2, 'a batch of one cannot be halved');
});

test('what the tuning learned outlives the process, and only what changed is written', () => {
  forgetTuning();
  assert.deepEqual(readTuning(), { shape: '', records: 0 }, 'nothing learned yet is nothing remembered');

  rememberTuning({ shape: 'lean' });
  assert.equal(readTuning().shape, 'lean');
  rememberTuning({ records: 10 });
  assert.deepEqual(readTuning(), { shape: 'lean', records: 10 }, 'one lesson never erases the other');

  rememberTuning({ shape: 'nonsense' });
  assert.equal(readTuning().shape, 'lean', 'a shape the runner does not have is not remembered');
  rememberTuning({ records: -4 });
  assert.equal(readTuning().records, 10);

  forgetTuning();
  assert.equal(readTuning().shape, '');
});
