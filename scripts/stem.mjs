import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOf } from './languages.mjs';

const require = createRequire(import.meta.url);

export const VENDOR = join(dirname(fileURLToPath(import.meta.url)), 'vendor', 'snowball');

export const STEM = 4;

export const ALGORITHMS = {
  ar: 'arabic',
  da: 'danish',
  de: 'german',
  el: 'greek',
  en: 'english',
  es: 'spanish',
  fi: 'finnish',
  fr: 'french',
  hi: 'hindi',
  hu: 'hungarian',
  hy: 'armenian',
  id: 'indonesian',
  it: 'italian',
  nl: 'dutch',
  no: 'norwegian',
  pt: 'portuguese',
  ro: 'romanian',
  ru: 'russian',
  sv: 'swedish',
  tr: 'turkish',
  yi: 'yiddish',
};

export const wordsOf = (text) =>
  String(text ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

export const prefix = (word) => String(word ?? '').slice(0, STEM);

const loaded = new Map();

export function stemmerFor(lang) {
  const code = codeOf(lang);
  if (loaded.has(code)) return loaded.get(code);
  let made = null;
  if (ALGORITHMS[code] && existsSync(join(VENDOR, `${code}.js`))) {
    try {
      const Stemmer = require(join(VENDOR, `${code}.js`));
      made = new Stemmer();
    } catch {
      made = null;
    }
  }
  loaded.set(code, made);
  return made;
}

export function stem(word, lang = '') {
  const value = String(word ?? '').toLowerCase();
  if (!value) return '';
  const stemmer = stemmerFor(lang);
  if (!stemmer) return prefix(value);
  try {
    return stemmer.stemWord(value) || prefix(value);
  } catch {
    return prefix(value);
  }
}

export const stemKey = (text, lang = '') => wordsOf(text).map((word) => stem(word, lang)).join(' ');
