#!/usr/bin/env node

import { rmSync } from 'node:fs';
import * as db from './db.mjs';
import { askFull, brief, chunk, effortFor, heldBy, modelFor, parseCards, progressIn, repairPrompt, triage } from './build.mjs';
import { broken, reasonsOf, vet as vetCard } from './lexis.mjs';
import { config, frequentWords, log, paths, recordUsage, writeJson, writeSnapshots } from './store.mjs';
import { stemKey } from './stem.mjs';

export const BATCH_CARDS = 20;
const SAMPLE_SIZE = 20;

export const lockFile = () => paths.vetLock;
export const progressFile = () => paths.vetProgress;
export const busy = () => heldBy(lockFile(), progressFile());
export const readProgress = () => progressIn(progressFile());

function brokenOnes(cards, pair, stopWords = new Set()) {
  const items = [];
  for (const card of cards) {
    const issues = vetCard(card, pair, { stopWords, record: null });
    if (broken(issues)) items.push({ card: { ...card, n: card.id }, reasons: reasonsOf(issues), record: null });
  }
  return items;
}

export function repeatsOf(cards, lang = '') {
  const seen = new Set();
  const repeats = [];
  for (const card of cards) {
    if (!card.concept || card.type === 'letter') continue;
    const front = stemKey(card.front, lang);
    if (!front) continue;
    const key = `${card.concept} ${front}`;
    if (seen.has(key)) repeats.push(card);
    else seen.add(key);
  }
  return repeats;
}

function summaryOf(items, total, repeats = 0) {
  const byReason = {};
  for (const { reasons } of items) for (const reason of reasons) byReason[reason] = (byReason[reason] || 0) + 1;
  const samples = items.slice(0, SAMPLE_SIZE).map(({ card, reasons }) => ({ id: card.id, front: card.front, back: card.back, reasons }));
  return { total, broken: items.length, byReason, samples, repeats, repaired: 0, dropped: 0 };
}

export const report = (cards, pair, stopWords = new Set()) =>
  summaryOf(brokenOnes(cards, pair, stopWords), cards.length, repeatsOf(cards, pair.target).length);

export async function repair({ apply = false, onProgress = () => {} } = {}) {
  const cfg = config();
  const pair = { native: cfg.native, target: cfg.target };
  const deck = db.deckIdIfAny(cfg.native, cfg.target);
  const cards = deck === null ? [] : db.cardsOfDeck(deck);
  const stopWords = frequentWords(cfg.target);
  const repeats = repeatsOf(cards, pair.target);
  const gone = new Set(repeats.map((card) => card.id));
  const items = brokenOnes(cards.filter((card) => !gone.has(card.id)), pair, stopWords);
  const summary = summaryOf(items, cards.length, repeats.length);
  if (!apply) return summary;
  if (busy()) return { ...summary, skipped: 'a vet is already running' };

  let dropped = 0;
  if (repeats.length) {
    db.tx(() => {
      for (const card of repeats) {
        db.junkCard(card.id, deck, 'duplicate', card.front);
        dropped += 1;
      }
    });
    log(`vet dropped ${dropped} repeat(s)`);
    writeSnapshots(cfg.native, cfg.target, { force: true });
  }
  if (!items.length) return { ...summary, dropped };

  writeJson(lockFile(), { pid: process.pid });
  const startedAt = new Date().toISOString();
  const batches = chunk(items, BATCH_CARDS);
  const model = modelFor(cfg);
  const system = brief();
  const effort = effortFor('vet');
  let repaired = 0;
  const progress = (done, batch) => {
    writeJson(progressFile(), { total: items.length, done, batch, batches: batches.length, startedAt });
    onProgress(done, batch);
  };

  try {
    progress(0, 1);
    for (const [index, batch] of batches.entries()) {
      progress(index * BATCH_CARDS, index + 1);
      const { text, usage } = await askFull(repairPrompt(batch, pair), () => {}, { model, system, effort });
      const raw = parseCards(text);
      recordUsage({ kind: 'vet', model, effort, target: cfg.target, records: batch.length, cards: raw.length, ...usage });
      const byId = new Map(batch.map((item) => [item.card.id, item]));
      const fixed = triage(raw, [], pair, stopWords).kept.filter((card) => byId.has(card.n));
      db.tx(() => {
        for (const card of fixed) {
          db.rewriteCard(card.n, {
            front: card.front,
            back: card.back,
            example: card.example,
            keywords: Array.isArray(card.keywords) ? card.keywords : [],
          });
          repaired += 1;
        }
      });
      progress(index * BATCH_CARDS + batch.length, index + 1);
    }
    if (repaired) writeSnapshots(cfg.native, cfg.target, { force: true });
    log(
      `vet ${JSON.stringify({
        deck: `${cfg.native}>${cfg.target}`,
        total: cards.length,
        broken: summary.broken,
        repeats: repeats.length,
        repaired,
      })}`,
    );
    return { ...summary, repaired, dropped };
  } finally {
    rmSync(lockFile(), { force: true });
    rmSync(progressFile(), { force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ensureMigrated } = await import('./migrate.mjs');
  ensureMigrated();
  try {
    const out = await repair({ apply: process.argv.includes('--apply') });
    console.log(JSON.stringify(out, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
  db.close();
}
