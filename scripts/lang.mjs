import { codeOf, isUnspaced, scriptOf } from './languages.mjs';

const SCRIPT_PATTERNS = {
  latin: /\p{Script=Latin}/u,
  cyrillic: /\p{Script=Cyrillic}/u,
  greek: /\p{Script=Greek}/u,
  hebrew: /\p{Script=Hebrew}/u,
  arabic: /\p{Script=Arabic}/u,
  devanagari: /\p{Script=Devanagari}/u,
  bengali: /\p{Script=Bengali}/u,
  thai: /\p{Script=Thai}/u,
  georgian: /\p{Script=Georgian}/u,
  armenian: /\p{Script=Armenian}/u,
  ethiopic: /\p{Script=Ethiopic}/u,
  hangul: /\p{Script=Hangul}/u,
  cjk: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u,
};

const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;

const MARKS = {
  ja: KANA,
};

const FUNCTION_WORDS = {
  en: ['the', 'and', 'that', 'with', 'this', 'for', 'you', 'not', 'have', 'are', 'was', 'but', 'can', 'from'],
  es: ['que', 'los', 'las', 'una', 'por', 'para', 'con', 'del', 'está', 'esto', 'pero', 'como', 'este', 'hay'],
  pt: ['que', 'não', 'uma', 'para', 'com', 'dos', 'das', 'está', 'isso', 'mas', 'como', 'este', 'pelo', 'são'],
  fr: ['que', 'les', 'des', 'une', 'pour', 'avec', 'dans', 'est', 'pas', 'sur', 'mais', 'cette', 'plus', 'sont'],
  it: ['che', 'non', 'per', 'con', 'una', 'del', 'della', 'sono', 'come', 'questo', 'nel', 'alla', 'più', 'anche'],
  de: ['und', 'der', 'die', 'das', 'nicht', 'ist', 'mit', 'ein', 'eine', 'für', 'auf', 'sich', 'werden', 'aber'],
  nl: ['het', 'een', 'niet', 'van', 'met', 'voor', 'dat', 'zijn', 'wordt', 'maar', 'deze', 'moet', 'naar', 'kan'],
  pl: ['nie', 'jest', 'się', 'dla', 'jak', 'tego', 'przez', 'ale', 'aby', 'czy', 'oraz', 'tym', 'może', 'żeby'],
  cs: ['není', 'jsem', 'jsou', 'jako', 'pro', 'toto', 'ale', 'když', 'které', 'musí', 'ještě', 'tady', 'takže', 'protože'],
  sv: ['och', 'att', 'det', 'inte', 'för', 'med', 'som', 'har', 'kan', 'men', 'skulle', 'eller', 'också', 'denna'],
  no: ['ikke', 'som', 'har', 'kan', 'men', 'eller', 'også', 'skal', 'være', 'denne', 'noe', 'når', 'etter', 'før'],
  da: ['ikke', 'som', 'har', 'kan', 'men', 'eller', 'også', 'skal', 'være', 'denne', 'noget', 'når', 'efter', 'før'],
  fi: ['että', 'ovat', 'tämä', 'sekä', 'mutta', 'kun', 'niin', 'vain', 'myös', 'jos', 'koska', 'ollut', 'voi', 'pitää'],
  tr: ['için', 'bir', 'bu', 've', 'ile', 'daha', 'olarak', 'gibi', 'ama', 'çok', 'sonra', 'kadar', 'değil', 'olan'],
  vi: ['của', 'và', 'là', 'được', 'trong', 'không', 'này', 'cho', 'với', 'khi', 'những', 'một', 'các', 'đã'],
  id: ['yang', 'dan', 'untuk', 'dengan', 'tidak', 'dari', 'pada', 'ini', 'itu', 'akan', 'atau', 'sudah', 'bisa', 'karena'],
  ro: ['este', 'sunt', 'care', 'pentru', 'din', 'nu', 'dar', 'când', 'această', 'acest', 'foarte', 'după', 'până', 'între'],
  hu: ['hogy', 'nem', 'egy', 'van', 'volt', 'meg', 'csak', 'már', 'még', 'mint', 'vagy', 'lehet', 'kell', 'amely'],
  ru: ['что', 'это', 'как', 'для', 'или', 'если', 'когда', 'можно', 'нужно', 'есть', 'надо', 'также', 'чтобы', 'более'],
  uk: ['що', 'це', 'як', 'для', 'або', 'якщо', 'коли', 'можна', 'потрібно', 'треба', 'також', 'щоб', 'більш', 'який'],
  bg: ['това', 'като', 'или', 'ако', 'когато', 'може', 'трябва', 'също', 'която', 'който', 'няма', 'след', 'преди', 'защото'],
  ar: ['في', 'من', 'على', 'إلى', 'هذا', 'التي', 'الذي', 'أن', 'مع', 'عن', 'كان', 'لا', 'ما', 'كل'],
  fa: ['که', 'این', 'برای', 'است', 'را', 'با', 'یک', 'های', 'شود', 'کند', 'باید', 'اما', 'هم', 'خود'],
  ur: ['کے', 'میں', 'ہے', 'اور', 'سے', 'کی', 'کا', 'نہیں', 'ایک', 'یہ', 'پر', 'کو', 'ہیں', 'لیے'],
  he: ['את', 'של', 'לא', 'עם', 'זה', 'הוא', 'היא', 'אבל', 'כדי', 'יש', 'אני', 'אנחנו', 'כמו', 'רק'],
  yi: ['אַז', 'מיט', 'ניט', 'דאָס', 'אַ', 'און', 'צו', 'פֿון', 'זײַן', 'איך', 'מיר', 'ווי', 'אָבער', 'אויף'],
};

