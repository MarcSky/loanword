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
  enabledCategories,
  log,
  lockFile,
  MODELS,
  paths,
  progressFile,
  queueFile,
  readJson,
  readJsonl,
  readingWanted,
  writeJson,
  PLUGIN_ROOT,
} from './store.mjs';

export const BATCH_RECORDS = 60;
const FALLBACK_MODEL = 'haiku';
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
    `CATEGORIES = ${enabledCategories(cfg).join(', ')}`,
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

export function jsonArray(reply) {
  const text = String(reply || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error(`no JSON array in the reply: ${text.slice(0, 200)}`);
  const rows = JSON.parse(text.slice(start, end + 1));
  if (!Array.isArray(rows)) throw new Error('the reply parsed to something other than an array');
  return rows;
}

export const parseCards = jsonArray;

export const STREAM_ARGS = ['--output-format', 'stream-json', '--include-partial-messages', '--verbose'];

export const cardsSoFar = (text) => (String(text).match(/"front"\s*:/g) || []).length;

const eventOf = (line) => {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
};

const deltaOf = (line) => {
  const event = eventOf(line);
  if (event?.type !== 'stream_event' || event.event?.type !== 'content_block_delta') return '';
  return event.event.delta?.text || '';
};

export function replyText(out) {
  let streamed = '';
  let finished = '';
  let assistant = '';
  for (const line of String(out).split('\n')) {
    const event = eventOf(line);
    if (!event) continue;
    if (event.type === 'stream_event') streamed += deltaOf(line);
    else if (event.type === 'result' && typeof event.result === 'string') finished = event.result;
    else if (event.type === 'assistant') {
      assistant += (event.message?.content || [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('');
    }
  }
  return streamed || finished || assistant || String(out);
}

function run(args, prompt, onText) {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, {
      env: { ...process.env, LOANWORD_BUILDING: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    let rest = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`the lexicographer did not answer within ${BATCH_TIMEOUT_MS / 60_000} min`));
    }, BATCH_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      out += chunk;
      rest += chunk;
      const lines = rest.split('\n');
      rest = lines.pop();
      for (const line of lines) onText(deltaOf(line));
    });
    child.stderr.on('data', (chunk) => (err += chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new Error(`claude could not be started (${error.code || error.message})`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve(out);
      const error = new Error(`claude exited ${code}: ${err.trim().slice(0, 200)}`);
      error.stderr = err;
      reject(error);
    });
    child.stdin.end(prompt);
  });
}

export const unknownFlag = (error) => /unknown (option|argument)|unrecognized|--include-partial-messages/i.test(error?.stderr || '');

export const modelFor = (cfg = config()) => (MODELS.includes(cfg.model) ? cfg.model : FALLBACK_MODEL);

export async function ask(prompt, onCards = () => {}) {
  const base = ['-p', '--model', modelFor()];
  let text = '';
  let counted = 0;
  const watch = (piece) => {
    if (!piece) return;
    text += piece;
    const cards = cardsSoFar(text);
    if (cards === counted) return;
    counted = cards;
    onCards(cards);
  };

  try {
    return replyText(await run([...base, ...STREAM_ARGS], prompt, watch));
  } catch (error) {
    if (!unknownFlag(error)) throw error;
    log('the lexicographer does not stream on this version; building without progress');
    return replyText(await run(base, prompt, () => {}));
  }
}

const pidIn = (file) => {
  const raw = readFileSync(file, 'utf8').trim();
  const parsed = raw.startsWith('{') ? readJson(file, {})?.pid : raw;
  return Number(parsed);
};

export const running = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
};

export function heldBy(lock, progress = '') {
  try {
    const fresh = Date.now() - statSync(lock).mtimeMs < STALE_LOCK_MS;
    if (fresh && running(pidIn(lock))) return true;
  } catch {
    return false;
  }
  rmSync(lock, { force: true });
  if (progress) rmSync(progress, { force: true });
  return false;
}

export const progressIn = (file) => {
  const seen = readJson(file, null);
  return seen && typeof seen.total === 'number' ? seen : null;
};

export const locked = (target) =>
  target ? heldBy(lockFile(target), progressFile(target)) : heldBy(paths.lock);

function buildTargets(cfg = config()) {
  return captureTargets(cfg);
}

export const readProgress = (target) => progressIn(progressFile(target));

export function queueSizes(cfg = config()) {
  return buildTargets(cfg).map((target) => {
    const building = locked(target);
    const progress = building ? readProgress(target) : null;
    return {
      target,
      queued: readJsonl(queueFile(target)).length,
      building,
      done: progress ? Math.min(progress.done, progress.total) : 0,
      total: progress ? progress.total : 0,
      batch: progress ? progress.batch || 0 : 0,
      batches: progress ? progress.batches || 0 : 0,
      startedAt: progress ? progress.startedAt : '',
    };
  });
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
  const startedAt = new Date().toISOString();
  const batches = chunk(queue, BATCH_RECORDS);
  const report = (done, batch) =>
    writeJson(progressFile(target), {
      target,
      total: queue.length,
      done,
      batch,
      batches: batches.length,
      startedAt,
    });
  try {
    const cards = [];
    report(0, 1);
    for (const [index, records] of batches.entries()) {
      onBatch(index + 1, batches.length, target);
      const built = index * BATCH_RECORDS;
      report(built, index + 1);
      cards.push(...parseCards(await ask(promptFor(records, pair), (n) => report(built + n, index + 1))));
      report(built + records.length, index + 1);
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
    rmSync(progressFile(target), { force: true });
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

export function runDetached(moduleUrl) {
  if (process.env.LOANWORD_NO_BUILD) return false;
  spawn(process.execPath, [new URL(moduleUrl).pathname], {
    env: { ...process.env, LOANWORD_BUILDING: '1' },
    stdio: 'ignore',
    detached: true,
  }).unref();
  return true;
}

export function buildInBackground() {
  const cfg = config();
  const targets = buildTargets(cfg);
  const records = targets.reduce((sum, target) => sum + readJsonl(queueFile(target)).length, 0);
  if (!records) return false;
  if (targets.every((target) => locked(target))) return false;
  log(`build requested for ${records} record(s)`);

  return runDetached(import.meta.url);
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
