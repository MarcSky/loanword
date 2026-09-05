import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, rmSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = mkdtempSync(join(tmpdir(), 'loanword-test-'));
const PROJECT = join(homedir(), 'api');

const env = {
  ...process.env,
  CLAUDE_PLUGIN_DATA: DATA,
  CLAUDE_PLUGIN_ROOT: dirname(HERE),
  CLAUDE_PLUGIN_OPTION_NATIVE_LANG: 'es',
  CLAUDE_PLUGIN_OPTION_TARGET_LANG: 'en',
  CLAUDE_PLUGIN_OPTION_MODE: 'both',
  CLAUDE_PLUGIN_OPTION_DAILY_LIMIT: '15',
  LOANWORD_NO_BUILD: '1',
};

const { AUTO_BUILD_THRESHOLD, MAX_QUEUE_BYTES } = await import('./capture.mjs');

const run = (args, stdin = '', extraEnv = {}) =>
  execFileSync('node', args, { env: { ...env, ...extraEnv }, input: stdin, encoding: 'utf8' });

const capture = (source, event, extraEnv = {}) =>
  run([join(HERE, 'capture.mjs'), `--source=${source}`], JSON.stringify(event), extraEnv);

const queueOf = (target = 'en') => {
  const file = join(DATA, `queue.${target}.jsonl`);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
};

const queue = () => queueOf('en');

const fileSizeOf = (file) => {
  try {
    return statSync(file).size;
  } catch {
    return 0;
  }
};

const deck = () =>
  JSON.parse(
    run([
      '-e',
      `import(${JSON.stringify(join(HERE, 'db.mjs'))}).then((db) => { console.log(JSON.stringify(db.allLiveCards())); db.close(); })`,
    ]),
  );

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
      n: 0,
      type: 'phrase',
      front: 'roll back the migration',
      back: 'revertir la migración',
      keywords: ['roll back'],
      example: 'We need to roll back the migration before the index finishes rebuilding.',
      pos: 'verb',
      cefr: 'B1',
    },
    {
      n: 2,
      type: 'word',
      front: 'reconciliation',
      back: 'conciliación',
      example: 'The reconciliation loop retries.',
      cefr: 'B2',
    },
  ];
  const out = JSON.parse(run([join(HERE, 'store.mjs'), 'commit'], JSON.stringify(cards)));
  assert.equal(out.added, 2);
  assert.equal(queue().length, 0);

  const written = deck();
  assert.ok(written.every((card) => card.project === '~/api'), 'each card carries where it came from, by record number');
  assert.ok(written.every((card) => !card.source.includes('AKIAIOSFODNN7EXAMPLE')), 'and the scrubbed text is what is kept');
  assert.ok(written[0].ts);

  assert.equal(written[0].target, 'en', 'the card records which deck it belongs to');
  assert.equal(written[0].native, 'es');
  assert.ok(existsSync(join(DATA, 'loanword.db')), 'the deck lives in SQLite');
  assert.ok(!existsSync(join(DATA, 'cards.jsonl')), 'and nothing writes the old JSONL any more');

  const known = readFileSync(join(DATA, 'known.en.txt'), 'utf8').split('\n').filter(Boolean);
  assert.ok(known.includes('reconciliation'), 'committed words are never re-captured');
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

test('brand-new cards wait to be learned; nothing is due before that', () => {
  assert.equal(stats().total, 2);
  assert.equal(stats().due_now, 0);
  assert.equal(stats().streak, 0);
});

