// Unit tests for the capture helpers, exercised in-process rather than through
// the hook, so each rule can be checked on its own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA = mkdtempSync(join(tmpdir(), 'loanword-capture-'));
process.env.CLAUDE_PLUGIN_DATA = DATA;

const {
  assistantText,
  candidateWords,
  capturePrompt,
  captureSession,
  frequentWords,
  MAX_TRANSCRIPT_BYTES,
  MAX_WORDS_PER_SESSION,
  stripCode,
} = await import('./capture.mjs');

const CFG = { native: 'es', target: 'en', mode: 'both', dailyLimit: 15, autoBuild: true };
const META = { ts: '2026-08-17T00:00:00Z', project: '~/work/api', session: 's1' };

test('stripCode removes fences, inline code, diffs and indented blocks', () => {
  assert.equal(stripCode('antes\n```js\nconst secret = 1\n```\ndespués'), 'antes\ndespués');
  assert.equal(stripCode('usa `process.env.TOKEN` aquí'), 'usa aquí');
  assert.equal(stripCode('mira\n+ added line\n- removed line\nfin'), 'mira\nfin');
  assert.equal(stripCode('texto\n@@ -1,4 +1,6 @@\nfin'), 'texto\nfin');
  assert.equal(stripCode('texto\n    indented_code()\nfin'), 'texto\nfin');
  assert.equal(stripCode('roto\n```js\nnunca cerrado'), 'roto');
});

test('stripCode handles empty and non-string input', () => {
  assert.equal(stripCode(''), '');
  assert.equal(stripCode(null), '');
  assert.equal(stripCode(undefined), '');
  assert.equal(stripCode(42), '42');
});

test('candidateWords keeps vocabulary and drops machine tokens', () => {
  const words = candidateWords('the reconciliation loop retries getUserById on v2 with MAX_RETRIES and API');
  assert.ok(words.includes('reconciliation'));
  assert.ok(words.includes('retries'));
  assert.ok(!words.includes('getuserbyid'), 'camelCase is an identifier');
  assert.ok(!words.includes('max_retries'), 'snake_case is an identifier');
  assert.ok(!words.includes('api'), 'short acronyms are noise');
  assert.ok(!words.some((w) => w.length < 4), 'short words are never candidates');
  assert.ok(!words.some((w) => /\d/.test(w)), 'nothing with digits');
});

test('candidateWords normalises case and trims punctuation', () => {
  assert.deepEqual(candidateWords("'Quorum' Quorum quorum"), ['quorum', 'quorum', 'quorum']);
  assert.deepEqual(candidateWords(''), []);
  assert.deepEqual(candidateWords(null), []);
});

test('frequentWords loads the shipped list and is empty for unknown languages', () => {
  const english = frequentWords('en');
  assert.ok(english.size > 100);
  assert.ok(english.has('because'));
  assert.equal(frequentWords('xx').size, 0, 'no list means the filter is simply skipped');
});

test('assistantText reads only assistant text blocks', () => {
  const file = join(DATA, 'transcript.jsonl');
  writeFileSync(
    file,
    [
      { type: 'assistant', message: { content: [{ type: 'text', text: 'first reply' }] } },
      { type: 'user', message: { content: [{ type: 'text', text: 'user prompt' }] } },
      { type: 'assistant', message: { content: [{ type: 'tool_use', input: { cmd: 'rm -rf' } }] } },
      { type: 'assistant', message: { content: 'not an array' } },
      { type: 'assistant', message: { content: [{ type: 'text', text: 42 }] } },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'second reply' }] } },
    ]
      .map((r) => JSON.stringify(r))
      .join('\n'),
  );
  assert.equal(assistantText(file), 'first reply\nsecond reply');
});

test('assistantText refuses missing, non-file and oversized transcripts', () => {
  assert.equal(assistantText(join(DATA, 'missing.jsonl')), '');
  assert.equal(assistantText(DATA), '', 'a directory is not a transcript');
  assert.equal(assistantText(''), '');
  assert.equal(assistantText(null), '');
  assert.equal(assistantText(42), '');
  assert.ok(MAX_TRANSCRIPT_BYTES > 0);
});

test('capturePrompt scrubs, and keeps only native-language prompts', () => {
  const row = capturePrompt(
    { prompt: 'hay que revertir la migración con la clave AKIAIOSFODNN7EXAMPLE' },
    CFG,
    META,
  );
  assert.equal(row.source, 'prompt');
  assert.equal(row.lang, 'es');
  assert.ok(!row.text.includes('AKIAIOSFODNN7EXAMPLE'));
  assert.equal(row.project, '~/work/api');

  assert.equal(capturePrompt({ prompt: 'roll back the migration and rebuild the index' }, CFG, META), null);
  assert.equal(capturePrompt({}, CFG, META), null);
  assert.equal(capturePrompt({ prompt: null }, CFG, META), null);
});

test('captureSession stores words only, never the sentence', () => {
  const file = join(DATA, 'session.jsonl');
  writeFileSync(
    file,
    JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'text',
            text: 'The reconciliation loop never converges on a quorum, and that is not the behaviour you want from this deployment.',
          },
        ],
      },
    }),
  );
  const row = captureSession({ transcript_path: file }, CFG, META);
  assert.equal(row.source, 'session');
  assert.equal(row.text, undefined);
  assert.ok(row.words.includes('reconciliation'));
  assert.ok(row.words.includes('quorum'));
  assert.ok(!row.words.includes('because'));
  assert.ok(row.words.length <= MAX_WORDS_PER_SESSION);
});

test('captureSession returns null when there is nothing new to learn', () => {
  assert.equal(captureSession({ transcript_path: join(DATA, 'gone.jsonl') }, CFG, META), null);
  assert.equal(captureSession({}, CFG, META), null);
});

test('captureSession caps how many words one session can contribute', () => {
  const file = join(DATA, 'flood.jsonl');
  const letters = (n) => {
    let out = '';
    do {
      out = String.fromCharCode(97 + (n % 26)) + out;
      n = Math.floor(n / 26);
    } while (n > 0);
    return out;
  };
  const filler = Array.from({ length: 300 }, (_, i) => `zeta${letters(i)}`).join(' ');
  writeFileSync(
    file,
    JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: `That is not the thing you want and this is why: ${filler}` },
        ],
      },
    }),
  );
  const row = captureSession({ transcript_path: file }, CFG, META);
  assert.ok(row);
  assert.equal(row.words.length, MAX_WORDS_PER_SESSION);
  assert.equal(new Set(row.words).size, row.words.length, 'no duplicates within a batch');
});
