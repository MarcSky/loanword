#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isUnspaced } from './lang.mjs';
import {
  adoptQueue,
  captureTargets,
  commit,
  config,
  log,
  lockFile,
  paths,
  queueFile,
  readJsonl,
  readingWanted,
  PLUGIN_ROOT,
} from './store.mjs';

export const BATCH_RECORDS = 60;
const MODEL = 'haiku';
const BATCH_TIMEOUT_MS = 5 * 60_000;

const STALE_LOCK_MS = 30 * 60_000;

export function brief() {
  const md = readFileSync(join(PLUGIN_ROOT, 'agents', 'card-builder.md'), 'utf8');
  return md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();
}

export const chunk = (rows, size) =>
  Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, i * size + size));

export function promptFor(records, cfg) {
  return [
    brief(),
    '',
    '## This batch',
    '',
    `NATIVE = ${cfg.native}`,
    `TARGET = ${cfg.target}`,
    `LIMIT = ${records.length}`,
    `LEVEL = ${cfg.level || '(no floor)'}`,
    `READING = ${readingWanted(cfg.native, cfg.target) ? 'yes' : 'no'}`,
    `UNSPACED = ${isUnspaced(cfg.target) ? 'yes' : 'no'}`,
    '',
    'The queue records follow, one JSON object per line:',
    '',
    records.map((row) => JSON.stringify(row)).join('\n'),
  ].join('\n');
}

export function parseCards(reply) {
  const text = String(reply || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error(`no JSON array in the reply: ${text.slice(0, 200)}`);
  const cards = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(cards)) throw new Error('the reply parsed to something other than an array');
  return cards;
}

export function ask(prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p', '--model', MODEL], {
      env: { ...process.env, LOANWORD_BUILDING: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`the lexicographer did not answer within ${BATCH_TIMEOUT_MS / 60_000} min`));
    }, BATCH_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => (out += chunk));
    child.stderr.on('data', (chunk) => (err += chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new Error(`claude could not be started (${error.code || error.message})`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve(out);
      reject(new Error(`claude exited ${code}: ${err.trim().slice(0, 200)}`));
    });
    child.stdin.end(prompt);
  });
}

export function locked(target) {
  const file = target ? lockFile(target) : paths.lock;
  try {
    if (Date.now() - statSync(file).mtimeMs < STALE_LOCK_MS) return true;
  } catch {
    return false;
  }
  rmSync(file, { force: true });
  return false;
}

export function buildTargets(cfg = config()) {
  return captureTargets(cfg);
}

export function queueSizes(cfg = config()) {
  return buildTargets(cfg).map((target) => ({
    target,
    queued: readJsonl(queueFile(target)).length,
    building: locked(target),
  }));
}

export async function buildOne(target, { onBatch = () => {}, cfg = config() } = {}) {
  const pair = { ...cfg, target };
  const file = queueFile(target);
  const queue = readJsonl(file);
  if (!queue.length) return { target, batches: 0, added: 0, cards: [] };
  if (locked(target)) {
    return { target, batches: 0, added: 0, cards: [], skipped: 'a build is already running' };
  }

  writeFileSync(lockFile(target), String(process.pid));
  try {
    const batches = chunk(queue, BATCH_RECORDS);
    const cards = [];
    for (const [index, records] of batches.entries()) {
      onBatch(index + 1, batches.length, target);
      cards.push(...parseCards(await ask(promptFor(records, pair))));
    }
    const result = commit(cards, { native: cfg.native, target });
    log(
      `build ${JSON.stringify({
        target,
        records: queue.length,
        batches: batches.length,
        added: result.added,
        dropped: result.dropped,
      })}`,
    );
    return { ...result, target, batches: batches.length };
  } finally {
    rmSync(lockFile(target), { force: true });
  }
}

export async function build({ onBatch = () => {}, target = '' } = {}) {
  const cfg = config();
  adoptQueue(cfg.target);
  const targets = target ? [target] : buildTargets(cfg);
  const settled = await Promise.allSettled(targets.map((code) => buildOne(code, { onBatch, cfg })));

  const runs = [];
  const failures = [];
  for (const [index, outcome] of settled.entries()) {
    if (outcome.status === 'fulfilled') runs.push(outcome.value);
    else failures.push({ target: targets[index], error: outcome.reason?.message || String(outcome.reason) });
  }

  for (const failure of failures) log(`build failed for ${failure.target}: ${failure.error}`);

  const batches = runs.reduce((sum, run) => sum + (run.batches || 0), 0);
  return {
    runs,
    failures,
    batches,
    added: runs.reduce((sum, run) => sum + (run.added || 0), 0),
    queueCleared: runs.reduce((sum, run) => sum + (run.queueCleared || 0), 0),
    cards: runs.flatMap((run) => run.cards || []),
    skipped: !batches && runs.every((run) => run.skipped) && runs.length ? runs[0].skipped : '',
  };
}

export const buildBeforeServing = (cards, queued, env = process.env) =>
  !cards && queued > 0 && !env.LOANWORD_NO_BUILD;

export function buildInBackground() {
  const cfg = config();
  const records = buildTargets(cfg).reduce((sum, target) => sum + readJsonl(queueFile(target)).length, 0);
  if (!records) return false;
  if (buildTargets(cfg).every((target) => locked(target))) return false;
  log(`build requested for ${records} record(s)`);

  if (process.env.LOANWORD_NO_BUILD) return false;
  spawn(process.execPath, [new URL(import.meta.url).pathname], {
    env: { ...process.env, LOANWORD_BUILDING: '1' },
    stdio: 'ignore',
    detached: true,
  }).unref();
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const quiet = process.argv.includes('--quiet');
  const target = (process.argv.find((arg) => arg.startsWith('--target=')) || '').split('=')[1] || '';
  try {
    const result = await build({
      target,
      onBatch: (n, total, code) => quiet || console.log(`Reading batch ${n} of ${total} for ${code}…`),
    });
    if (result.skipped) console.log(result.skipped);
    else if (!result.batches) console.log('Nothing captured yet — work a while and come back.');
    else console.log(`${result.added} card(s) added from ${result.queueCleared} captured record(s).`);
    for (const failure of result.failures) console.error(`${failure.target}: ${failure.error}`);
  } catch (error) {
    log(`build failed: ${error?.stack || error}`);
    console.error(`Build failed, the queue is untouched: ${error.message}`);
    process.exit(1);
  }
}