test('grading schedules the card into the future and counts the streak', async () => {
  const port = 14747;
  const server = spawn('node', [join(HERE, 'serve.mjs')], { env: { ...env, LOANWORD_PORT: String(port) } });
  const base = `http://127.0.0.1:${port}`;
  try {
    await once(server.stdout, 'data');

    const { cards } = await (await fetch(`${base}/state`)).json();
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
  assert.match(written, /^front;back;reading;example;tags$/m);
  assert.match(written, /cefr:B1/);
  assert.match(written, /project:api/);
  assert.equal(written.split('\n').filter(Boolean).length, 2, 'header + one surviving card');
});

test('a full queue asks for a build when the session ends, but only if the learner asked for that', () => {
  writeFileSync(join(DATA, 'queue.en.jsonl'), '');
  writeFileSync(join(DATA, 'log.txt'), '');
  for (let i = 0; i < AUTO_BUILD_THRESHOLD; i++) {
    capture('prompt', { prompt: `hay que revertir la migración número ${i} porque el índice no se reconstruyó` });
  }
  assert.equal(queue().length, AUTO_BUILD_THRESHOLD);
  const log = () => readFileSync(join(DATA, 'log.txt'), 'utf8');
  assert.doesNotMatch(log(), /build requested/, 'a prompt on its own never starts one');

  capture('session', { transcript_path: join(DATA, 'nothing.jsonl') });
  assert.doesNotMatch(log(), /build requested/, 'and the switch is off until the learner turns it on');

  capture('session', { transcript_path: join(DATA, 'nothing.jsonl') }, { CLAUDE_PLUGIN_OPTION_AUTO_BUILD: 'true' });
  assert.match(log(), /build requested for 10 record\(s\)/);
});

test('the builder\'s own session is not captured, or it would feed on itself', () => {
  writeFileSync(join(DATA, 'queue.en.jsonl'), '');
  capture('prompt', { prompt: 'hay que revertir la migración porque el índice no se reconstruyó' }, {
    LOANWORD_BUILDING: '1',
  });
  assert.equal(queue().length, 0);
});

test('capture stops instead of growing an unbounded queue', () => {
  const line = JSON.stringify({ ts: '2026-01-01T00:00:00Z', source: 'prompt', lang: 'es', text: 'x'.repeat(400) });
  const bloated = `${line}\n`.repeat(Math.ceil(MAX_QUEUE_BYTES / (line.length + 1)) + 1);
  writeFileSync(join(DATA, 'queue.en.jsonl'), bloated);
  const before = queue().length;

  capture('prompt', { prompt: 'hay que revertir la migración porque el índice no se reconstruyó' });

  assert.equal(queue().length, before, 'nothing is appended past the cap');
  assert.match(readFileSync(join(DATA, 'log.txt'), 'utf8'), /every queue is above/, 'and the reason is logged');
});

test('a legacy single queue is carried into the open deck without losing a record', () => {
  writeFileSync(join(DATA, 'queue.en.jsonl'), '');
  const legacy = { ts: '2026-01-01T00:00:00Z', source: 'prompt', lang: 'es', text: 'una frase heredada del viejo formato' };
  writeFileSync(join(DATA, 'queue.jsonl'), `${JSON.stringify(legacy)}\n`);

  capture('prompt', { prompt: 'hay que revertir la migración porque el índice no se reconstruyó' });

  const rows = queue();
  assert.ok(rows.some((row) => row.text === legacy.text), 'the old record is still there');
  assert.equal(existsSync(join(DATA, 'queue.jsonl')), false, 'and the old file is renamed aside');
  assert.ok(existsSync(join(DATA, 'queue.jsonl.migrated')));
});

test('one prompt lands in every language being captured', () => {
  writeFileSync(join(DATA, 'queue.en.jsonl'), '');
  rmSync(join(DATA, 'queue.ka.jsonl'), { force: true });
  const settings = join(DATA, 'settings.json');
  const stored = JSON.parse(readFileSync(settings, 'utf8'));
  writeFileSync(settings, JSON.stringify({ ...stored, targets: ['en', 'ka'] }));

  capture('prompt', { prompt: 'hay que revertir la migración porque el índice no se reconstruyó' });

  assert.equal(queueOf('en').length, 1);
  assert.equal(queueOf('ka').length, 1, 'the same prompt is worth a card in both languages');

  writeFileSync(settings, JSON.stringify(stored));
});

test('a Georgian reply is captured as Georgian, an English one is not', () => {
  const settings = join(DATA, 'settings.json');
  const stored = JSON.parse(readFileSync(settings, 'utf8'));
  writeFileSync(settings, JSON.stringify({ ...stored, native: 'ru', target: 'ka', targets: ['ka'] }));
  rmSync(join(DATA, 'queue.ka.jsonl'), { force: true });

  const georgian = join(DATA, 'ka.jsonl');
  const say = (text) =>
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } });

  writeFileSync(
    georgian,
    say('მიგრაციის დაბრუნება საჭიროა მანამ, სანამ ინდექსი თავიდან არ აშენდება სრულად.'),
  );
  capture('session', { transcript_path: georgian });
  const rows = queueOf('ka');
  assert.equal(rows.length, 1, 'Georgian text is Georgian');
  assert.ok(rows[0].words.some((word) => /\p{Script=Georgian}/u.test(word)), `got ${rows[0].words}`);

  writeFileSync(georgian, say('The deployment keeps stalling because the reconciliation loop never converges.'));
  capture('session', { transcript_path: georgian });
  assert.equal(queueOf('ka').length, 1, 'an English reply is not Georgian, whatever the deck says');

  writeFileSync(settings, JSON.stringify(stored));
  rmSync(join(DATA, 'queue.ka.jsonl'), { force: true });
});

