// End-to-end: hook capture → queue → commit → deck.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = mkdtempSync(join(tmpdir(), 'loanword-test-'));
const PROJECT = join(homedir(), 'api'); // under $HOME so the tilde rewrite applies

const env = {
  ...process.env,
  CLAUDE_PLUGIN_DATA: DATA,
  CLAUDE_PLUGIN_ROOT: dirname(HERE),
  CLAUDE_PLUGIN_OPTION_NATIVE_LANG: 'es',
  CLAUDE_PLUGIN_OPTION_TARGET_LANG: 'en',
  CLAUDE_PLUGIN_OPTION_MODE: 'both',
  CLAUDE_PLUGIN_OPTION_DAILY_LIMIT: '15',
};

const { AUTO_BUILD_THRESHOLD, MAX_QUEUE_BYTES } = await import('./capture.mjs');

const run = (args, stdin = '') => execFileSync('node', args, { env, input: stdin, encoding: 'utf8' });

const capture = (source, event) =>
  run([join(HERE, 'capture.mjs'), `--source=${source}`], JSON.stringify(event));

const queue = () =>
  readFileSync(join(DATA, 'queue.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse);

test('captures a native-language prompt, scrubbed', () => {
  capture('prompt', {
    prompt: 'hay que revertir la migración en /Users/bob/api, pero no toques la clave AKIAIOSFODNN7EXAMPLE',
    cwd: PROJECT,
    session_id: 's1',
  });
  const [row] = queue();
  assert.equal(row.source, 'prompt');
  assert.equal(row.lang, 'es');
  assert.ok(row.text.includes('revertir la migración'));
  assert.ok(!row.text.includes('AKIAIOSFODNN7EXAMPLE'));
  assert.ok(!row.text.includes('/Users/bob'));
});

// es and en share the Latin script, so this can only pass via the stopword vote.
test('ignores a prompt written in the target language', () => {
  capture('prompt', { prompt: 'please roll back the migration, the index is stale and the deploy is blocked' });
  assert.equal(queue().length, 1);
});

test('drops code blocks before they reach the queue', () => {
  capture('prompt', {
    prompt: 'mira este fragmento por favor\n```js\nconst secret = "hunter2"\n```\ny arréglalo',
  });
  const row = queue().at(-1);
  assert.ok(!row.text.includes('hunter2'));
  assert.ok(row.text.includes('mira este fragmento'));
});

test('session capture harvests target-language words, not sentences', () => {
  const transcript = join(DATA, 'transcript.jsonl');
  writeFileSync(
    transcript,
    [
      {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'text',
              text: 'The deployment keeps stalling because the reconciliation loop never converges on a quorum, and that is not what you want here.',
            },
          ],
        },
      },
      { type: 'user', message: { content: [{ type: 'text', text: 'ignore me' }] } },
    ]
      .map((r) => JSON.stringify(r))
      .join('\n'),
  );
  capture('session', { transcript_path: transcript, cwd: PROJECT, session_id: 's1' });

  const row = queue().at(-1);
  assert.equal(row.source, 'session');
  assert.ok(Array.isArray(row.words));
  assert.ok(row.words.includes('reconciliation'), `got ${row.words}`);
  assert.ok(!row.words.includes('because'), 'common word should be filtered by the frequency list');
  assert.equal(row.text, undefined, 'the source sentence must never be stored');
});

test('commit writes cards with provenance and clears the queue', () => {
  const cards = [
    {
      type: 'phrase',
      front: 'hay que revertir la migración en ▮, pero no toques la clave ▮',
      back: 'we need to roll back the migration',
      keywords: ['roll back'],
      example: 'We rolled back the migration before the index finished rebuilding.',
      pos: 'verb',
      cefr: 'B1',
    },
    {
      type: 'word',
      front: 'reconciliation',
      back: 'conciliación, ajuste de estados',
      example: 'The reconciliation loop retries.',
      cefr: 'B2',
    },
  ];
  const out = JSON.parse(run([join(HERE, 'store.mjs'), 'commit'], JSON.stringify(cards)));
  assert.equal(out.added, 2);
  assert.equal(queue().length, 0);

  const written = readFileSync(join(DATA, 'cards.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  assert.equal(written[0].project, '~/api', 'card carries where it came from');
  assert.ok(written[0].ts);

  assert.equal(written[0].target, 'en', 'the card records which deck it belongs to');
  assert.equal(written[0].native, 'es');

  // Known words are keyed by target language, so a second target starts fresh.
  const known = JSON.parse(readFileSync(join(DATA, 'known_words.json'), 'utf8'));
  assert.ok(known.en.includes('reconciliation'), 'committed words are never re-captured');
});

test('committed words are not captured a second time', () => {
  const transcript = join(DATA, 'transcript2.jsonl');
  writeFileSync(
    transcript,
    JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'text',
            text: 'The reconciliation loop never converges on a quorum again, and that is not the behaviour you want.',
          },
        ],
      },
    }),
  );
  capture('session', { transcript_path: transcript });
  const words = queue().flatMap((r) => r.words || []);
  assert.ok(!words.includes('reconciliation'));
});

const stats = () => JSON.parse(run([join(HERE, 'serve.mjs'), '--stats']));

test('brand-new cards are due immediately', () => {
  assert.equal(stats().total, 2);
  assert.equal(stats().due_now, 2);
  assert.equal(stats().streak, 0);
});

