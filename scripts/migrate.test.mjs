import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA = mkdtempSync(join(tmpdir(), 'loanword-migrate-'));
process.env.CLAUDE_PLUGIN_DATA = DATA;

const { paths, cardId, appendJsonl, writeJson, loadCards, config } = await import('./store.mjs');
const db = await import('./db.mjs');
const { migrate, needsMigration, rollback, survey } = await import('./migrate.mjs');

function wipe() {
  db.close();
  for (const name of readdirSync(DATA)) rmSync(join(DATA, name), { recursive: true, force: true });
}

const row = (front, back, extra = {}) => ({
  type: 'phrase',
  front,
  back,
  keywords: [front],
  example: `${front} appears here`,
  cefr: 'B1',
  category: 'engineering',
  native: 'ru',
  target: 'en',
  ts: '2026-01-02T10:00:00.000Z',
  project: '~/api',
  ...extra,
});

function seed(rows, state) {
  wipe();
  writeJson(paths.settings, { native: 'ru', target: 'en' });
  appendJsonl(paths.cards, rows);
  if (state) writeJson(paths.state, state);
}

test('nothing to migrate when there is no JSONL', () => {
  wipe();
  assert.equal(needsMigration(), false);
  assert.deepEqual(migrate(), { migrated: false, reason: 'nothing to migrate' });
});

test('a dry run reports what it would do and writes nothing', () => {
  seed([row('roll back', 'откатить'), row('flaky', 'нестабильный')]);
  const report = migrate({ dryRun: true });
  assert.equal(report.migrated, false);
  assert.equal(report.dryRun, true);
  assert.equal(report.before.cards, 2);
  assert.equal(existsSync(paths.db), false, 'a dry run does not create the database');
  assert.equal(existsSync(paths.cards), true, 'and does not move the source aside');
});

test('the real run imports every card, keeps its id, and moves the source aside', () => {
  const rows = [row('roll back', 'откатить'), row('flaky', 'нестабильный')];
  seed(rows);
  const ids = rows.map((entry) => cardId(entry));

  const report = migrate();
  assert.equal(report.migrated, true);
  assert.equal(report.ok, true, 'the counts agree either side of the import');
  assert.equal(report.after.cards, 2);

  const cards = loadCards();
  assert.equal(cards.length, 2);
  assert.deepEqual(cards.map((card) => card.id).sort(), [...ids].sort(), 'ids survive, so the schedule lands back');
  assert.equal(existsSync(paths.cards), false);
  assert.ok(existsSync(`${paths.cards}.migrated`));
});

test('the source files are copied into a timestamped backup first', () => {
  const backups = readdirSync(join(DATA, 'backup'));
  assert.equal(backups.length >= 1, true);
  const dir = join(DATA, 'backup', backups.sort().pop());
  assert.ok(existsSync(join(dir, 'cards.jsonl')));
  assert.match(readFileSync(join(dir, 'cards.jsonl'), 'utf8'), /roll back/);
});

test('a second run changes nothing', () => {
  const before = loadCards().length;
  assert.deepEqual(migrate(), { migrated: false, reason: 'nothing to migrate' });
  assert.equal(loadCards().length, before);
});

test('the schedule, its stars and its deletions all land on the right cards', () => {
  const kept = row('ship it', 'выкатить');
  const gone = row('rebase', 'перебазировать');
  const keptId = cardId(kept);
  const goneId = cardId(gone);

  seed([kept, gone], {
    [keptId]: {
      due: '2026-03-01T00:00:00.000Z',
      stability: 42,
      difficulty: 5.5,
      elapsed_days: 3,
      scheduled_days: 30,
      reps: 4,
      lapses: 1,
      state: 2,
      last_review: '2026-01-30T00:00:00.000Z',
    },
    _meta: {
      deleted: [goneId],
      favorites: [keptId],
      retired: ['rebase'],
      reviews_by_day: { '2026-01-30': 3, '2026-01-31': 2 },
      new_by_day: { '2026-01-30': 1 },
    },
  });

  const report = migrate();
  assert.equal(report.migrated, true);

  const state = db.stateOfCard(keptId);
  assert.equal(state.stability, 42);
  assert.equal(state.lapses, 1);
  assert.equal(state.last_review, '2026-01-30T00:00:00.000Z');

  assert.equal(db.cardById(keptId).starred, true);
  assert.equal(db.cardExists(goneId), false, 'a deleted card stays deleted');
  assert.equal(db.isRetired('rebase'), true);
});

test('the per-day counts survive as reviews with no grade rather than an invented one', () => {
  const rows = db.all("SELECT day, rating, mode, was_new FROM reviews WHERE mode = 'migrated' ORDER BY day");
  assert.equal(rows.length, 5, 'three on the 30th and two on the 31st');
  assert.equal(
    rows.every((entry) => entry.rating === 0),
    true,
    'a count is not a grade and must not be charted as one',
  );
  assert.equal(rows.filter((entry) => entry.was_new === 1).length, 1);
});

test('a torn or malformed line is skipped and the rest still lands', () => {
  wipe();
  writeJson(paths.settings, { native: 'ru', target: 'en' });
  writeFileSync(
    paths.cards,
    [
      JSON.stringify(row('one', 'один')),
      '{"front": "torn line',
      JSON.stringify({ front: '  ', back: 'blank' }),
      JSON.stringify({ back: 'no front' }),
      JSON.stringify(row('two', 'два')),
      JSON.stringify(row('one', 'один')),
    ].join('\n') + '\n',
  );
  const report = migrate();
  assert.equal(report.before.rows, 5, 'the torn line never parses');
  assert.equal(report.after.cards, 2, 'two good rows, the duplicate collapsed');
  assert.equal(report.ok, true);
});

test('rollback restores the JSONL and removes the database', () => {
  assert.equal(existsSync(paths.db), true);
  const result = rollback();
  assert.equal(result.restored, true);
  assert.equal(existsSync(paths.cards), true, 'the old file is back');
  assert.equal(existsSync(paths.db), false, 'and the database is gone');
  assert.equal(needsMigration(), true, 'so the next start migrates again');
});

test('survey never touches anything', () => {
  const before = readFileSync(paths.cards, 'utf8');
  const report = survey();
  assert.equal(report.cards >= 1, true);
  assert.equal(readFileSync(paths.cards, 'utf8'), before);
  assert.equal(existsSync(paths.db), false);
});

test('an unstamped legacy card is pinned to the pair open at migration time', () => {
  wipe();
  writeJson(paths.settings, { native: 'es', target: 'en' });
  appendJsonl(paths.cards, [{ type: 'word', front: 'legacy', back: 'heredado' }]);
  migrate();
  const pairs = db.deckPairsWithCounts();
  assert.deepEqual(pairs, [{ native: 'es', target: 'en', total: 1, due: 0 }]);
  assert.equal(config().target, 'en');
});

test.after(() => {
  db.close();
  rmSync(DATA, { recursive: true, force: true });
});
