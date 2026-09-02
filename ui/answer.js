import { scriptOf } from './languages.js';

export const TYPO_MIN_LENGTH = 5;
export const TYPO_MIN_LENGTH_DENSE = 2;
export const QUICK_MS = 5000;

const STRIPPABLE = new Set(['latin', 'greek', 'cyrillic']);
const DENSE = new Set(['cjk', 'hangul']);

const ARTICLES = {
  en: ['a', 'an', 'the', 'to'],
  es: ['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas'],
  pt: ['o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas'],
  fr: ['le', 'la', 'les', 'un', 'une', 'des', 'du', 'de'],
  de: ['der', 'die', 'das', 'ein', 'eine', 'den', 'dem', 'des'],
  it: ['il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una'],
  nl: ['de', 'het', 'een'],
  el: ['ο', 'η', 'το', 'οι', 'τα', 'ένας', 'μια', 'ένα'],
  ro: ['un', 'o', 'niste'],
  hu: ['a', 'az', 'egy'],
  ar: ['ال'],
  he: ['ה'],
  id: ['sebuah', 'para'],
};

export const articlesFor = (language) => ARTICLES[String(language || '').toLowerCase().slice(0, 2)] || [];

export const typoMinLength = (language) =>
  DENSE.has(scriptOf(language)) ? TYPO_MIN_LENGTH_DENSE : TYPO_MIN_LENGTH;

export function normalize(value, language = 'en') {
  const text = String(value ?? '');
  const folded = STRIPPABLE.has(scriptOf(language))
    ? text.normalize('NFD').replace(/\p{Diacritic}/gu, '')
    : text.normalize('NFC');
  return folded
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripArticle(value, language = 'en') {
  const articles = articlesFor(language);
  if (!articles.length) return value;
  const words = value.split(' ');
  return words.length > 1 && articles.includes(words[0]) ? words.slice(1).join(' ') : value;
}

export function editDistance(a, b, max = 2) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
      best = Math.min(best, row[j]);
    }
    if (best > max) return max + 1;
    previous = row;
  }
  return previous[b.length];
}

const bare = (value) => value.replace(/\p{M}/gu, '');

export function checkTyped(input, expected, alternatives = [], language = 'en') {
  const typed = stripArticle(normalize(input, language), language);
  if (!typed) return { correct: false, verdict: 'empty', expected };

  const targets = [expected, ...(Array.isArray(alternatives) ? alternatives : [])]
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => stripArticle(normalize(value, language), language));

  if (targets.includes(typed)) return { correct: true, verdict: 'exact', expected };

  const floor = typoMinLength(language);
  const marksMatter = !STRIPPABLE.has(scriptOf(language));
  for (const target of targets) {
    if (target.length < floor) continue;
    if (marksMatter && bare(typed) === bare(target)) continue;
    if (editDistance(typed, target, 1) <= 1) return { correct: true, verdict: 'close', expected };
  }
  return { correct: false, verdict: 'wrong', expected };
}

export function ratingFor({ correct, verdict, ms = 0 }) {
  if (!correct) return 1;
  if (verdict === 'close') return 2;
  return ms > 0 && ms < QUICK_MS ? 4 : 3;
}
