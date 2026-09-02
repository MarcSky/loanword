import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA = mkdtempSync(join(tmpdir(), 'loanword-capture-'));
process.env.CLAUDE_PLUGIN_DATA = DATA;

const {
  assistantText,
  candidateWords,
  capturePrompt,
  captureSession,
  echoLine,
  MIN_PHRASE_WORDS,
  MAX_PROMPT_CHARS,
  stripFilenames,
  codeHeavy,
  isDerivedFrom,
  peekCard,
  wildMatches,
  MAX_TRANSCRIPT_BYTES,
  MAX_WORDS_PER_SESSION,
  stripCode,
} = await import('./capture.mjs');

const { frequentWords, peekFile, writeLines } = await import('./store.mjs');

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
  assert.deepEqual(candidateWords("'Quorum' quorum. Quorum"), ['quorum', 'quorum', 'quorum']);
  assert.deepEqual(candidateWords(''), []);
  assert.deepEqual(candidateWords(null), []);
});

test('a capitalised word mid-sentence is a name, not vocabulary', () => {
  assert.ok(!candidateWords('we watched Dexscreener all morning').includes('dexscreener'));
  assert.ok(candidateWords('Dexscreener went down again today').includes('dexscreener'), 'unless it opens the sentence');
  assert.ok(
    candidateWords('wir haben die Bereitstellung gesehen', { language: 'de' }).includes('bereitstellung'),
    'German capitalises every noun, so the rule is off there',
  );
});

test('contractions and possessives are never queued as words', () => {
  const words = candidateWords("aren't the dev's alert isn't ready");
  assert.ok(!words.includes("aren't"));
  assert.ok(!words.includes("dev's"));
  assert.ok(!words.some((word) => /['\u2019]/.test(word)));
});

test('an English plural whose singular is known is the same word', () => {
  const known = new Set(['alert', 'batch', 'policy']);
  assert.ok(isDerivedFrom('alerts', known));
  assert.ok(isDerivedFrom('batches', known));
  assert.ok(isDerivedFrom('policies', known));
  assert.ok(!isDerivedFrom('alertness', known), 'a real derivation is still a new word');
});

test('a prompt that is mostly identifiers is code, not language', () => {
  assert.ok(codeHeavy('getUserById parseJSON MAX_RETRIES v2 handleError'));
  assert.ok(!codeHeavy('we should roll back the migration before the deploy'));
  assert.equal(codeHeavy('short'), false, 'too little to judge');
});

test('a long prompt is cut at a sentence boundary, not mid-word', () => {
  const long = `${'Necesitamos revisar el despliegue con calma. '.repeat(20)}`;
  const row = capturePrompt({ prompt: long }, CFG, META);
  assert.ok(row.text.length <= MAX_PROMPT_CHARS);
  assert.match(row.text, /\.$/, 'it ends where a sentence ended');
});

test('a deck front used in a real prompt is spotted', () => {
  const fronts = ['roll back', 'deadline', 'ship it'];
  assert.deepEqual(wildMatches('creo que hay que roll back esto hoy', fronts), ['roll back']);
  assert.deepEqual(wildMatches('rollback sin espacio', fronts), [], 'only whole phrases count');
  assert.deepEqual(wildMatches('nada aquí', fronts), []);
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

test('the echo line names both languages and asks for one line only', () => {
  const line = echoLine({ native: 'ru', target: 'en', echo: 'line' });
  assert.match(line, /\bru\b/);
  assert.match(line, /\ben\b/);
  assert.equal(line.split('\n').filter(Boolean).length, 1, 'one line of injected context, never a paragraph');
});

test('the echo has three settings and only weave names the weak words', () => {
  const weak = ['roll back', 'deadline'];
  assert.equal(echoLine({ native: 'ru', target: 'en', echo: 'off' }, weak), '');
  const line = echoLine({ native: 'ru', target: 'en', echo: 'line' }, weak);
  assert.ok(!line.includes('roll back'));
  const weave = echoLine({ native: 'ru', target: 'en', echo: 'weave' }, weak);
  assert.ok(weave.includes('roll back') && weave.includes('deadline'));
  assert.equal(weave.split('\n').filter(Boolean).length, 2, 'one extra line, never a paragraph');
});

test('a peek card is shown at most once per interval and only when asked for', () => {
  const cfg = { ...CFG, target: 'en', peek: 'off', peekPick: [], peekEvery: 15 };
  assert.equal(peekCard(cfg), '', 'off means nothing is printed');

  writeLines(peekFile('en'), [
    JSON.stringify({ front: 'roll back', back: 'откатить', example: 'Roll back now.', cefr: 'B1', seen: true, r: 0.4 }),
    JSON.stringify({ front: 'deadline', back: 'срок', example: 'The deadline moved.', cefr: 'A1', starred: true, seen: true, r: 0.99 }),
  ]);

  const on = { ...cfg, peek: 'on' };
  const first = peekCard(on, 1_000_000);
  assert.match(first, /roll back/);
  assert.equal(peekCard(on, 1_000_000 + 60_000), '', 'a minute later is too soon');
  assert.match(peekCard(on, 1_000_000 + 16 * 60_000), /roll back/, 'a quarter of an hour later it comes back');
});

test('the peek filter picks the words it was told to', () => {
  const cfg = { ...CFG, target: 'en', peek: 'on', peekEvery: 1 };
  const at = (minutes) => 5_000_000 + minutes * 60_000;
  assert.match(peekCard({ ...cfg, peekPick: ['starred'] }, at(0)), /deadline/);
  assert.match(peekCard({ ...cfg, peekPick: ['A1'] }, at(2)), /deadline/, 'a level narrows it');
  assert.match(peekCard({ ...cfg, peekPick: ['B1'] }, at(4)), /roll back/);
  assert.match(peekCard({ ...cfg, peekPick: 'starred,slipping' }, at(6)), /roll back|deadline/);
});

test('file names are stripped, whatever the extension', () => {
  assert.equal(stripFilenames('покажи карточку в cards.jsonl тут'), 'покажи карточку в тут');
  assert.equal(stripFilenames('поправь ui/app.js и images/2.jpg потом'), 'поправь и потом');
  assert.equal(stripFilenames('сравни main.go и handler_test.go снова'), 'сравни и снова');
  assert.equal(stripFilenames('открой README.md и style.scss наконец'), 'открой и наконец');
});

test('a bare format word is vocabulary, not a file name', () => {
  assert.equal(stripFilenames('конвертни mp3 в wav'), 'конвертни mp3 в wav');
  assert.equal(stripFilenames('go is a fine language'), 'go is a fine language');
  assert.equal(stripFilenames('нужен свежий дамп базы'), 'нужен свежий дамп базы');
});

test('punctuation closes up behind a removed name', () => {
  assert.equal(stripFilenames('посмотри app.js, потом style.css.'), 'посмотри, потом.');
});

test('a phrase gutted by the stripping never reaches the queue', () => {
  const cfg = { ...CFG, native: 'ru', target: 'en' };
  assert.equal(capturePrompt({ prompt: 'сравни main.go и handler_test.go' }, cfg, META), null);
  assert.equal(capturePrompt({ prompt: 'посмотри cards.jsonl' }, cfg, META), null);

  const kept = capturePrompt({ prompt: 'нужно откатить миграцию перед деплоем' }, cfg, META);
  assert.ok(kept, 'a real phrase is untouched by the floor');
  assert.ok((kept.text.match(/\p{L}+/gu) || []).length >= MIN_PHRASE_WORDS);
});

test.after(() => {
  rmSync(DATA, { recursive: true, force: true });
});
