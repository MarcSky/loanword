import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGIN_ROOT =
  process.env.CLAUDE_PLUGIN_ROOT || dirname(dirname(fileURLToPath(import.meta.url)));

export function resolveData(env = process.env, root = PLUGIN_ROOT, home = homedir()) {
  if (env.CLAUDE_PLUGIN_DATA) return env.CLAUDE_PLUGIN_DATA;

  const store = join(home, '.claude', 'plugins', 'data');
  const parts = root.split(/[/\\]/).filter(Boolean);
  const cache = parts.lastIndexOf('cache');
  if (cache >= 0 && parts.length >= cache + 4) {
    const id = `${parts[cache + 2]}-${parts[cache + 1]}`;
    return join(store, id.replace(/[^\w-]/g, '-'));
  }

  const decks = decksOnDisk(store);
  return decks.length === 1 ? decks[0] : join(store, 'loanword');
}

export function decksOnDisk(store = join(homedir(), '.claude', 'plugins', 'data')) {
  try {
    return readdirSync(store)
      .filter((name) => /^loanword(-[\w-]+)?$/.test(name))
      .map((name) => join(store, name))
      .filter((dir) => existsSync(join(dir, 'cards.jsonl')) || existsSync(join(dir, 'loanword.db')))
      .sort();
  } catch {
    return [];
  }
}

export const DATA = resolveData();

export const paths = {
  queue: join(DATA, 'queue.jsonl'),
  cards: join(DATA, 'cards.jsonl'),
  state: join(DATA, 'state.json'),
  known: join(DATA, 'known_words.json'),
  settings: join(DATA, 'settings.json'),
  log: join(DATA, 'log.txt'),
  logRotated: join(DATA, 'log.txt.1'),
  lock: join(DATA, 'build.lock'),
  filingLock: join(DATA, 'categories.lock'),
  filingProgress: join(DATA, 'categories.progress'),
  usage: join(DATA, 'usage.jsonl'),
  vetLock: join(DATA, 'vet.lock'),
  vetProgress: join(DATA, 'vet.progress'),
  db: join(DATA, 'loanword.db'),
  pending: join(DATA, 'pending'),
  peekState: join(DATA, 'peek.json'),
  tuning: join(DATA, 'tuning.json'),
  backups: join(DATA, 'backup'),
  audio: join(DATA, 'audio'),
  exportCsv: join(DATA, 'export', 'loanword.csv'),
};

const safe = (code) => String(code || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 2) || 'xx';

export const LEECH_LAPSES = 6;

export const queueFile = (target) => join(DATA, `queue.${safe(target)}.jsonl`);
export const lockFile = (target) => join(DATA, `build.${safe(target)}.lock`);
export const progressFile = (target) => join(DATA, `build.${safe(target)}.progress`);
export const failedFile = (target) => join(DATA, `build.${safe(target)}.failed`);
export const knownFile = (target) => join(DATA, `known.${safe(target)}.txt`);
export const frontsFile = (target) => join(DATA, `fronts.${safe(target)}.txt`);
export const wildFile = (target) => join(DATA, `wild.${safe(target)}.jsonl`);
export const peekFile = (target) => join(DATA, `peek.${safe(target)}.jsonl`);

export function frequentWords(language) {
  const file = join(PLUGIN_ROOT, 'data', 'freq', `${String(language || '').toLowerCase().slice(0, 2)}.txt`);
  if (!existsSync(file)) return new Set();
  return new Set(
    readFileSync(file, 'utf8')
      .split('\n')
      .map((word) => word.trim().toLowerCase())
      .filter(Boolean),
  );
}

export { ALL_CATEGORIES as CATEGORIES } from './categories.mjs';

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
