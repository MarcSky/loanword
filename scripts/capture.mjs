#!/usr/bin/env node

import { existsSync, statSync } from 'node:fs';
import { buildInBackground } from './build.mjs';
import { isLanguage, isUnspaced, minWordLength, scriptOf, sentences, trimToSentence } from './lang.mjs';
import { peekDue, pickPeek, renderPeek } from './peek.mjs';
import { scrub } from './scrub.mjs';
import {
  appendJsonl,
  captureTargets,
  config,
  fileSize,
  frequentWords,
  frontsFile,
  knownSnapshot,
  log,
  paths,
  peekFile,
  queueFile,
  readJsonl,
  readLines,
  readJson,
  readStdin,
  seedSettings,
  writeJson,
  adoptQueue,
  tildify,
  wildFile,
} from './store.mjs';

export const MAX_QUEUE_BYTES = 4 * 1024 * 1024;

export const MAX_TRANSCRIPT_BYTES = 32 * 1024 * 1024;
export const AUTO_BUILD_THRESHOLD = 10;
export const MAX_WORDS_PER_SESSION = 40;
export const MAX_PROMPT_CHARS = 400;
const CODE_RATIO = 0.5;
const ECHO_WEAVE_WORDS = 10;

export const MIN_PHRASE_WORDS = 3;
const MAX_ACRONYM_LENGTH = 6;

const CAPITALISES_NOUNS = new Set(['de', 'lb']);

