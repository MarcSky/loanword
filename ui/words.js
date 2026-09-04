const segmenters = new Map();

export function segmenter(lang) {
  const key = String(lang || 'und').toLowerCase();
  if (!segmenters.has(key)) {
    let made;
    try {
      made = new Intl.Segmenter(key, { granularity: 'word' });
    } catch {
      made = new Intl.Segmenter(undefined, { granularity: 'word' });
    }
    segmenters.set(key, made);
  }
  return segmenters.get(key);
}

export const piecesOf = (text, lang) => [...segmenter(lang).segment(String(text ?? ''))];

export function words(text, lang) {
  const value = String(text ?? '').trim();
  if (!value) return [];
  return piecesOf(value, lang)
    .filter((piece) => piece.isWordLike)
    .map((piece) => piece.segment.toLowerCase());
}

export const wordCount = (text, lang) => words(text, lang).length;
