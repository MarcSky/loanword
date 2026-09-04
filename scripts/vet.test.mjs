import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA = mkdtempSync(join(tmpdir(), 'loanword-vet-'));
process.env.CLAUDE_PLUGIN_DATA = DATA;
process.env.LOANWORD_NO_BUILD = '1';

const { busy, lockFile, readProgress, repair, report } = await import('./vet.mjs');
const { paths, readJsonl, saveSettings, writeJson } = await import('./store.mjs');
const db = await import('./db.mjs');

const BIN = join(DATA, 'bin');
mkdirSync(BIN, { recursive: true });
const fakeClaude = (script) => {
  const path = join(BIN, 'claude');
  writeFileSync(path, script);
  chmodSync(path, 0o755);
  process.env.PATH = `${BIN}:${process.env.PATH}`;
};

saveSettings({ native: 'en', target: 'ka' });
const DECK = db.deckId('en', 'ka');
const pair = { native: 'en', target: 'ka' };

const seed = (id, front, back, extra = {}) => ({
  deck_id: DECK,
  type: 'phrase',
  front,
  back,
  keywords: [],
  example: '',
  cefr: 'B2',
  category: 'engineering',
  created_at: new Date().toISOString(),
  ...extra,
});

db.insertCards(
  [
    seed('a', 'დუბლირებული კოდი', 'code that appears in more than one place'),
    seed('b', 'მონაცემის გადამოწმება', 'checking that data is correct', { keywords: ['validation', 'input'] }),
    seed('c', 'გადამოწმება', 'verification'),
  ],
  ['aaaaaaaa0a', 'aaaaaaaa0b', 'aaaaaaaa0c'],
);
db.saveState('aaaaaaaa0a', DECK, { due: new Date('2026-10-01'), stability: 9, difficulty: 5, reps: 3, lapses: 1, state: 2 });

test.after(() => {
  db.close();
  rmSync(DATA, { recursive: true, force: true });
});

test('the report names the cards that break the rules and why', () => {
  const out = report(db.cardsOfDeck(DECK), pair);
  assert.equal(out.total, 3);
  assert.equal(out.broken, 2);
  assert.equal(out.byReason['a back that reads like a definition, not the equivalent'], 2);
  assert.deepEqual(out.samples.map((sample) => sample.id).sort(), ['aaaaaaaa0a', 'aaaaaaaa0b']);
  assert.ok(out.samples.every((sample) => sample.reasons.length));
});

test('without --apply nothing is asked and nothing changes', async () => {
  const out = await repair({});
  assert.equal(out.broken, 2);
  assert.equal(out.repaired, 0);
  assert.equal(out.dropped, 0);
  assert.equal(db.cardById('aaaaaaaa0a').back, 'code that appears in more than one place');
});

test('with --apply the broken cards go back once, the fixed ones are rewritten in place, the rest stay', async () => {
  rmSync(paths.usage, { force: true });
  fakeClaude(`#!/bin/sh
prompt=$(cat)
case "$prompt" in
  *"## Repair"*) printf '%s' '[{"n":"aaaaaaaa0a","type":"phrase","front":"დუბლირებული კოდი","back":"duplicated code","keywords":["მიმოხილვა"],"example":"კოდის მიმოხილვისას ეკიპაჟმა იპოვა დუბლირებული კოდი.","cefr":"B2","category":"engineering"},{"n":"aaaaaaaa0b","type":"phrase","front":"მონაცემის გადამოწმება","back":"checking that data is correct","cefr":"B2","category":"engineering"}]' ;;
  *) printf '[]' ;;
esac
`);
  const before = db.stateOfCard('aaaaaaaa0a');
  const out = await repair({ apply: true });
  assert.equal(out.broken, 2);
  assert.equal(out.repaired, 1);
  assert.equal(out.dropped, 0, 'this deck holds no repeat, so nothing is deleted');

  const fixed = db.cardById('aaaaaaaa0a');
  assert.equal(fixed.back, 'duplicated code');
  assert.deepEqual(fixed.keywords, ['მიმოხილვა']);
  assert.match(fixed.example, /დუბლირებული კოდი/);
  assert.equal(fixed.concept, db.conceptOf(DECK, 'duplicated code'));
  const after = db.stateOfCard('aaaaaaaa0a');
  assert.equal(after.reps, before.reps);
  assert.equal(after.due, before.due, 'the schedule is untouched');

  assert.equal(db.cardById('aaaaaaaa0b').back, 'checking that data is correct', 'an unfixable card is left as it was');
  assert.equal(db.countCards(DECK), 3);

  const usage = readJsonl(paths.usage);
  assert.equal(usage.length, 1);
  assert.equal(usage[0].kind, 'vet');
  assert.equal(usage[0].records, 2);
  assert.match(readFileSync(paths.log, 'utf8'), /vet .*"repaired":1/);
  assert.equal(report(db.cardsOfDeck(DECK), pair).broken, 1);
});

test('a second run stands down while one holds the lock', async () => {
  writeJson(lockFile(), { pid: process.pid });
  assert.equal(busy(), true);
  const out = await repair({ apply: true });
  assert.match(out.skipped, /already running/);
  rmSync(lockFile(), { force: true });
  assert.equal(busy(), false);
  assert.equal(readProgress(), null);
});

test('a second card for a word the deck already teaches is a repeat, and --apply drops the later one', async () => {
  const { repeatsOf } = await import('./vet.mjs');
  const deck = db.deckId('en', 'de');
  db.insertCards(
    [
      seed('r1', 'duplizierter Code', 'duplicated code', { deck_id: deck, created_at: '2026-01-01T00:00:00.000Z' }),
      seed('r2', 'doppelter Code', 'duplicate code', { deck_id: deck, created_at: '2026-01-02T00:00:00.000Z' }),
      seed('r3', 'duplizierter Code', 'duplicate code', { deck_id: deck, created_at: '2026-01-03T00:00:00.000Z' }),
      seed('r4', 'Duplikat', 'duplicate', { deck_id: deck, created_at: '2026-01-04T00:00:00.000Z' }),
    ],
    ['bbbbbbbb01', 'bbbbbbbb02', 'bbbbbbbb03', 'bbbbbbbb04'],
  );

  const repeats = repeatsOf(db.cardsOfDeck(deck), 'de');
  assert.deepEqual(repeats.map((card) => card.id), ['bbbbbbbb03'], 'one word twice is the repeat, another wording is not');

  writeJson(paths.settings, { ...JSON.parse(readFileSync(paths.settings, 'utf8')), native: 'en', target: 'de' });
  const out = await repair({ apply: true });
  assert.equal(out.repeats, 1);
  assert.equal(out.dropped, 1);
  assert.equal(db.cardById('bbbbbbbb03').deleted_at !== null, true, 'the later wording is thrown away');
  assert.equal(db.countCards(deck), 3, 'the oldest card for the word stays');

  const again = await repair({});
  assert.equal(again.repeats, 0, 'a second pass has nothing to drop');
});
