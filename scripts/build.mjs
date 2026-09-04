#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isUnspaced, trimToSentence } from './lang.mjs';
import { levelFor, windowOf } from './level.mjs';
import * as speech from './speech.mjs';
import { EXAMPLE_WARNING, broken, budget, flat, reasonsOf, vet } from './lexis.mjs';
import { MAX_CHARS } from './limits.mjs';
import { scrub } from './scrub.mjs';
import { SPLIT_FLOOR, WAIT_MS, hintFor, readTuning, rememberTuning, tuneFor } from './tune.mjs';
import * as db from './db.mjs';
import {
  adoptQueue,
  captureTargets,
  commit,
  config,
  countJsonl,
  dropFromQueue,
  failedFile,
  enabledCategories,
  facing,
  frequentWords,
  log,
  lockFile,
  MODELS,
  paths,
  progressFile,
  queueFile,
  readJson,
  readJsonl,
  readingWanted,
  recordKey,
  recordUsage,
  saveKnownWords,
  sidedByRecord,
  writeJson,
  PLUGIN_ROOT,
} from './store.mjs';

export const BATCH_RECORDS = 20;
const BUILD_CONCURRENCY = Number(process.env.LOANWORD_BUILD_CONCURRENCY) || 3;
const MAX_RECORD_CHARS = 400;
const TOPICS_PER_CATEGORY = 30;
const FALLBACK_MODEL = 'sonnet';
const BATCH_TIMEOUT_MS = 5 * 60_000;

const STALE_LOCK_MS = 30 * 60_000;

const ROLES = {
  prompt: 'lexicographer',
  session: 'lexicographer',
  clone: 'cloner',
  rewrite: 'rewriter',
  alphabet: 'alphabet',
  pick: 'picker',
};

const ROLE_HEADINGS = {
  lexicographer: 'Lexicographer',
  cloner: 'Cloner',
  rewriter: 'Rewriter',
  alphabet: 'Alphabet',
  picker: 'Picker',
};

export const roleOf = (record) => ROLES[record?.source] || 'lexicographer';

const EFFORT = { alphabet: 'low', filer: 'low', sentence: 'low' };

export const effortFor = (kind) => EFFORT[kind] || 'medium';

export function brief(role = '') {
  const md = readFileSync(join(PLUGIN_ROOT, 'agents', 'card-builder.md'), 'utf8');
  const body = md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();
  const wanted = ROLE_HEADINGS[role];
  if (!wanted) return body;
  const others = Object.values(ROLE_HEADINGS).filter((heading) => heading !== wanted);
  return body
    .split(/^(?=## )/m)
    .filter((section) => !others.some((heading) => section.startsWith(`## ${heading}\n`)))
    .join('')
    .trim();
}

const TUNING_TRIES = 4;

export const chunk = (rows, size) =>
  Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, i * size + size));

export function dedupe(queue) {
  const unique = [];
  const twins = new Map();
  const seen = new Map();
  for (const row of queue) {
    const prompt = !row.source || row.source === 'prompt';
    const key = prompt && typeof row.text === 'string' ? flat(row.text) : '';
    if (key && seen.has(key)) {
      const kept = seen.get(key);
      twins.set(kept, [...(twins.get(kept) || []), row]);
      continue;
    }
    if (key) seen.set(key, row);
    unique.push(row);
  }
  const skipped = queue.length - unique.length;
  if (skipped) log(`build skipped ${skipped} repeated prompt(s)`);
  return { unique, twins, skipped };
}

function groupByRole(rows) {
  const groups = new Map();
  for (const row of rows) {
    const role = roleOf(row);
    if (!groups.has(role)) groups.set(role, []);
    groups.get(role).push(row);
  }
  return groups;
}

export function topicLines(topics = []) {
  const byCategory = new Map();
  for (const row of Array.isArray(topics) ? topics : []) {
    if (!row?.topic || !row.category) continue;
    const list = byCategory.get(row.category) || [];
    if (list.length < TOPICS_PER_CATEGORY) list.push(row.topic);
    byCategory.set(row.category, list);
  }
  if (!byCategory.size) return ['TOPICS = (none yet)'];
  return ['TOPICS =', ...[...byCategory].map(([category, list]) => `  ${category}: ${list.join(', ')}`)];
}

function recordLine(row, index) {
  const { n, ...rest } = row;
  const out = { n: Number.isInteger(n) ? n : index, ...rest };
  if (typeof out.text === 'string') out.text = trimToSentence(scrub(out.text), MAX_RECORD_CHARS);
  if (typeof out.example === 'string') out.example = scrub(out.example);
  if (Array.isArray(out.words)) out.words = out.words.map((word) => scrub(String(word)));
  return JSON.stringify(out);
}

