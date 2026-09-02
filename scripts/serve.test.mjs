import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVE = fileURLToPath(new URL('./serve.mjs', import.meta.url));
const DATA = mkdtempSync(join(tmpdir(), 'loanword-serve-'));

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

const isListening = (port) =>
  new Promise((resolve) => {
    const probe = createServer();
    probe.on('error', () => resolve(true));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(false)));
  });

const exited = (child, ms) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`still running after ${ms}ms — the port would have stayed open`));
    }, ms);
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });

function start(port, ...args) {
  const child = spawn(process.execPath, [SERVE, '--no-open', ...args], {
    env: { ...process.env, CLAUDE_PLUGIN_DATA: DATA, LOANWORD_PORT: String(port), LOANWORD_NO_BUILD: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const ready = new Promise((resolve, reject) => {
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
      if (out.includes('http://localhost:')) resolve(out);
    });
    child.once('exit', () => reject(new Error(`server exited before listening: ${out}`)));
  });
  return { child, ready };
}

const run = (port, ...args) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [SERVE, ...args], {
      env: { ...process.env, CLAUDE_PLUGIN_DATA: DATA, LOANWORD_PORT: String(port), LOANWORD_NO_BUILD: '1' },
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let out = '';
    child.stdout.on('data', (chunk) => (out += chunk));
    child.once('exit', () => resolve(out.trim()));
  });

test('`loanword stop` shuts the trainer down and frees the port', async () => {
  const port = await freePort();
  const { child, ready } = start(port);
  await ready;
  assert.equal(await isListening(port), true, 'precondition: the trainer holds the port');

  assert.match(await run(port, 'stop'), /stopped/);
  assert.equal(await exited(child, 5000), 0);
  assert.equal(await isListening(port), false, 'the port is released, not merely idle');
});

test('stopping nothing says so instead of failing', async () => {
  assert.match(await run(await freePort(), 'stop'), /Nothing to stop/);
});

test('an idle trainer closes itself', async () => {
  const port = await freePort();
  const { child, ready } = start(port, '--idle=0.02');
  await ready;

  assert.equal(await exited(child, 6000), 0);
  assert.equal(await isListening(port), false);
});

test('being used keeps it open — the idle clock restarts on every request', async () => {
  const port = await freePort();
  const { child, ready } = start(port, '--idle=0.03');
  await ready;

  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r, 700));
    await fetch(`http://127.0.0.1:${port}/state`);
  }
  assert.equal(child.exitCode, null, 'still serving after 2.8s of use, well past one idle window');

  assert.equal(await exited(child, 6000), 0, 'and it still goes once the use stops');
});

test('a terminated trainer releases the port rather than lingering', async () => {
  const port = await freePort();
  const { child, ready } = start(port);
  await ready;

  child.kill('SIGTERM');
  assert.equal(await exited(child, 5000), 0);
  assert.equal(await isListening(port), false);
});

test('ctrl+c closes it the same way, once, and says so', async () => {
  const port = await freePort();
  const { child, ready } = start(port);
  let out = await ready;
  child.stdout.on('data', (chunk) => (out += chunk));

  child.kill('SIGINT');
  child.kill('SIGINT');
  assert.equal(await exited(child, 5000), 0);
  assert.equal(await isListening(port), false);
  assert.equal(out.match(/closing \(SIGINT\)/g).length, 1, 'a second signal does not start a second shutdown');
  assert.match(out, /port \d+ released/);
});

test('the banner says what it serves, from where, and how to stop it', async () => {
  const port = await freePort();
  const { child, ready } = start(port, '--idle=0');
  const out = await ready;
  assert.match(out, /Loanword \d+\.\d+\.\d+/);
  assert.match(out, /deck\s+\w\w → \w\w · \d+ cards? · \d+ due/);
  assert.match(out, /stays up until you stop it/);
  assert.match(out, /loanword stop/);
  child.kill('SIGTERM');
  await exited(child, 5000);
});

test('--idle=0 opts out of the timeout for someone who wants it up all day', async () => {
  const port = await freePort();
  const { child, ready } = start(port, '--idle=0');
  await ready;

  await new Promise((r) => setTimeout(r, 1500));
  assert.equal(child.exitCode, null, 'no timer armed');

  child.kill('SIGTERM');
  await exited(child, 5000);
});

function startLan(port, ...args) {
  const child = spawn(process.execPath, [SERVE, '--no-open', '--host=lan', ...args], {
    env: { ...process.env, CLAUDE_PLUGIN_DATA: DATA, LOANWORD_PORT: String(port), LOANWORD_NO_BUILD: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const ready = new Promise((resolve, reject) => {
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
      if (/token=[0-9a-f]{32}/.test(out)) resolve(out);
    });
    child.once('exit', () => reject(new Error(`server exited before listening: ${out}`)));
  });
  return { child, ready };
}

test('without the flag the trainer is on loopback and needs no token', async () => {
  const port = await freePort();
  const { child, ready } = start(port, '--idle=0');
  const out = await ready;
  assert.doesNotMatch(out, /token=/, 'a local trainer has nothing to guard against');
  assert.equal((await fetch(`http://127.0.0.1:${port}/stats`)).status, 200);
  child.kill('SIGTERM');
  await exited(child, 5000);
});

test('over the network the trainer prints a token and refuses anything without it', async () => {
  const port = await freePort();
  const { child, ready } = startLan(port, '--idle=0');
  const out = await ready;
  const token = out.match(/token=([0-9a-f]{32})/)[1];
  const base = `http://127.0.0.1:${port}`;

  try {
    assert.equal((await fetch(`${base}/stats`)).status, 401, 'no token, no deck');
    assert.equal((await fetch(`${base}/`)).status, 401, 'not even the page itself');

    const granted = await fetch(`${base}/?token=${token}`);
    assert.equal(granted.status, 200);
    const cookie = granted.headers.get('set-cookie');
    assert.match(cookie, new RegExp(`loanword=${token}`));
    assert.match(cookie, /SameSite=Strict/);

    const withCookie = await fetch(`${base}/stats`, { headers: { cookie: `loanword=${token}` } });
    assert.equal(withCookie.status, 200, 'and the cookie carries every request after it');

    const wrong = await fetch(`${base}/stats`, { headers: { cookie: 'loanword=0'.repeat(4) } });
    assert.equal(wrong.status, 401);
  } finally {
    child.kill('SIGTERM');
    await exited(child, 5000);
  }
});

test('the shell the service worker caches is all actually served', async () => {
  const port = await freePort();
  const { child, ready } = start(port, '--idle=0');
  await ready;
  const base = `http://127.0.0.1:${port}`;
  try {
    const source = await (await fetch(`${base}/sw.js`)).text();
    const shell = [...source.matchAll(/^\s*'([^']+)',$/gm)].map((match) => match[1]);
    assert.ok(shell.length > 8, 'the worker caches a shell worth caching');
    for (const asset of shell) {
      assert.equal((await fetch(`${base}/${asset === '/' ? '' : asset}`)).status, 200, `${asset} is missing`);
    }
  } finally {
    child.kill('SIGTERM');
    await exited(child, 5000);
  }
});

test('a tidy run reports before it removes', async () => {
  const port = await freePort();
  const out = await run(port, 'tidy');
  const report = JSON.parse(out);
  assert.equal(report.removed, false);
  assert.ok(Array.isArray(report.entries));
});

test.after(() => {
  rmSync(DATA, { recursive: true, force: true });
});