test('grading schedules the card into the future and counts the streak', async () => {
  const port = 14747;
  const server = spawn('node', [join(HERE, 'serve.mjs')], { env: { ...env, LOANWORD_PORT: String(port) } });
  const base = `http://127.0.0.1:${port}`;
  try {
    await once(server.stdout, 'data');

    const { cards } = await (await fetch(`${base}/due`)).json();
    assert.equal(cards.length, 2);
    assert.ok(cards.every((c) => c.isNew));

    const graded = await (
      await fetch(`${base}/grade`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: cards[0].id, rating: 4 }),
      })
    ).json();
    assert.ok(new Date(graded.due) > new Date(), 'Easy must push the card forward');

    await fetch(`${base}/delete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: cards[1].id, reason: 'test' }),
    });

    const after = await (await fetch(`${base}/due`)).json();
    assert.equal(after.cards.length, 0, 'one graded away, one deleted');
  } finally {
    server.kill();
  }

  const s = stats();
  assert.equal(s.seen, 1);
  assert.equal(s.streak, 1);
  assert.equal(s.total, 1, 'deleted cards leave the deck');
});

test('the server rejects malformed, unknown and oversized input', async () => {
  const port = 14748;
  const server = spawn('node', [join(HERE, 'serve.mjs')], { env: { ...env, LOANWORD_PORT: String(port) } });
  const base = `http://127.0.0.1:${port}`;
  const post = (path, body) =>
    fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });

  try {
    await once(server.stdout, 'data');
    const { cards } = await (await fetch(`${base}/due`)).json();
    const realId = cards[0]?.id ?? '0000000000';

    assert.equal((await post('/grade', 'not json')).status, 400);
    assert.equal((await post('/grade', JSON.stringify([1, 2]))).status, 400);
    assert.equal((await post('/grade', JSON.stringify({ id: realId }))).status, 400, 'missing rating');
    assert.equal((await post('/grade', JSON.stringify({ id: realId, rating: 9 }))).status, 400);
    assert.equal((await post('/grade', JSON.stringify({ id: realId, rating: 0 }))).status, 400);
    assert.equal((await post('/grade', JSON.stringify({ rating: 3 }))).status, 404, 'missing id');
    assert.equal((await post('/grade', JSON.stringify({ id: 'deadbeef99', rating: 3 }))).status, 404);
    assert.equal((await post('/delete', JSON.stringify({ id: 'nope' }))).status, 404);

    // A card id is never used as an object key before it is matched to the deck,
    // so a crafted request cannot reach Object.prototype.
    assert.equal((await post('/grade', JSON.stringify({ id: '__proto__', rating: 3 }))).status, 404);
    assert.equal((await post('/grade', JSON.stringify({ id: 'constructor', rating: 3 }))).status, 404);
    assert.equal(({}).polluted, undefined);

    const oversized = await post('/grade', JSON.stringify({ id: realId, rating: 3, pad: 'x'.repeat(200_000) }))
      .then((r) => r.status)
      .catch(() => 'connection cut');
    assert.ok(oversized === 413 || oversized === 'connection cut', `body above the cap refused: ${oversized}`);

    assert.equal((await fetch(`${base}/nope`)).status, 404);
    assert.equal((await fetch(`${base}/grade`)).status, 404, 'GET on a POST route');

    const stillAlive = await fetch(`${base}/stats`);
    assert.equal(stillAlive.status, 200, 'bad requests never take the server down');
  } finally {
    server.kill();
  }
});

test('export renders importable CSV', () => {
  const csv = run([join(HERE, 'export-anki.mjs')]);
  assert.match(csv, /1 cards/);
  const written = readFileSync(join(DATA, 'export', 'loanword.csv'), 'utf8');
  assert.match(written, /^front;back;example;tags$/m);
  assert.match(written, /cefr:B1/);
  assert.match(written, /project:api/);
  assert.equal(written.split('\n').filter(Boolean).length, 2, 'header + one surviving card');
});

test('a full queue raises the auto-build flag', () => {
  writeFileSync(join(DATA, 'queue.jsonl'), '');
  for (let i = 0; i < AUTO_BUILD_THRESHOLD; i++) {
    capture('prompt', { prompt: `hay que revertir la migración número ${i} porque el índice no se reconstruyó` });
  }
  assert.equal(queue().length, AUTO_BUILD_THRESHOLD);
  assert.equal(existsSync(join(DATA, 'pending')), false, 'only SessionEnd raises it');

  capture('session', { transcript_path: join(DATA, 'nothing.jsonl') });
  assert.equal(readFileSync(join(DATA, 'pending'), 'utf8').length > 0, true);
});

test('capture stops instead of growing an unbounded queue', () => {
  const line = JSON.stringify({ ts: '2026-01-01T00:00:00Z', source: 'prompt', lang: 'es', text: 'x'.repeat(400) });
  const bloated = `${line}\n`.repeat(Math.ceil(MAX_QUEUE_BYTES / (line.length + 1)) + 1);
  writeFileSync(join(DATA, 'queue.jsonl'), bloated);
  const before = queue().length;

  capture('prompt', { prompt: 'hay que revertir la migración porque el índice no se reconstruyó' });

  assert.equal(queue().length, before, 'nothing is appended past the cap');
  assert.match(readFileSync(join(DATA, 'log.txt'), 'utf8'), /queue above/, 'and the reason is logged');
});
