#!/usr/bin/env node

import * as db from './db.mjs';
import {
  CATEGORIES,
  CEFR_LEVELS,
  appendJsonl,
  config,
  log,
  queueFile,
  readJsonl,
} from './store.mjs';
import { scriptOf } from './languages.mjs';

export const STARTER_CATEGORIES = ['everyday', 'collaboration'];
export const STARTER_LEVELS = ['A1', 'A2', 'B1'];

export function cloneRecord(card, native, now = new Date(), phraseLang = '') {
  return {
    ts: card.ts || now.toISOString(),
    project: card.project || '',
    session: '',
    source: 'clone',
    lang: native,
    text: card.back,
    phrase: card.front,
    phrase_lang: phraseLang,
    example: card.example || '',
    category: card.category || 'everyday',
    cefr: card.cefr || '',
    type: card.type === 'word' ? 'word' : 'phrase',
    starred: !!card.starred,
    origin: card.id,
  };
}

export function sourcePair(from, home) {
  const [first, second] = String(from || '')
    .toLowerCase()
    .split('>');
  return second ? { native: first, target: second } : { native: home, target: first };
}

export function copiedInto(native, to) {
  const destination = db.deckIdIfAny(native, to);
  const already = destination === null ? new Set() : db.originsOfDeck(destination);
  for (const row of readJsonl(queueFile(to))) if (typeof row.origin === 'string') already.add(row.origin);
  return already;
}

export function conceptsInto(native, to) {
  const destination = db.deckIdIfAny(native, to);
  const known = destination === null ? new Set() : db.conceptsOfDeck(destination);
  for (const row of readJsonl(queueFile(to))) {
    if (typeof row.text === 'string' && row.text) known.add(db.conceptKey(row.text));
  }
  return known;
}

export function selectForClone(cards, { categories = [], levels = [], skip = new Set(), concepts = new Set() } = {}) {
  const wantedCategory = new Set(categories.filter((key) => CATEGORIES.includes(key)));
  const wantedLevel = new Set(levels.filter((key) => CEFR_LEVELS.includes(key)));
  const taken = new Set(concepts);
  return cards.filter((card) => {
    if (skip.has(card.id)) return false;
    if (wantedCategory.size && !wantedCategory.has(card.category)) return false;
    if (wantedLevel.size && !wantedLevel.has(card.cefr)) return false;
    const concept = db.conceptKey(card.back);
    if (taken.has(concept)) return false;
    taken.add(concept);
    return true;
  });
}

export function suggestStarter({ native, target, cards }) {
  if (cards.length) return null;
  if (scriptOf(target) === scriptOf(native)) return null;
  return { categories: STARTER_CATEGORIES, levels: STARTER_LEVELS };
}

export function planClone({ native, from, to, categories = [], levels = [] } = {}) {
  const cfg = config();
  const home = native || cfg.native;
  if (!from || !to) throw new TypeError('a clone needs a source and a destination language');
  if (home === to) throw new TypeError('the language you write in cannot also be a deck you learn');

  const pair = sourcePair(from, home);
  if (!pair.target) throw new TypeError('a clone needs a source and a destination language');
  if (pair.native === home && pair.target === to) throw new TypeError('a deck cannot be cloned onto itself');

  const source = db.deckIdIfAny(pair.native, pair.target);
  if (source === null) throw new Error(`no ${pair.native}>${pair.target} deck to copy from`);

  db.deckId(home, to);
  const skip = copiedInto(home, to);
  const concepts = pair.native === home ? conceptsInto(home, to) : new Set();
  const cards = db.cardsOfDeck(source);
  const fresh = selectForClone(cards, { categories, levels, skip });
  const wanted = selectForClone(cards, { categories, levels, skip, concepts });

  const now = new Date();
  const records = wanted.map((card) => cloneRecord(card, pair.native, now, pair.target));
  if (records.length) appendJsonl(queueFile(to), records);
  log(`clone ${JSON.stringify({ from, to, queued: records.length, skipped: skip.size, concepts: concepts.size })}`);

  return {
    from,
    to,
    native: home,
    source: `${pair.native}>${pair.target}`,
    queued: records.length,
    skipped: skip.size,
    duplicates: fresh.length - wanted.length,
    pending: readJsonl(queueFile(to)).length,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const flag = (name) => (argv.find((arg) => arg.startsWith(`--${name}=`)) || '').split('=')[1] || '';
  const list = (name) => flag(name).split(',').filter(Boolean);
  const { ensureMigrated } = await import('./migrate.mjs');
  ensureMigrated();
  try {
    console.log(
      JSON.stringify(
        planClone({
          native: flag('native'),
          from: flag('from'),
          to: flag('to'),
          categories: list('category'),
          levels: list('level'),
        }),
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
  db.close();
}
