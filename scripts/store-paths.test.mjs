import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, sep } from 'node:path';

const DATA = mkdtempSync(join(tmpdir(), 'loanword-paths-'));
process.env.CLAUDE_PLUGIN_DATA = DATA;

const {
  CATEGORIES,
  CEFR_LEVELS,
  DATA: RESOLVED,
  decksOnDisk,
  frontsFile,
  knownFile,
  lockFile,
  paths,
  peekFile,
  queueFile,
  resolveData,
  wildFile,
} = await import('./store-paths.mjs');

test('an explicit data directory always wins', () => {
  assert.equal(RESOLVED, DATA);
  assert.equal(resolveData({ CLAUDE_PLUGIN_DATA: '/tmp/elsewhere' }, '/anything'), '/tmp/elsewhere');
});

test('an installed plugin lands where Claude Code points its hooks', () => {
  const root = join(homedir(), '.claude', 'plugins', 'cache', 'loanword', 'loanword', '0.0.1');
  assert.equal(resolveData({}, root), join(homedir(), '.claude', 'plugins', 'data', 'loanword-loanword'));
});

test('every file the plugin writes sits inside the data directory', () => {
  for (const file of Object.values(paths)) {
    assert.ok(String(file).startsWith(DATA + sep), `${file} escapes the data directory`);
  }
});

test('each target owns its queue, its lock and its snapshots', () => {
  for (const build of [queueFile, lockFile, knownFile, frontsFile, peekFile, wildFile]) {
    assert.notEqual(build('en'), build('ka'), 'two languages never share a file');
    assert.ok(build('en').startsWith(DATA + sep));
  }
  assert.match(queueFile('ka'), /queue\.ka\.jsonl$/);
  assert.match(lockFile('ka'), /build\.ka\.lock$/);
  assert.match(knownFile('ka'), /known\.ka\.txt$/);
  assert.match(peekFile('ka'), /peek\.ka\.jsonl$/);
});

test('a language code can never be used to write outside the data directory', () => {
  for (const nasty of ['../../etc/passwd', '/etc/passwd', '..', 'e/../..', '', null, undefined, 'EN-GB']) {
    const file = queueFile(nasty);
    assert.ok(file.startsWith(DATA + sep), `${JSON.stringify(nasty)} escaped to ${file}`);
    assert.ok(!file.includes('..'), `${JSON.stringify(nasty)} kept a traversal`);
  }
  assert.equal(queueFile('EN-GB'), queueFile('en'), 'a code is two lowercase letters, whatever was typed');
  assert.match(queueFile('%$#'), /queue\.xx\.jsonl$/, 'and nonsense falls back to a placeholder');
});

test('a deck on disk is a directory that actually holds one', () => {
  const store = join(DATA, 'store');
  mkdirSync(join(store, 'loanword'), { recursive: true });
  mkdirSync(join(store, 'loanword-acme'), { recursive: true });
  mkdirSync(join(store, 'notloanword'), { recursive: true });
  assert.deepEqual(decksOnDisk(store), [], 'an empty directory is not a deck');

  writeFileSync(join(store, 'loanword', 'loanword.db'), '');
  writeFileSync(join(store, 'loanword-acme', 'cards.jsonl'), '');
  writeFileSync(join(store, 'notloanword', 'loanword.db'), '');
  assert.deepEqual(decksOnDisk(store), [join(store, 'loanword'), join(store, 'loanword-acme')]);
  assert.deepEqual(decksOnDisk(join(DATA, 'nowhere')), [], 'a missing store is empty, not a crash');
});

test('the two closed vocabularies the whole plugin agrees on', () => {
  assert.deepEqual(CEFR_LEVELS, ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
  assert.ok(CATEGORIES.length > 40, 'every domain the catalogue offers is a name a card may carry');
  assert.ok(CATEGORIES.includes('everyday'), 'there is always a fallback domain');
  assert.ok(CATEGORIES.includes('engineering'), 'and the ones the plugin started with');
  assert.equal(new Set(CATEGORIES).size, CATEGORIES.length);
});

test.after(() => {
  rmSync(DATA, { recursive: true, force: true });
});
