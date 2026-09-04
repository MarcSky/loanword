import { clozeOf } from './session.mjs';
import { scriptLetters, scriptOf } from './lang.mjs';
import { wordCount, words } from './words.mjs';

export { wordCount, words };

export const MAX_FRONT_WORDS = 4;
export const MAX_BACK_WORDS = 4;
export const PICKS_PER_PROMPT = 3;
export const BRACKETS = /[[\]{}()（）［］｛｝【】〔〕]/;

const SENTENCE_END = /[.!?…。！？؟।॥]$/u;
const OTHER_SCRIPT_TOLERANCE = 2;
const ACRONYM_LETTERS = 4;

export function budget(records) {
  let total = 0;
  for (const row of Array.isArray(records) ? records : []) {
    if (!row || typeof row !== 'object') continue;
    if (Array.isArray(row.letters)) total += row.letters.length;
    else if (Array.isArray(row.words)) total += Math.max(1, row.words.length);
    else if (row.source === 'clone' || row.source === 'rewrite' || row.source === 'pick') total += 1;
    else total += PICKS_PER_PROMPT;
  }
  return total;
}

export const flat = (text) => String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const unpunctuated = (text) => flat(text).replace(/[.!?…。！？؟।॥]+$/u, '');

export const isSentence = (text, lang) =>
  SENTENCE_END.test(String(text ?? '').trim()) || wordCount(text, lang) > MAX_BACK_WORDS;

export function writtenIn(text, language, otherLanguage) {
  const mine = scriptLetters(text, language);
  const theirs = scriptLetters(text, otherLanguage);
  return mine > 0 && (theirs <= OTHER_SCRIPT_TOLERANCE * mine || theirs <= ACRONYM_LETTERS);
}

export const EXAMPLE_WARNING = 'an example without the front in it';

export function keywordsIn(keywords, pair) {
  const list = (Array.isArray(keywords) ? keywords : []).filter((word) => typeof word === 'string');
  if (scriptOf(pair.native) === scriptOf(pair.target)) return list;
  return list.filter((word) => writtenIn(word, pair.target, pair.native));
}

export function vet(card, pair, { stopWords = new Set(), record = null } = {}) {
  const issues = { reject: '', repair: [], warn: [] };
  const front = String(card?.front ?? '').trim();
  const back = String(card?.back ?? '').trim();
  if (!front || !back) {
    issues.reject = 'an empty side';
    return issues;
  }
  if (card.type === 'letter') return issues;

  if (BRACKETS.test(front)) issues.reject = 'a bracketed front';
  else if (card.type === 'word' && stopWords.has(front.toLowerCase())) issues.reject = 'a stop-word card';
  else if (flat(front) === flat(back)) issues.reject = 'a front that is its own back';
  else if (wordCount(front, pair.target) > MAX_FRONT_WORDS || SENTENCE_END.test(front)) {
    issues.reject = 'a whole sentence on the front';
  } else if (scriptOf(pair.native) !== scriptOf(pair.target)) {
    if (!writtenIn(front, pair.target, pair.native) || !writtenIn(back, pair.native, pair.target)) {
      issues.reject = 'a side in the wrong language';
    }
  }
  if (issues.reject) return issues;

  if (wordCount(back, pair.native) > MAX_BACK_WORDS) {
    issues.repair.push('a back that reads like a definition, not the equivalent');
  }
  if (
    record?.source === 'prompt' &&
    typeof record.text === 'string' &&
    isSentence(record.text, pair.native) &&
    unpunctuated(record.text) === unpunctuated(back)
  ) {
    issues.repair.push('a back that copies the record instead of naming the meaning');
  }

  const keywords = Array.isArray(card.keywords) ? card.keywords : [];
  if (keywordsIn(keywords, pair).length < keywords.filter((word) => typeof word === 'string').length) {
    issues.warn.push('keywords in the wrong language');
  }
  const example = String(card.example ?? '').trim();
  if (example && front.length >= 2 && !clozeOf({ front, example })) {
    issues.warn.push(EXAMPLE_WARNING);
  }
  return issues;
}

export const broken = (issues) => Boolean(issues.reject) || issues.repair.length > 0;

export const reasonsOf = (issues) => [issues.reject, ...issues.repair, ...issues.warn].filter(Boolean);
