#!/usr/bin/env node

import { CEFR_LEVELS, LEECH_LAPSES } from './store-paths.mjs';
import { scriptOf } from './languages.mjs';

export const PEEK_POOLS = ['starred', 'slipping', 'leech', 'new'];
export const PEEK_ROWS = 120;
export const DEFAULT_EVERY_MINUTES = 15;
const SLIPPING_BELOW = 0.9;

const LEGACY = {
  off: [],
  hard: ['slipping'],
  starred: ['starred'],
  mixed: ['starred', 'slipping'],
};

export function parsePick(value) {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(/[,\s]+/);
  const wanted = [];
  for (const item of raw) {
    const token = String(item || '').trim();
    if (!token) continue;
    const level = token.toUpperCase();
    if (CEFR_LEVELS.includes(level)) {
      wanted.push(level);
      continue;
    }
    const pool = token.toLowerCase();
    if (PEEK_POOLS.includes(pool)) wanted.push(pool);
    else if (LEGACY[pool]) wanted.push(...LEGACY[pool]);
  }
  return [...new Set(wanted)];
}

export const peekDue = (last, now = Date.now(), everyMinutes = DEFAULT_EVERY_MINUTES) =>
  !last || now - Number(last) >= Math.max(1, everyMinutes) * 60_000;

const isSlipping = (row) => row.seen && (Number(row.r) || 0) < SLIPPING_BELOW;
const isLeech = (row) => Number(row.lapses) >= LEECH_LAPSES;

const MATCHES = {
  starred: (row) => !!row.starred,
  slipping: isSlipping,
  leech: isLeech,
  new: (row) => !row.seen,
};

export function candidates(rows, pick = []) {
  const wanted = parsePick(pick);
  const live = (Array.isArray(rows) ? rows : []).filter((row) => row && row.front && row.back);

  const levels = wanted.filter((token) => CEFR_LEVELS.includes(token));
  const pools = wanted.filter((token) => PEEK_POOLS.includes(token));

  const byLevel = levels.length ? live.filter((row) => levels.includes(row.cefr)) : live;
  if (!pools.length) return byLevel;
  return byLevel.filter((row) => pools.some((pool) => MATCHES[pool](row)));
}

export function pickPeek(rows, pick = [], random = Math.random) {
  const pool = candidates(rows, pick);
  if (!pool.length) return null;
  const ranked = [...pool].sort((a, b) => (Number(a.r) || 0) - (Number(b.r) || 0));
  const window = ranked.slice(0, Math.max(1, Math.ceil(ranked.length / 3)));
  return window[Math.floor(random() * window.length)] || null;
}

const LINE_WIDTH = 72;

export const slotNow = (intervalSeconds, now = Date.now()) =>
  Math.floor(now / (Math.max(1, Number(intervalSeconds) || 1) * 1000));

export function lineOf(rows, pick = [], { slot = 0, width = LINE_WIDTH } = {}) {
  const pool = candidates(rows, pick).sort((a, b) => (Number(a.r) || 0) - (Number(b.r) || 0));
  if (!pool.length) return '';
  const card = pool[Math.abs(Math.trunc(Number(slot) || 0)) % pool.length];
  const tail = !card.seen ? 'new' : isLeech(card) ? 'leech' : `${Math.round((Number(card.r) || 0) * 100)}%`;
  const line = [`Loanword · ${card.front} — ${card.back}`, card.reading || '', tail].filter(Boolean).join(' · ');
  const chars = [...line];
  return chars.length > width ? `${chars.slice(0, Math.max(1, width - 1)).join('')}…` : line;
}

const RULE = '─'.repeat(46);

export function renderPeek(card, cfg = {}) {
  if (!card) return '';
  const arrow = scriptOf(cfg.target) === scriptOf(cfg.native) ? '→' : '·';
  const lines = [
    `┌ Loanword ${RULE}`,
    `│ ${card.front}${card.reading ? `  [${card.reading}]` : ''}`,
    `│ ${arrow} ${card.back}`,
  ];
  if (card.example) lines.push(`│ ${String(card.example).slice(0, 90)}`);
  const tail = [];
  if (card.starred) tail.push('★');
  if (card.cefr) tail.push(card.cefr);
  if (isLeech(card)) tail.push('leech');
  if (!card.seen) tail.push('new');
  else if (Number.isFinite(Number(card.r))) tail.push(`recall ${Math.round(Number(card.r) * 100)}%`);
  lines.push(`└ ${tail.join(' · ') || 'a word you asked for'}`);
  return `${lines.join('\n')}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { config, peekFile, readJsonl } = await import('./store.mjs');
  const cfg = config();
  const flag = (process.argv.find((arg) => arg.startsWith('--pick=')) || '').split('=')[1];
  const rows = readJsonl(peekFile(cfg.target));
  if (process.argv.includes('--line')) {
    const interval = Number((process.argv.find((arg) => arg.startsWith('--interval=')) || '').split('=')[1]) || 10;
    process.stdout.write(`${lineOf(rows, flag ?? cfg.peekPick, { slot: slotNow(interval) })}\n`);
  } else {
    const card = pickPeek(rows, flag ?? cfg.peekPick);
    process.stdout.write(card ? renderPeek(card, cfg) : 'Nothing to show yet — build some cards first.\n');
  }
}
