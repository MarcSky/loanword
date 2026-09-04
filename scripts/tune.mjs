import { rmSync } from 'node:fs';
import { paths, readJson, writeJson } from './store.mjs';

export const SHAPES = ['bare', 'lean', 'stream', 'plain'];

const BUDGET_SUBTYPE = 'error_max_budget_usd';
export const SPLIT_FLOOR = 2;
export const WAIT_MS = 20_000;

const UNKNOWN_FLAG = /unknown (option|argument)|unrecognized|--include-partial-messages/i;
const BUSY = /rate limit|overloaded|too many requests|\b429\b|\b503\b|try again later/i;

export const HINTS = [
  ['login', /not logged in|please run \/login|unauthorized|invalid api key|\b401\b/i],
  ['credit', /credit balance|out of credit|billing|quota exceeded|insufficient/i],
];

export const hintFor = (reason) => HINTS.find(([, pattern]) => pattern.test(String(reason || '')))?.[0] || '';

const said = (error) => `${error?.reason || ''} ${error?.message || ''} ${error?.stderr || ''}`;

export const budgetStopped = (error) => error?.subtype === BUDGET_SUBTYPE || /maximum budget/i.test(said(error));

export const unknownFlag = (error) => UNKNOWN_FLAG.test(said(error));

export const saidNothing = (error) => !String(error?.reason || '').trim() && !String(error?.stderr || '').trim();

export const busy = (error) => BUSY.test(said(error));

const stay = (shape) => ({ change: 'none', shape, note: '' });

const step = (shape, why) => {
  const next = SHAPES[SHAPES.indexOf(shape) + 1];
  return next ? { change: 'shape', shape: next, note: `${why}; asking again as ${next}` } : stay(shape);
};

export function tuneFor(error, shape = 'lean') {
  if (budgetStopped(error)) return { change: 'split', shape, note: 'the call cost more than the ceiling; halving the batch' };
  if (busy(error)) return { change: 'wait', shape, note: 'the model is busy; waiting once before asking again' };
  const hint = hintFor(said(error));
  if (hint === 'login' && shape === 'bare') return step(shape, 'a bare call reads no login of its own');
  if (hint) return stay(shape);
  if (unknownFlag(error) || saidNothing(error)) return step(shape, 'the command line was refused');
  return stay(shape);
}

export const readTuning = () => {
  const stored = readJson(paths.tuning, null);
  const shape = SHAPES.includes(stored?.shape) ? stored.shape : '';
  return { shape, records: Number(stored?.records) > 0 ? Math.floor(stored.records) : 0 };
};

export function rememberTuning(patch) {
  const current = readTuning();
  const shape = SHAPES.includes(patch.shape) ? patch.shape : current.shape;
  const records = Number(patch.records) > 0 ? Math.floor(patch.records) : current.records;
  if (shape === current.shape && records === current.records) return current;
  const next = { shape, records };
  writeJson(paths.tuning, next);
  return next;
}

export const forgetTuning = () => rmSync(paths.tuning, { force: true });
