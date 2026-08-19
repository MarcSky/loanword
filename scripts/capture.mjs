#!/usr/bin/env node
// Hook script: collects raw material only. No network, no model. Always exits 0.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isLanguage } from './lang.mjs';
import { scrub } from './scrub.mjs';
import {
  appendJsonl,
  config,
  fileSize,
  knownWords,
  log,
  paths,
  PLUGIN_ROOT,
  readJsonl,
  readStdin,
  tildify,
} from './store.mjs';

// A queue this large means the user has not run build in a very long time.
// Capturing more would grow a file nobody reads, so capture stops instead.
export const MAX_QUEUE_BYTES = 4 * 1024 * 1024;
// A transcript this large cannot be parsed inside the SessionEnd budget.
export const MAX_TRANSCRIPT_BYTES = 32 * 1024 * 1024;
export const AUTO_BUILD_THRESHOLD = 10;
export const MAX_WORDS_PER_SESSION = 40;
const MIN_WORD_LENGTH = 4;
const MAX_ACRONYM_LENGTH = 6;

/** Code never reaches the queue, so it can never reach the model. */
export function stripCode(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/```[\s\S]*$/g, ' ')
    .replace(/`[^`\n]+`/g, ' ')
    .split('\n')
    .filter((line) => !/^\s*(?:[+-]{1,3}\s|@@|diff --git|[|+\-]{4,})/.test(line))
    .filter((line) => !/^\s{4,}\S/.test(line))
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean) // lines that held nothing but code leave no empty gap
    .join('\n');
}

const IDENTIFIER_LIKE = /[\d_]|^[a-z]+[A-Z]/;

/** Words worth showing a lexicographer: no identifiers, no numbers, no acronyms. */
export function candidateWords(text) {
  const found = [];
  for (const token of String(text || '').match(/[\p{L}\p{N}_'’-]+/gu) || []) {
    if (token.length < MIN_WORD_LENGTH || IDENTIFIER_LIKE.test(token)) continue;
    if (token === token.toUpperCase() && token.length <= MAX_ACRONYM_LENGTH) continue;
    const word = token.toLowerCase().replace(/^[-']+|[-']+$/g, '');
    if (word.length >= MIN_WORD_LENGTH) found.push(word);
  }
  return found;
}

export function frequentWords(language) {
  const file = join(PLUGIN_ROOT, 'data', 'freq', `${String(language).slice(0, 2)}.txt`);
  if (!existsSync(file)) return new Set();
  return new Set(
    readFileSync(file, 'utf8')
      .split('\n')
      .map((word) => word.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function assistantText(transcriptPath) {
  if (!transcriptPath || typeof transcriptPath !== 'string' || !existsSync(transcriptPath)) return '';
  if (!statSync(transcriptPath).isFile()) return '';
  if (statSync(transcriptPath).size > MAX_TRANSCRIPT_BYTES) return '';
  const chunks = [];
  for (const row of readJsonl(transcriptPath)) {
    const content = row?.message?.content;
    if (row?.type !== 'assistant' || !Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type === 'text' && typeof block.text === 'string') chunks.push(block.text);
    }
  }
  return chunks.join('\n');
}

/** Words already captured or already learned, so nothing is queued twice. */
function seenWords() {
  const seen = knownWords();
  for (const row of readJsonl(paths.queue)) {
    for (const word of row.words || []) seen.add(String(word).toLowerCase());
  }
  return seen;
}

export function capturePrompt(event, cfg, meta) {
  const text = scrub(stripCode(event.prompt));
  if (!text || !isLanguage(text, cfg.native, cfg.target)) return null;
  return { ...meta, source: 'prompt', lang: cfg.native, text };
}

export function captureSession(event, cfg, meta) {
  const text = scrub(stripCode(assistantText(event.transcript_path)));
  if (!text || !isLanguage(text, cfg.target, cfg.native)) return null;

  // Only lemma candidates are stored, never the sentence they came from.
  const skip = seenWords();
  const frequent = frequentWords(cfg.target);
  const fresh = [];
  for (const word of candidateWords(text)) {
    if (skip.has(word) || frequent.has(word)) continue;
    skip.add(word);
    fresh.push(word);
    if (fresh.length >= MAX_WORDS_PER_SESSION) break;
  }
  return fresh.length ? { ...meta, source: 'session', lang: cfg.target, words: fresh } : null;
}

async function main(source) {
  const raw = await readStdin();
  let event;
  try {
    event = JSON.parse(raw || '{}');
  } catch {
    return log(`capture(${source}): malformed hook event, ignored`);
  }
  if (!event || typeof event !== 'object') return;

  const cfg = config();
  const meta = {
    ts: new Date().toISOString(),
    project: tildify(event.cwd || process.cwd()),
    session: typeof event.session_id === 'string' ? event.session_id : '',
  };

  if (fileSize(paths.queue) > MAX_QUEUE_BYTES) {
    return log(`capture(${source}): queue above ${MAX_QUEUE_BYTES} bytes, run /loanword:build`);
  }

  const row =
    source === 'prompt' && cfg.mode !== 'passive'
      ? capturePrompt(event, cfg, meta)
      : source === 'session' && cfg.mode !== 'active'
        ? captureSession(event, cfg, meta)
        : null;

  if (row) appendJsonl(paths.queue, [row]);

  // A flag for the build skill, rather than invoking a model from a hook.
  if (source === 'session' && cfg.autoBuild && readJsonl(paths.queue).length >= AUTO_BUILD_THRESHOLD) {
    writeFileSync(paths.pending, meta.ts);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const source = (process.argv.find((arg) => arg.startsWith('--source=')) || '').split('=')[1] || 'prompt';
  try {
    await main(source);
  } catch (err) {
    log(`capture(${source}) failed: ${err?.stack || err}`);
  }
  process.exit(0); // a broken hook must never break the user's session
}