export function promptFor(records, cfg) {
  return [
    '## This batch',
    '',
    `NATIVE = ${cfg.native}`,
    `TARGET = ${cfg.target}`,
    `CATEGORIES = ${enabledCategories(cfg).join(', ')}`,
    `LIMIT = ${budget(records)}`,
    `LEVEL = ${cfg.levelLine || cfg.level || '(no floor)'}`,
    `WINDOW = ${(cfg.window || windowOf(cfg.levelLine || cfg.level || '')).join('-')}`,
    `IPA = ${cfg.ipa ? 'yes' : 'no'}`,
    `READING = ${readingWanted(cfg.native, cfg.target) ? 'yes' : 'no'}`,
    `UNSPACED = ${isUnspaced(cfg.target) ? 'yes' : 'no'}`,
    ...topicLines(cfg.topics),
    '',
    'The queue records follow, one JSON object per line:',
    '',
    records.map(recordLine).join('\n'),
  ].join('\n');
}

const NOT_FOR_REPAIR = new Set(['native', 'target', 'record']);

export function repairPrompt(items, cfg) {
  return [
    '## Repair',
    '',
    `NATIVE = ${cfg.native}`,
    `TARGET = ${cfg.target}`,
    '',
    'These cards broke the rules named beside them. Return the same JSON array, same `n` on each card, every field present, fixed. A back is the translation equivalent in NATIVE, one to four words, never a definition. An example contains the front verbatim. Keywords are TARGET. If a card cannot be fixed, omit it.',
    '',
    ...items.map(({ card, reasons, record }) => {
      const fields = Object.fromEntries(Object.entries(card).filter(([key]) => !NOT_FOR_REPAIR.has(key)));
      return JSON.stringify({
        n: card.n,
        ...fields,
        reasons,
        record: typeof record?.text === 'string' ? trimToSentence(record.text, MAX_RECORD_CHARS) : '',
      });
    }),
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

export const MAX_CALL_USD = Number(process.env.LOANWORD_MAX_CALL_USD) || 3;

export const ARGS = {
  bare: [
    '--tools',
    '',
    '--no-session-persistence',
    '--max-turns',
    '1',
    '--bare',
    '--max-budget-usd',
    String(MAX_CALL_USD),
  ],
  lean: [
    '--tools',
    '',
    '--no-session-persistence',
    '--max-turns',
    '1',
    '--setting-sources',
    '',
    '--strict-mcp-config',
    '--mcp-config',
    '{"mcpServers":{}}',
    '--max-budget-usd',
    String(MAX_CALL_USD),
  ],
};

let helpText = null;

function claudeHelp() {
  if (helpText !== null) return helpText;
  try {
    const out = spawnSync('claude', ['--help'], { encoding: 'utf8', timeout: 10_000 });
    helpText = `${out.stdout || ''}${out.stderr || ''}`;
  } catch {
    helpText = '';
  }
  return helpText;
}

export const forgetHelp = () => {
  helpText = null;
};

export const supportsFlag = (flag) => claudeHelp().includes(flag);

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

const NO_COST = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, thinking: 0, cost: 0, ms: 0 };

export function failureOf(out) {
  for (const line of String(out).split('\n')) {
    const event = eventOf(line);
    if (event?.type !== 'result' || !event.is_error) continue;
    const named = Array.isArray(event.errors) ? event.errors.find((row) => typeof row === 'string') : '';
    const subtype = String(event.subtype || '');
    return { reason: named || (typeof event.result === 'string' ? event.result : '') || subtype, subtype };
  }
  return { reason: '', subtype: '' };
}

export function costOf(out) {
  for (const line of String(out).split('\n')) {
    const event = eventOf(line);
    if (event?.type !== 'result') continue;
    const usage = event.usage || {};
    return {
      input: Number(usage.input_tokens) || 0,
      cacheRead: Number(usage.cache_read_input_tokens) || 0,
      cacheWrite: Number(usage.cache_creation_input_tokens) || 0,
      output: Number(usage.output_tokens) || 0,
      thinking: Number(usage.output_tokens_details?.thinking_tokens) || 0,
      cost: Number(event.total_cost_usd) || 0,
      ms: Number(event.duration_ms) || 0,
    };
  }
  return { ...NO_COST };
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
      const failure = failureOf(out);
      const reason = failure.reason || err.trim();
      const error = new Error(reason ? `claude stopped: ${reason.slice(0, 200)}` : `claude exited ${code} without a word`);
      error.reason = reason;
      error.subtype = failure.subtype;
      error.stderr = err;
      reject(error);
    });
    child.stdin.end(prompt);
  });
}

