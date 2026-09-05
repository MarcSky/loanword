export const SESSION_LENGTHS = [5, 10, 15];

export const RANGES = {
  dailyLimit: { min: 3, max: 100, fallback: 15 },
  weeklyGoal: { min: 1, max: 7, fallback: 5 },
  peekEvery: { min: 1, max: 120, fallback: 15 },
  tickerEvery: { min: 5, max: 300, fallback: 30 },
  picks: { min: 1, max: 12, fallback: 12 },
};

export const USAGE_WINDOWS = { d1: 0, d7: 6, d30: 29 };

export const MAX_CHARS = {
  field: 2000,
  topic: 24,
  sentence: 400,
  reason: 200,
  word: 48,
  context: 160,
  ipa: 80,
  failure: 160,
};

export const MAX_IDS = 200;

const whole = (value) => {
  if (value === null || value === '' || typeof value === 'boolean' || Array.isArray(value)) return undefined;
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? number : undefined;
};

export function intIn(value, range) {
  const number = whole(value);
  return number === undefined || number < range.min || number > range.max ? undefined : number;
}

export function clampInt(value, range) {
  const number = whole(value);
  return number === undefined ? undefined : Math.min(range.max, Math.max(range.min, number));
}

export function numberField(raw, range, current, settle) {
  const text = String(raw ?? '').slice(0, String(range.max).length);
  if (!settle) return { text, value: intIn(text, range) };
  const value = clampInt(text, range) ?? intIn(current, range) ?? range.fallback;
  return { text: String(value), value };
}

export const textIn = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
