// Which language is this text in? Cheap, local, and only ever asked to choose
// between two known candidates — the user's native and target languages.

const SCRIPT_PATTERNS = {
  cyrillic: /[Ѐ-ӿ]/,
  greek: /[Ͱ-Ͽ]/,
  hebrew: /[֐-׿]/,
  arabic: /[؀-ۿ]/,
  cjk: /[぀-ヿ㐀-鿿가-힯]/,
  latin: /[A-Za-zÀ-ɏ]/,
};

const SCRIPT_BY_LANGUAGE = {
  ru: 'cyrillic', uk: 'cyrillic', be: 'cyrillic', bg: 'cyrillic', sr: 'cyrillic', mk: 'cyrillic', kk: 'cyrillic',
  el: 'greek', he: 'hebrew', ar: 'arabic', fa: 'arabic',
  ja: 'cjk', zh: 'cjk', ko: 'cjk',
};

// Latin-script pairs (es -> en, de -> en) are invisible to an alphabet check,
// so they are settled by a vote on function words instead.
const FUNCTION_WORDS = {
  en: ['the', 'and', 'that', 'with', 'this', 'for', 'you', 'not', 'have', 'are', 'was', 'but', 'can', 'from'],
  es: ['que', 'los', 'las', 'una', 'por', 'para', 'con', 'del', 'está', 'esto', 'pero', 'como', 'este', 'hay'],
  pt: ['que', 'não', 'uma', 'para', 'com', 'dos', 'das', 'está', 'isso', 'mas', 'como', 'este', 'pelo', 'são'],
  fr: ['que', 'les', 'des', 'une', 'pour', 'avec', 'dans', 'est', 'pas', 'sur', 'mais', 'cette', 'plus', 'sont'],
  it: ['che', 'non', 'per', 'con', 'una', 'del', 'della', 'sono', 'come', 'questo', 'nel', 'alla', 'più', 'anche'],
  de: ['und', 'der', 'die', 'das', 'nicht', 'ist', 'mit', 'ein', 'eine', 'für', 'auf', 'sich', 'werden', 'aber'],
  nl: ['het', 'een', 'niet', 'van', 'met', 'voor', 'dat', 'zijn', 'wordt', 'maar', 'deze', 'moet', 'naar', 'kan'],
  pl: ['nie', 'jest', 'się', 'dla', 'jak', 'tego', 'przez', 'ale', 'aby', 'czy', 'oraz', 'tym', 'może', 'żeby'],
};

const MIN_LETTERS = 8;
const MIN_TOKENS = 4;
const SCRIPT_MAJORITY = 0.6;

export const scriptOf = (language) => SCRIPT_BY_LANGUAGE[code(language)] || 'latin';

function code(language) {
  return String(language || '').toLowerCase().slice(0, 2);
}

/** Share of letters belonging to `script`, or 0 when there is too little text to judge. */
export function scriptRatio(text, script) {
  const pattern = SCRIPT_PATTERNS[script];
  if (!pattern) return 0;
  const letters = String(text || '').match(/\p{L}/gu) || [];
  if (letters.length < MIN_LETTERS) return 0;
  return letters.filter((letter) => pattern.test(letter)).length / letters.length;
}

/** Is `text` written in `language` rather than in `otherLanguage`? */
export function isLanguage(text, language, otherLanguage) {
  if (typeof text !== 'string' || !text) return false;

  const script = scriptOf(language);
  if (script !== scriptOf(otherLanguage)) return scriptRatio(text, script) > SCRIPT_MAJORITY;

  const mine = FUNCTION_WORDS[code(language)];
  const theirs = FUNCTION_WORDS[code(otherLanguage)];
  if (!mine || !theirs) return scriptRatio(text, script) > SCRIPT_MAJORITY;

  const tokens = new Set(text.toLowerCase().match(/\p{L}+/gu) || []);
  if (tokens.size < MIN_TOKENS) return false;
  const votes = (list) => list.filter((word) => tokens.has(word)).length;
  return votes(mine) > votes(theirs);
}