export function stripCode(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/```[\s\S]*$/g, ' ')
    .replace(/`[^`\n]+`/g, ' ')
    .split('\n')
    .filter((line) => !/^\s*(?:[+-]{1,3}\s|@@|diff --git|[|+\-]{4,})/.test(line))
    .filter((line) => !/^\s{4,}\S/.test(line))
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

const FILENAME = new RegExp(
  String.raw`[\w./-]*\.(?:` +
    'jsonl?|jsx?|mjs|cjs|tsx?|go|py|rs|rb|java|kt|swift|php|cs|cpp|cc|hpp?|c|' +
    'css|scss|html?|xml|svg|md|ya?ml|toml|ini|cfg|conf|env|lock|sh|bash|zsh|sql|' +
    'txt|csv|tsv|log|png|jpe?g|gif|webp|ico|avif|mp[34]|wav|mov|webm|pdf|zip|tar|gz|' +
    'woff2?|ttf|otf|eot' +
    String.raw`)\b`,
  'gi',
);

export function stripFilenames(text) {
  return String(text || '')
    .replace(FILENAME, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ([,.;:!?])/g, '$1')
    .trim();
}

const IDENTIFIER_LIKE = /[\d_]|^[\p{Ll}]+[\p{Lu}]/u;
const TOKEN = /[\p{L}\p{N}_'’-]+/gu;
const APOSTROPHE = /['’]/;
const SENTENCE_BREAK = /[.!?…。！？؟।॥፡\n:;•]/;

export function codeHeavy(text) {
  const tokens = String(text || '').match(TOKEN) || [];
  if (tokens.length < 4) return false;
  const codeish = tokens.filter((token) => IDENTIFIER_LIKE.test(token) || /^[A-Z]{2,6}$/.test(token));
  return codeish.length / tokens.length > CODE_RATIO;
}

export function candidateWords(text, { language = 'en', script = scriptOf(language) } = {}) {
  const source = String(text || '');
  const min = minWordLength(script);
  const capitalisedNouns = CAPITALISES_NOUNS.has(String(language).slice(0, 2));
  const found = [];

  let cursor = 0;
  let sentenceStart = true;
  for (const match of source.matchAll(TOKEN)) {
    const token = match[0];
    if (cursor > 0) sentenceStart = SENTENCE_BREAK.test(source.slice(cursor, match.index));
    cursor = match.index + token.length;

    const trimmed = token.replace(/^[-'’]+|[-'’]+$/g, '');
    if (!trimmed || trimmed.length < min) continue;
    if (APOSTROPHE.test(trimmed)) continue;
    if (IDENTIFIER_LIKE.test(trimmed)) continue;
    if (trimmed === trimmed.toUpperCase() && trimmed.length <= MAX_ACRONYM_LENGTH && /\p{Lu}/u.test(trimmed)) continue;
    if (!sentenceStart && !capitalisedNouns && trimmed[0] !== trimmed[0].toLowerCase()) continue;

    const word = trimmed.toLowerCase();
    if (word.length >= min) found.push(word);
  }
  return found;
}

export function isDerivedFrom(word, known) {
  if (known.has(word)) return true;
  if (word.endsWith('s') && known.has(word.slice(0, -1))) return true;
  if (word.endsWith('es') && known.has(word.slice(0, -2))) return true;
  if (word.endsWith('ies') && known.has(`${word.slice(0, -3)}y`)) return true;
  return false;
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

function seenWords(target) {
  const seen = knownSnapshot(target);
  for (const row of readJsonl(queueFile(target))) {
    for (const word of row.words || []) seen.add(String(word).toLowerCase());
  }
  return seen;
}

export function capturePrompt(event, cfg, meta) {
  const raw = scrub(stripFilenames(stripCode(event.prompt)));
  if (!raw || (raw.match(/\p{L}+/gu) || []).length < MIN_PHRASE_WORDS) return null;
  if (codeHeavy(raw)) return null;
  const text = trimToSentence(raw, MAX_PROMPT_CHARS);
  if (!text) return null;
  if (!isLanguage(text, cfg.native, cfg.target)) return null;
  return { ...meta, source: 'prompt', lang: cfg.native, text };
}

export function captureSession(event, cfg, meta, cached) {
  const text = scrub(stripFilenames(stripCode(cached ?? assistantText(event.transcript_path))));
  if (!text || !isLanguage(text, cfg.target, cfg.native)) return null;

  const skip = seenWords(cfg.target);

  if (isUnspaced(cfg.target)) {
    const fresh = [];
    for (const line of sentences(text)) {
      const key = line.toLowerCase();
      if (skip.has(key)) continue;
      skip.add(key);
      fresh.push(line);
      if (fresh.length >= MIN_PHRASE_WORDS * 2) break;
    }
    return fresh.length ? { ...meta, source: 'session', lang: cfg.target, words: fresh } : null;
  }

  const frequent = frequentWords(cfg.target);
  const fresh = [];
  for (const word of candidateWords(text, { language: cfg.target })) {
    if (isDerivedFrom(word, skip) || frequent.has(word)) continue;
    skip.add(word);
    fresh.push(word);
    if (fresh.length >= MAX_WORDS_PER_SESSION) break;
  }
  return fresh.length ? { ...meta, source: 'session', lang: cfg.target, words: fresh } : null;
}

function echoWords(target, limit = ECHO_WEAVE_WORDS) {
  return readLines(frontsFile(target))
    .map((line) => {
      const [front, score] = line.split('\t');
      return { front, score: Number(score) || 0 };
    })
    .filter((row) => row.front)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((row) => row.front);
}

export function echoLine(cfg, weakest = []) {
  if (cfg.echo === 'off' || !cfg.echo) return '';
  const line =
    `Loanword echo: the user wrote the prompt in ${cfg.native} while learning ${cfg.target}. ` +
    `Open your reply with one line — "> 🗣️ <the ${cfg.target} a native speaker would have used>" — ` +
    `naming the tier if a form in it is irregular, then answer the request in full as usual.\n`;
  if (cfg.echo !== 'weave' || !weakest.length) return line;
  return (
    `${line}Then weave exactly two of these ${cfg.target} phrases into your answer where they fit naturally, ` +
    `each wrapped in **bold** the first time it appears: ${weakest.join(', ')}.\n`
  );
}

export function wildMatches(text, fronts) {
  const haystack = ` ${String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  const hits = [];
  for (const front of fronts) {
    const needle = String(front || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (needle.length < 3) continue;
    if (haystack.includes(` ${needle} `)) hits.push(front);
  }
  return hits;
}

export function peekCard(cfg, now = Date.now()) {
  if (cfg.peek !== 'on') return '';
  const state = readJson(paths.peekState, {});
  if (!peekDue(state?.last, now, cfg.peekEvery)) return '';
  const card = pickPeek(readJsonl(peekFile(cfg.target)), cfg.peekPick);
  if (!card) return '';
  writeJson(paths.peekState, { ...state, last: now, front: card.front });
  return renderPeek(card, cfg);
}

async function main(source) {
  if (process.env.LOANWORD_BUILDING) return;

  const raw = await readStdin();
  let event;
  try {
    event = JSON.parse(raw || '{}');
  } catch {
    return log(`capture(${source}): malformed hook event, ignored`);
  }
  if (!event || typeof event !== 'object') return;

  seedSettings();

  const cfg = config();
  adoptQueue(cfg.target);
  const targets = captureTargets(cfg);
  const meta = {
    ts: new Date().toISOString(),
    project: tildify(event.cwd || process.cwd()),
    session: typeof event.session_id === 'string' ? event.session_id : '',
  };

  const open = targets.filter((target) => fileSize(queueFile(target)) <= MAX_QUEUE_BYTES);
  if (!open.length) {
    return log(`capture(${source}): every queue is above ${MAX_QUEUE_BYTES} bytes, run 'loanword build'`);
  }

  let wrote = false;

  if (source === 'prompt' && cfg.mode !== 'passive') {
    for (const target of open) {
      const row = capturePrompt(event, { ...cfg, target }, meta);
      if (!row) continue;
      appendJsonl(queueFile(target), [row]);
      wrote = true;
      const hits = wildMatches(row.text, readLines(frontsFile(target)).map((line) => line.split('\t')[0]));
      if (hits.length) {
        appendJsonl(wildFile(target), hits.map((front) => ({ ts: meta.ts, front, target })));
      }
    }
    if (wrote && cfg.echo && cfg.echo !== 'off') {
      process.stdout.write(echoLine(cfg, echoWords(cfg.target)));
    }
    process.stdout.write(peekCard(cfg));
  }

  if (source === 'session' && cfg.mode !== 'active') {
    const cached = assistantText(event.transcript_path);
    for (const target of open) {
      const row = captureSession(event, { ...cfg, target }, meta, cached);
      if (!row) continue;
      appendJsonl(queueFile(target), [row]);
      wrote = true;
    }
    const queued = open.reduce((sum, target) => sum + readJsonl(queueFile(target)).length, 0);
    if (cfg.autoBuild && queued >= AUTO_BUILD_THRESHOLD) buildInBackground();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const source = (process.argv.find((arg) => arg.startsWith('--source=')) || '').split('=')[1] || 'prompt';
  try {
    await main(source);
  } catch (err) {
    log(`capture(${source}) failed: ${err?.stack || err}`);
  }
  process.exit(0);
}