test('the echo weave asks for the weakest words and stays within the hook budget', () => {
  const settings = join(DATA, 'settings.json');
  const stored = JSON.parse(readFileSync(settings, 'utf8'));
  writeFileSync(settings, JSON.stringify({ ...stored, echo: 'weave' }));
  const weak = Array.from({ length: 12 }, (_, index) => `weak ${index}\t0.${String(index + 10)}`);
  writeFileSync(join(DATA, 'fronts.en.txt'), `${['roll back\t0.05', ...weak, 'ship it\t0.98'].join('\n')}\n`);

  const started = Date.now();
  const out = capture('prompt', { prompt: 'hay que revertir la migración porque el índice no se reconstruyó' });
  const spent = Date.now() - started;

  assert.match(out, /Loanword echo/);
  assert.ok(out.includes('roll back'), 'the weakest front is named first');
  assert.equal(out.match(/weak \d+/g).length, 9, 'ten fronts in all, never the whole deck');
  assert.ok(!out.includes('ship it'), 'a card that is holding is not worth a line');
  assert.ok(spent < 8000, `the hook took ${spent}ms, and it gets ten seconds`);

  writeFileSync(settings, JSON.stringify(stored));
});

test('the capture hook never opens the database', () => {
  const bare = mkdtempSync(join(tmpdir(), 'loanword-hook-'));
  capture('prompt', { prompt: 'hay que revertir la migración porque el índice no se reconstruyó' }, {
    CLAUDE_PLUGIN_DATA: bare,
  });
  assert.ok(existsSync(join(bare, 'queue.en.jsonl')), 'the prompt was captured');
  for (const name of ['loanword.db', 'loanword.db-wal', 'loanword.db-shm']) {
    assert.equal(existsSync(join(bare, name)), false, `the hook touched ${name}`);
  }
  rmSync(bare, { recursive: true, force: true });
});

test('a word used in a real prompt is counted as a review, once a day', async () => {
  writeFileSync(join(DATA, 'queue.en.jsonl'), '');
  const port = 14749;
  const server = spawn('node', [join(HERE, 'serve.mjs')], { env: { ...env, LOANWORD_PORT: String(port) } });
  const base = `http://127.0.0.1:${port}`;
  try {
    await once(server.stdout, 'data');
    const state = await (await fetch(`${base}/state`)).json();
    const card = state.cards[0];
    assert.ok(card, 'there is a card to use at work');

    await fetch(`${base}/grade`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: card.id, rating: 3 }),
    });

    const fronts = readFileSync(join(DATA, 'fronts.en.txt'), 'utf8').split('\n').filter(Boolean);
    assert.ok(fronts.some((line) => line.startsWith(card.front)), 'a reviewed card is in the snapshot');
    assert.match(fronts[0], /\t\d\.\d+$/, 'and carries how well it is remembered');

    capture('prompt', { prompt: `creo que hay que ${card.front} la migración antes del despliegue` });
    const wild = readFileSync(join(DATA, 'wild.en.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse);
    assert.equal(wild.length, 1);
    assert.equal(wild[0].front, card.front);

    const after = await (await fetch(`${base}/state`)).json();
    assert.equal(fileSizeOf(join(DATA, 'wild.en.jsonl')), 0, 'the file is drained once it is read');
    assert.ok(after.stats.wild_7 >= 1, 'and the week counts it');

    capture('prompt', { prompt: `otra vez hay que ${card.front} la migración antes del despliegue` });
    await (await fetch(`${base}/state`)).json();
    const second = await (await fetch(`${base}/state`)).json();
    assert.equal(second.stats.wild_7, 1, 'the same card is not counted twice in a day');
  } finally {
    server.kill();
  }
});

test.after(() => {
  rmSync(DATA, { recursive: true, force: true });
});