export const apiKeyed = (env = process.env) => !!(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);

export const shapeUsable = (shape, env = process.env) => shape !== 'bare' || apiKeyed(env);

export const firstShape = () => {
  const remembered = readTuning().shape;
  if (remembered && shapeUsable(remembered)) return remembered;
  return apiKeyed() && supportsFlag('--bare') ? 'bare' : 'lean';
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const modelFor = (cfg = config()) => (MODELS.includes(cfg.model) ? cfg.model : FALLBACK_MODEL);

export async function askFull(prompt, onCards = () => {}, { model = modelFor(), system = '', effort = 'medium' } = {}) {
  const base = ['-p', '--model', model];
  const joined = system ? `${system}\n\n${prompt}` : prompt;
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

  const callFor = (shape) => {
    if (shape === 'plain') return { args: [...base], stdin: joined, onText: () => {} };
    if (shape === 'stream') return { args: [...base, ...STREAM_ARGS], stdin: joined, onText: watch };
    return {
      args: [...base, ...ARGS[shape], '--effort', effort, ...(system ? ['--system-prompt', system] : []), ...STREAM_ARGS],
      stdin: prompt,
      onText: watch,
    };
  };

  let shape = firstShape();
  let waited = false;
  for (let tries = 0; tries < TUNING_TRIES; tries++) {
    const call = callFor(shape);
    try {
      const out = await run(call.args, call.stdin, call.onText);
      return { text: replyText(out), usage: costOf(out) };
    } catch (error) {
      const tuned = tuneFor(error, shape);
      if (tuned.change === 'wait' && !waited) {
        waited = true;
        log(tuned.note);
        await sleep(WAIT_MS);
        continue;
      }
      if (tuned.change !== 'shape') throw error;
      log(tuned.note);
      shape = tuned.shape;
      rememberTuning({ shape });
      text = '';
      counted = 0;
    }
  }
  throw new Error('claude refused every shape of the command line');
}

export async function ask(prompt, onCards = () => {}, options = {}) {
  return (await askFull(prompt, onCards, options)).text;
}

export function triage(cards, records, pair, stopWords = new Set()) {
  const kept = [];
  const needsRepair = [];
  const rejected = [];
  for (const raw of Array.isArray(cards) ? cards : []) {
    if (!raw || typeof raw !== 'object') continue;
    const record = Number.isInteger(raw.n) ? records.find((row) => row.n === raw.n) || null : null;
    const sided = facing(sidedByRecord({ ...raw, native: pair.native, target: pair.target }, record, pair.target));
    const issues = vet(sided, pair, { stopWords, record });
    if (issues.reject) {
      rejected.push({ card: sided, reason: issues.reject });
      log(`build dropped ${issues.reject}: ${String(sided.front ?? '').slice(0, 60)}`);
    } else if (broken(issues)) needsRepair.push({ card: sided, reasons: reasonsOf(issues), record });
    else if (issues.warn.includes(EXAMPLE_WARNING)) needsRepair.push({ card: sided, reasons: issues.warn, record, soft: true });
    else kept.push(sided);
  }
  return { kept, needsRepair, rejected };
}

const replaced = (item, fixed) =>
  fixed.some(
    (card) =>
      card.n === item.card.n &&
      (flat(card.front) === flat(item.card.front) || flat(card.back) === flat(item.card.back)),
  );

async function repaired(first, records, pair, stopWords, { model, system, target }) {
  const items = first.needsRepair;
  const kept = [...first.kept];
  let rejected = first.rejected.length;
  if (!items.length) return { kept, rejected, repaired: 0 };

  let fixed = [];
  try {
    const effort = effortFor('repair');
    const { text, usage } = await askFull(repairPrompt(items, pair), () => {}, { model, system, effort });
    const raw = parseCards(text);
    recordUsage({ kind: 'repair', model, effort, target, records: items.length, cards: raw.length, ...usage });
    const second = triage(raw, records, pair, stopWords);
    fixed = [...second.kept, ...second.needsRepair.filter((item) => item.soft).map((item) => item.card)];
    rejected += second.rejected.length;
  } catch (error) {
    log(`build repair failed: ${error.message}`);
  }

  kept.push(...fixed);
  for (const item of items) {
    if (replaced(item, fixed)) continue;
    if (item.soft) kept.push(item.card);
    else {
      rejected += 1;
      log(`build dropped ${item.reasons[0]}: ${String(item.card.front ?? '').slice(0, 60)}`);
    }
  }
  log(`build repaired ${fixed.length} of ${items.length}`);
  return { kept, rejected, repaired: fixed.length };
}

export async function fillIpa(cards, target, cfg = config()) {
  if (cfg.phonetics === 'off' || !speech.ipaAvailable()) return cards;
  for (const card of cards) {
    if (card.ipa) continue;
    card.ipa = await speech.ipaOf(card.front, target);
  }
  return cards;
}

async function buildBatch({ role, records, pair, model, stopWords, target, onCards }) {
  const system = brief(role);
  const effort = effortFor(role);
  let answer;
  try {
    answer = await askFull(promptFor(records, pair), onCards, { model, system, effort });
  } catch (error) {
    const tuned = tuneFor(error);
    if (tuned.change !== 'split' || records.length < SPLIT_FLOOR) throw error;
    log(`${tuned.note} (${records.length} records)`);
    rememberTuning({ records: Math.ceil(records.length / 2) });
    const halves = [records.slice(0, Math.ceil(records.length / 2)), records.slice(Math.ceil(records.length / 2))];
    const built = [];
    for (const half of halves) {
      built.push(await buildBatch({ role, records: half, pair, model, stopWords, target, onCards }));
    }
    return {
      kept: built.flatMap((run) => run.kept),
      rejected: built.reduce((sum, run) => sum + run.rejected, 0),
      repaired: built.reduce((sum, run) => sum + run.repaired, 0),
    };
  }
  const raw = parseCards(answer.text);
  recordUsage({ kind: role, model, effort, target, records: records.length, cards: raw.length, ...answer.usage });
  const first = triage(raw, records, pair, stopWords);
  return repaired(first, records, pair, stopWords, { model, system, target });
}

export async function pool(items, limit, work) {
  let next = 0;
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++;
      await work(items[index], index);
    }
  });
  await Promise.all(lanes);
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