const MIN_LETTERS = 8;
const MIN_TOKENS = 4;
const SCRIPT_MAJORITY = 0.6;

const MIN_WORD_BY_SCRIPT = {
  hangul: 2,
  cjk: 1,
  thai: 2,
  devanagari: 3,
  bengali: 3,
  ethiopic: 3,
  arabic: 3,
  hebrew: 3,
};

export { isUnspaced, scriptOf };

export const scriptPattern = (script) => SCRIPT_PATTERNS[script] || null;

export const minWordLength = (script) => MIN_WORD_BY_SCRIPT[script] ?? 4;

export function scriptRatio(text, script) {
  const pattern = SCRIPT_PATTERNS[script];
  if (!pattern) return 0;
  const letters = String(text || '').match(/\p{L}/gu) || [];
  if (letters.length < MIN_LETTERS) return 0;
  return letters.filter((letter) => pattern.test(letter)).length / letters.length;
}

export function scriptLetters(text, language) {
  const pattern = SCRIPT_PATTERNS[scriptOf(language)];
  if (!pattern) return 0;
  return (String(text || '').match(/\p{L}/gu) || []).filter((letter) => pattern.test(letter)).length;
}

function sameScript(text, language, otherLanguage, script) {
  const mineMark = MARKS[codeOf(language)];
  const theirsMark = MARKS[codeOf(otherLanguage)];

  if (mineMark || theirsMark) {
    if (scriptRatio(text, script) <= SCRIPT_MAJORITY) return false;
    if (mineMark && mineMark.test(text)) return true;
    if (theirsMark && theirsMark.test(text)) return false;
    return !mineMark;
  }

  const mine = FUNCTION_WORDS[codeOf(language)];
  const theirs = FUNCTION_WORDS[codeOf(otherLanguage)];
  if (!mine || !theirs) return scriptRatio(text, script) > SCRIPT_MAJORITY;

  const tokens = new Set(text.toLowerCase().match(/\p{L}+/gu) || []);
  if (tokens.size < MIN_TOKENS) return false;
  const votes = (list) => list.filter((word) => tokens.has(word)).length;
  return votes(mine) > votes(theirs);
}

export function isLanguage(text, language, otherLanguage) {
  if (typeof text !== 'string' || !text) return false;

  const script = scriptOf(language);
  if (script !== scriptOf(otherLanguage)) return scriptRatio(text, script) > SCRIPT_MAJORITY;
  return sameScript(text, language, otherLanguage, script);
}

const SENTENCE_END = /[.!?…。！？؟।॥፡፣፤]+/;

export function sentences(text, max = 160) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    let rest = line.trim();
    while (rest) {
      const match = rest.match(SENTENCE_END);
      const cut = match ? match.index + match[0].length : rest.length;
      const piece = rest.slice(0, Math.min(cut, max)).trim();
      if (piece) out.push(piece);
      rest = rest.slice(Math.min(cut, max)).trim();
    }
  }
  return out;
}

export function trimToSentence(text, max) {
  const value = String(text || '').trim();
  if (value.length <= max) return value;
  const head = value.slice(0, max);
  let cut = -1;
  for (const match of head.matchAll(/[.!?…。！？؟।॥]+/gu)) cut = match.index + match[0].length;
  return (cut >= max / 3 ? head.slice(0, cut) : head.slice(0, head.lastIndexOf(' ') > 0 ? head.lastIndexOf(' ') : max)).trim();
}
