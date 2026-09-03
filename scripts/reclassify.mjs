#!/usr/bin/env node

import { rmSync } from 'node:fs';
import * as db from './db.mjs';
import { ask, chunk, heldBy, jsonArray, progressIn, runDetached } from './build.mjs';
import { ALL_CATEGORIES } from './categories.mjs';
import { config, enabledCategories, log, paths, writeJson } from './store.mjs';

export const BATCH_CARDS = 60;

export const lockFile = () => paths.filingLock;
export const progressFile = () => paths.filingProgress;

export const busy = () => heldBy(lockFile(), progressFile());

export const readProgress = () => progressIn(progressFile());

export function promptFor(cards, cfg) {
  const allowed = enabledCategories(cfg);
  return [
    `You are filing vocabulary cards for a learner who writes ${cfg.native} and is learning ${cfg.target}.`,
    `Give each card the one category it belongs under, from exactly this list: ${allowed.join(', ')}.`,
    'Use the keys as written. Never invent a key, translate one, or return one that is not on the list.',
    '`phrasing` is for set phrases and idioms whose meaning is not the sum of their words.',
    '`connectors` is for discourse glue. `everyday` is the fallback when nothing else fits — prefer it to forcing a fit.',
    '',
    'Reply with STRICTLY a JSON array and nothing else, one object per card:',
    '[{"id":"the id you were given","category":"one key from the list"}]',
    '',
    'The cards follow, one JSON object per line:',
    '',
    ...cards.map((card) =>
      JSON.stringify({ id: card.id, front: card.front, back: card.back, example: card.example || '' }),
    ),
  ].join('\n');
}

export function acceptedFilings(rows, cards, allowed) {
  const known = new Map(cards.map((card) => [card.id, card]));
  const offered = new Set(allowed);
  const out = [];
  const seen = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = typeof row?.id === 'string' ? row.id : '';
    const category = typeof row?.category === 'string' ? row.category.toLowerCase().trim() : '';
    if (!known.has(id) || seen.has(id)) continue;
    if (!offered.has(category) || !ALL_CATEGORIES.includes(category)) continue;
    seen.add(id);
    if (known.get(id).category !== category) out.push({ id, category });
  }
  return out;
}

export async function reclassify({ onProgress = () => {} } = {}) {
  const cfg = config();
  const deck = db.deckIdIfAny(cfg.native, cfg.target);
  if (deck === null) return { moved: 0, total: 0, batches: 0 };
  const cards = db.cardsOfDeck(deck);
  if (!cards.length) return { moved: 0, total: 0, batches: 0 };
  if (busy()) return { moved: 0, total: cards.length, batches: 0, skipped: 'a rebuild is already running' };

  writeJson(lockFile(), { pid: process.pid });
  const startedAt = new Date().toISOString();
  const batches = chunk(cards, BATCH_CARDS);
  const allowed = enabledCategories(cfg);
  const report = (done, batch) => {
    writeJson(progressFile(), { total: cards.length, done, batch, batches: batches.length, startedAt });
    onProgress(done, batch);
  };

  try {
    let moved = 0;
    report(0, 1);
    for (const [index, batch] of batches.entries()) {
      const done = index * BATCH_CARDS;
      report(done, index + 1);
      const filings = acceptedFilings(jsonArray(await ask(promptFor(batch, cfg))), batch, allowed);
      db.tx(() => {
        for (const { id, category } of filings) db.setCategory(id, category);
      });
      moved += filings.length;
      report(done + batch.length, index + 1);
    }
    log(`categories rebuilt ${JSON.stringify({ deck: `${cfg.native}>${cfg.target}`, cards: cards.length, moved })}`);
    return { moved, total: cards.length, batches: batches.length };
  } finally {
    rmSync(lockFile(), { force: true });
    rmSync(progressFile(), { force: true });
  }
}

export function rebuildInBackground() {
  return busy() ? false : runDetached(import.meta.url);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ensureMigrated } = await import('./migrate.mjs');
  ensureMigrated();
  try {
    const out = await reclassify({
      onProgress: (done, batch) => console.log(`Filing card ${done} of the deck, batch ${batch}…`),
    });
    console.log(`${out.moved} card(s) moved to another category.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
  db.close();
}