export const readFailure = (target) => {
  const failure = readJson(failedFile(target), null);
  return failure && typeof failure.reason === 'string' ? failure : null;
};

function rememberFailure(target, reason, records) {
  writeJson(failedFile(target), {
    target,
    reason: String(reason || '').slice(0, MAX_CHARS.failure),
    hint: hintFor(reason),
    records,
    ts: new Date().toISOString(),
  });
}

export const forgetFailure = (target) => rmSync(failedFile(target), { force: true });

export function queueSizes(cfg = config()) {
  return buildTargets(cfg).map((target) => {
    const building = locked(target);
    const progress = building ? readProgress(target) : null;
    const failure = building ? null : readFailure(target);
    return {
      target,
      queued: countJsonl(queueFile(target)),
      building,
      done: progress ? Math.min(progress.done, progress.total) : 0,
      total: progress ? progress.total : 0,
      batch: progress ? progress.batch || 0 : 0,
      batches: progress ? progress.batches || 0 : 0,
      startedAt: progress ? progress.startedAt : '',
      failed: failure ? failure.reason : '',
      hint: failure ? failure.hint || '' : '',
    };
  });
}

const previewText = (row) => {
  if (typeof row.text === 'string' && row.text.trim()) return scrub(row.text).trim();
  if (Array.isArray(row.words)) return scrub(row.words.filter((word) => typeof word === 'string').join(', '));
  if (Array.isArray(row.letters)) return row.letters.filter((letter) => typeof letter === 'string').join(' ');
  return '';
};

export function queuePreview(cfg = config()) {
  return buildTargets(cfg).map((target) => {
    const seen = new Set();
    const rows = [];
    for (const row of readJsonl(queueFile(target))) {
      const key = recordKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        key,
        source: String(row.source || 'prompt'),
        ts: String(row.ts || ''),
        project: String(row.project || ''),
        text: previewText(row),
      });
    }
    return { target, rows, queued: rows.length };
  });
}

export function dropQueued(keys, cfg = config()) {
  const wanted = new Set((Array.isArray(keys) ? keys : [keys]).filter((key) => typeof key === 'string'));
  if (!wanted.size) return { dropped: 0, stopped: 0 };
  let dropped = 0;
  let stopped = 0;
  for (const target of buildTargets(cfg)) {
    const gone = readJsonl(queueFile(target)).filter((row) => wanted.has(recordKey(row)));
    if (!gone.length) continue;
    dropped += dropFromQueue(queueFile(target), gone);
    const words = gone.flatMap((row) => (Array.isArray(row.words) ? row.words : []));
    if (words.length) {
      saveKnownWords(target, words);
      stopped += words.length;
    }
  }
  return { dropped, stopped };
}

