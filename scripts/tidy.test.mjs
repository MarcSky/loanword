import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA = mkdtempSync(join(tmpdir(), 'loanword-tidy-'));
process.env.CLAUDE_PLUGIN_DATA = DATA;

const { KEEP_BACKUPS, leftovers, tidy } = await import('./tidy.mjs');
const { paths } = await import('./store-paths.mjs');

const backup = (name) => {
  mkdirSync(join(paths.backups, name), { recursive: true });
  writeFileSync(join(paths.backups, name, 'loanword.db'), 'x');
};

test('a clean directory has nothing to tidy', () => {
  mkdirSync(DATA, { recursive: true });
  assert.deepEqual(leftovers(DATA), []);
  assert.deepEqual(tidy({ data: DATA }), { removed: false, count: 0, bytes: 0, entries: [] });
});

test('migrated leftovers, old backups and the rotated log are what it offers to remove', () => {
  writeFileSync(join(DATA, 'cards.jsonl.migrated'), 'old');
  writeFileSync(join(DATA, 'known_words.json.migrated'), 'old');
  writeFileSync(paths.logRotated, 'old log');
  for (const name of ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01']) backup(name);

  const found = leftovers(DATA).map((entry) => entry.path);
  assert.ok(found.some((path) => path.endsWith('cards.jsonl.migrated')));
  assert.ok(found.some((path) => path.endsWith('known_words.json.migrated')));
  assert.ok(found.includes(paths.logRotated));
  assert.ok(found.some((path) => path.endsWith('2026-01-01')));
  assert.ok(!found.some((path) => path.endsWith('2026-05-01')), `the newest ${KEEP_BACKUPS} backups are kept`);
});

test('without the flag it removes nothing at all', () => {
  const before = leftovers(DATA).length;
  const report = tidy({ data: DATA });
  assert.equal(report.removed, false);
  assert.equal(report.count, before);
  assert.ok(report.bytes > 0);
  assert.equal(existsSync(join(DATA, 'cards.jsonl.migrated')), true);
  assert.equal(leftovers(DATA).length, before, 'reporting changes nothing');
});

test('with the flag it removes exactly what it listed, and nothing else', () => {
  writeFileSync(join(DATA, 'settings.json'), '{}');
  writeFileSync(paths.log, 'live log');
  const listed = leftovers(DATA).map((entry) => entry.path);

  const report = tidy({ remove: true, data: DATA });
  assert.equal(report.removed, true);
  assert.equal(report.count, listed.length);
  for (const path of listed) assert.equal(existsSync(path), false, `${path} survived`);

  assert.equal(existsSync(join(DATA, 'settings.json')), true, 'live files are never touched');
  assert.equal(existsSync(paths.log), true);
  assert.ok(existsSync(join(paths.backups, '2026-05-01')), 'and the newest backups stay');
  assert.deepEqual(leftovers(DATA), []);
});

test.after(() => {
  rmSync(DATA, { recursive: true, force: true });
});
