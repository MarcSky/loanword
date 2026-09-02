export const LANGUAGES = [
  { code: 'en', name: 'English', script: 'latin' },
  { code: 'es', name: 'Español', script: 'latin' },
  { code: 'pt', name: 'Português', script: 'latin' },
  { code: 'fr', name: 'Français', script: 'latin' },
  { code: 'de', name: 'Deutsch', script: 'latin' },
  { code: 'it', name: 'Italiano', script: 'latin' },
  { code: 'nl', name: 'Nederlands', script: 'latin' },
  { code: 'pl', name: 'Polski', script: 'latin' },
  { code: 'ru', name: 'Русский', script: 'cyrillic' },
  { code: 'uk', name: 'Українська', script: 'cyrillic' },
  { code: 'cs', name: 'Čeština', script: 'latin' },
  { code: 'sv', name: 'Svenska', script: 'latin' },
  { code: 'no', name: 'Norsk', script: 'latin' },
  { code: 'da', name: 'Dansk', script: 'latin' },
  { code: 'fi', name: 'Suomi', script: 'latin' },
  { code: 'tr', name: 'Türkçe', script: 'latin' },
  { code: 'el', name: 'Ελληνικά', script: 'greek' },
  { code: 'he', name: 'עברית', script: 'hebrew', rtl: true },
  { code: 'ar', name: 'العربية', script: 'arabic', rtl: true },
  { code: 'fa', name: 'فارسی', script: 'arabic', rtl: true },
  { code: 'ur', name: 'اردو', script: 'arabic', rtl: true },
  { code: 'hi', name: 'हिन्दी', script: 'devanagari' },
  { code: 'bn', name: 'বাংলা', script: 'bengali' },
  { code: 'th', name: 'ไทย', script: 'thai', unspaced: true },
  { code: 'am', name: 'አማርኛ', script: 'ethiopic' },
  { code: 'hy', name: 'Հայերեն', script: 'armenian' },
  { code: 'ja', name: '日本語', script: 'cjk', unspaced: true },
  { code: 'ko', name: '한국어', script: 'hangul' },
  { code: 'zh', name: '中文', script: 'cjk', unspaced: true },
  { code: 'vi', name: 'Tiếng Việt', script: 'latin' },
  { code: 'id', name: 'Bahasa Indonesia', script: 'latin' },
  { code: 'ka', name: 'ქართული', script: 'georgian' },
  { code: 'ro', name: 'Română', script: 'latin' },
  { code: 'hu', name: 'Magyar', script: 'latin' },
  { code: 'bg', name: 'Български', script: 'cyrillic' },
];

export const EXTRA_LANGUAGES = [
  { code: 'ps', name: 'پښتو', script: 'arabic', rtl: true },
  { code: 'sd', name: 'سنڌي', script: 'arabic', rtl: true },
  { code: 'ug', name: 'ئۇيغۇرچە', script: 'arabic', rtl: true },
  { code: 'yi', name: 'ייִדיש', script: 'hebrew', rtl: true },
  { code: 'ku', name: 'کوردی', script: 'arabic', rtl: true },
];

const ALL = [...LANGUAGES, ...EXTRA_LANGUAGES];

const BY_CODE = new Map(ALL.map((entry) => [entry.code, entry]));

export const CODES = LANGUAGES.map((entry) => entry.code);

export const codeOf = (value) => String(value || '').toLowerCase().slice(0, 2);

export const languageOf = (value) => BY_CODE.get(codeOf(value)) || null;

export const isKnownLanguage = (value) => BY_CODE.has(codeOf(value));

const PICKABLE = new Set(LANGUAGES.map((entry) => entry.code));

export const isPickable = (value) => PICKABLE.has(codeOf(value));

export const languageName = (value) => languageOf(value)?.name || String(value || '').toUpperCase();

export const scriptOf = (value) => languageOf(value)?.script || 'latin';

export const isRtl = (value) => !!languageOf(value)?.rtl;

export const isUnspaced = (value) => !!languageOf(value)?.unspaced;

export const NAME_PAIRS = LANGUAGES.map((entry) => [entry.code, entry.name]);