function batchesOf(queue, size = readTuning().records || BATCH_RECORDS) {
  const { unique, twins } = dedupe(queue);
  const batches = [];
  for (const [role, rows] of groupByRole(unique)) {
    for (const records of chunk(rows, Math.max(1, Math.min(size, BATCH_RECORDS)))) {
      batches.push({
        role,
        records: records.map((row, n) => ({ ...row, n })),
        extras: records.flatMap((row) => twins.get(row) || []),
      });
    }
  }
  return batches;
}

const EMPTY_RUN = { added: 0, rewritten: 0, dropped: 0, queueCleared: 0, repaired: 0, rejected: 0, cards: [] };

export async function buildOne(target, { onBatch = () => {}, cfg = config() } = {}) {
  const pair = { ...cfg, target };
  const file = queueFile(target);
  const queue = readJsonl(file);
  if (!queue.length) return { target, batches: 0, added: 0, cards: [] };
  if (locked(target)) {
    return { target, batches: 0, added: 0, cards: [], skipped: 'a build is already running' };
  }

  writeFileSync(lockFile(target), String(process.pid));
  forgetFailure(target);
  const startedAt = new Date().toISOString();
  const batches = batchesOf(queue);
  const model = modelFor(cfg);
  const stopWords = frequentWords(target);
  const deck = db.deckIdIfAny(cfg.native, target);
  pair.topics = deck === null ? [] : db.topicsOf(deck);
  pair.levelLine = levelFor(cfg, deck === null ? null : db.abilityOf(deck));
  pair.window = windowOf(pair.levelLine);
  pair.ipa = cfg.phonetics !== 'off' && !speech.ipaAvailable();

  let done = 0;
  let started = 0;
  const report = (extra = 0) =>
    writeJson(progressFile(target), {
      target,
      total: queue.length,
      done: Math.min(queue.length, done + extra),
      batch: Math.max(1, Math.min(started, batches.length)),
      batches: batches.length,
      startedAt,
    });
  const totals = { ...EMPTY_RUN, cards: [] };
  const failures = [];

  try {
    report();
    await pool(batches, BUILD_CONCURRENCY, async ({ role, records, extras }, index) => {
      started += 1;
      onBatch(index + 1, batches.length, target);
      try {
        const built = await buildBatch({ role, records, pair, model, stopWords, target, onCards: (n) => report(n) });
        const kept = await fillIpa(built.kept, target, cfg);
        const result = commit(kept, { native: cfg.native, target, records: [...records, ...extras] });
        totals.added += result.added;
        totals.rewritten += result.rewritten;
        totals.dropped += result.dropped;
        totals.queueCleared += result.queueCleared;
        totals.repaired += built.repaired;
        totals.rejected += built.rejected;
        totals.cards.push(...result.cards);
      } catch (error) {
        failures.push(`batch ${index + 1} of ${batches.length}: ${error.message}`);
        log(`build failed for ${target}, batch ${index + 1} of ${batches.length}: ${error.message}`);
      }
      done += records.length + extras.length;
      report();
    });

    const summary = { target, records: queue.length, batches: batches.length, ...totals, cards: undefined };
    log(`build ${JSON.stringify(summary)}`);
    if (failures.length) {
      rememberFailure(target, failures[0], queue.length);
      const error = new Error(failures.join('; '));
      error.result = { ...totals, target, batches: batches.length };
      throw error;
    }
    return { ...totals, target, batches: batches.length };
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
    else {
      failures.push({ target: targets[index], error: outcome.reason?.message || String(outcome.reason) });
      if (outcome.reason?.result) runs.push({ ...outcome.reason.result, failed: true });
    }
  }

  for (const failure of failures) log(`build failed for ${failure.target}: ${failure.error}`);

  const sum = (key) => runs.reduce((total, run) => total + (run[key] || 0), 0);
  const batches = sum('batches');
  return {
    runs,
    failures,
    batches,
    added: sum('added'),
    dropped: sum('dropped'),
    repaired: sum('repaired'),
    rejected: sum('rejected'),
    queueCleared: sum('queueCleared'),
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
  const records = targets.reduce((sum, target) => sum + countJsonl(queueFile(target)), 0);
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
    else {
      console.log(`${result.added} card(s) added from ${result.queueCleared} captured record(s).`);
      if (result.repaired || result.rejected) {
        console.log(`${result.repaired} card(s) repaired, ${result.rejected} refused by the lexis gate.`);
      }
    }
    for (const failure of result.failures) console.error(`${failure.target}: ${failure.error}`);
  } catch (error) {
    log(`build failed: ${error?.stack || error}`);
    console.error(`Build failed, the queue is untouched: ${error.message}`);
    process.exit(1);
  }
}
