#!/usr/bin/env node


import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as db from './db.mjs';
import {
  DATA,
  cardId,
  config,
  facing,
  fallbackPair,
  normalizeCategory,
  normalizeCefr,
  paths,
  readJson,
  readJsonl,
} from './store.mjs';

const BACKUPS = join(DATA, 'backup');
const MOVED = ['cards.jsonl', 'state.json'];

export const needsMigration = () => existsSync(paths.cards) && statSync(paths.cards).size > 0;

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

export function survey() {
  const rows = readJsonl(paths.cards);
  const state = readJson(paths.state, {}) || {};
  const meta = state._meta && typeof state._meta === 'object' ? state._meta : {};
  const seen = new Set();
  const cards = [];
  for (const row of rows) {
    if (typeof row.front !== 'string' || typeof row.back !== 'string') continue;
    if (!row.front.trim() || !row.back.trim()) continue;
    const id = cardId(row);
    if (seen.has(id)) continue;
    seen.add(id);
    cards.push({ id, row });
  }
  const deleted = new Set(Array.isArray(meta.deleted) ? meta.deleted : []);
  const scheduled = cards.filter(({ id }) => state[id] && !deleted.has(id));
  const now = new Date();
  return {
    file: paths.cards,
    rows: rows.length,
    cards: cards.length,
    live: cards.filter(({ id }) => !deleted.has(id)).length,
    deleted: deleted.size,
    scheduled: scheduled.length,
    due: scheduled.filter(({ id }) => new Date(state[id].due) <= now).length,
    learned: scheduled.filter(({ id }) => (state[id].stability || 0) >= 21).length,
    favorites: (Array.isArray(meta.favorites) ? meta.favorites : []).length,
    retired: (Array.isArray(meta.retired) ? meta.retired : []).length,
    reviewDays: Object.keys(meta.reviews_by_day || {}).length,
    parsed: { cards, state, meta, deleted },
  };
}

function backup() {
  const dir = join(BACKUPS, stamp());
  mkdirSync(dir, { recursive: true });
  for (const name of MOVED) {
    const from = join(DATA, name);
    if (existsSync(from)) copyFileSync(from, join(dir, name));
  }
  return dir;
}

export function migrate({ dryRun = false } = {}) {
  if (!needsMigration()) return { migrated: false, reason: 'nothing to migrate' };

  const before = survey();
  if (dryRun) {
    const { parsed, ...report } = before;
    return { migrated: false, dryRun: true, before: report };
  }

  const dir = backup();
  const { cards, state, meta, deleted } = before.parsed;
  const legacy = fallbackPair();
  const cfg = config();

  db.tx(() => {
    const rows = [];
    const ids = [];
    for (const { id, row } of cards) {
      const native = row.native || legacy.native || cfg.native;
      const target = row.target || legacy.target || cfg.target;
      const faced = facing({ ...row, native, target });
      rows.push({
        deck_id: db.deckId(native, target),
        type: row.type === 'word' ? 'word' : 'phrase',
        front: faced.front,
        back: faced.back,
        keywords: Array.isArray(row.keywords) ? row.keywords.filter((w) => typeof w === 'string') : [],
        example: typeof row.example === 'string' ? row.example : '',
        pos: typeof row.pos === 'string' ? row.pos : '',
        cefr: normalizeCefr(row.cefr),
        note: typeof row.note === 'string' ? row.note : '',
        category: normalizeCategory(row.category),
        project: typeof row.project === 'string' ? row.project : '',
        source: typeof row.source === 'string' ? row.source : '',
        ts: typeof row.ts === 'string' ? row.ts : '',
        created_at: typeof row.ts === 'string' && row.ts ? row.ts : new Date().toISOString(),
        starred: (meta.favorites || []).includes(id),
      });
      ids.push(id);
    }
    db.insertCards(rows, ids);

    for (let i = 0; i < ids.length; i++) {
      const entry = state[ids[i]];
      if (entry && entry.due) db.saveState(ids[i], rows[i].deck_id, entry);
    }

    for (const id of deleted) {
      const index = ids.indexOf(id);
      if (index < 0) continue;
      db.junkCard(id, rows[index].deck_id, 'migrated from state.json', rows[index].front);
    }

    for (const front of meta.retired || []) if (typeof front === 'string') db.retire(front);

    const deck = db.deckId(cfg.native, cfg.target);
    const newByDay = meta.new_by_day || {};
    for (const [day, count] of Object.entries(meta.reviews_by_day || {})) {
      const total = Math.max(0, Math.min(5000, Number(count) || 0));
      const fresh = Math.max(0, Math.min(total, Number(newByDay[day]) || 0));
      for (let i = 0; i < total; i++) {
        db.run(
          `INSERT INTO reviews (card_id, deck_id, ts, day, hour, weekday, rating, mode, was_new)
           VALUES ('', ?, ?, ?, 12, ?, 0, 'migrated', ?)`,
          deck,
          `${day}T12:00:00.000Z`,
          day,
          new Date(`${day}T12:00:00`).getDay(),
          i < fresh ? 1 : 0,
        );
      }
    }
  });

  for (const name of MOVED) {
    const from = join(DATA, name);
    if (existsSync(from)) renameSync(from, `${from}.migrated`);
  }

  const after = {
    cards: db.totalCards(),
    scheduled: db.get('SELECT COUNT(*) AS n FROM fsrs_state').n,
    junk: db.get('SELECT COUNT(*) AS n FROM junk').n,
    retired: db.get('SELECT COUNT(*) AS n FROM retired').n,
    reviews: db.get('SELECT COUNT(*) AS n FROM reviews').n,
  };
  const { parsed, ...report } = before;
  return { migrated: true, backup: dir, before: report, after, ok: after.cards === before.live };
}

export function ensureMigrated() {
  if (!needsMigration()) return null;
  return migrate();
}

export function rollback() {
  if (!existsSync(BACKUPS)) return { restored: false, reason: 'no backup directory' };
  const latest = readdirSync(BACKUPS).sort().pop();
  if (!latest) return { restored: false, reason: 'no backup found' };
  const dir = join(BACKUPS, latest);
  db.close();
  for (const name of MOVED) {
    const from = join(dir, name);
    if (existsSync(from)) copyFileSync(from, join(DATA, name));
    rmSync(join(DATA, `${name}.migrated`), { force: true });
  }
  for (const suffix of ['', '-wal', '-shm']) rmSync(`${paths.db}${suffix}`, { force: true });
  return { restored: true, from: dir };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  if (argv.includes('--rollback')) console.log(JSON.stringify(rollback(), null, 2));
  else console.log(JSON.stringify(migrate({ dryRun: argv.includes('--dry-run') }), null, 2));
  db.close();
}
