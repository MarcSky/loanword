// Secret scrubbing. Runs before anything touches disk.
// Over-masking is fine; under-masking is a P0 bug.

export const MASK = '▮';

const SECRETISH_KEY = /(?:TOKEN|SECRET|PASSWORD|PASSWD|PASSPHRASE|CREDENTIALS?|PRIVATE|APIKEY|API_KEY|AUTH|BEARER|KEY)/i;

// Applied in order: earlier rules eat the material later rules would half-match.
const RULES = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, MASK],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*/g, MASK], // unterminated block

  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, MASK],

  [/\bAKIA[0-9A-Z]{16}\b/g, MASK],
  [/\bASIA[0-9A-Z]{16}\b/g, MASK],
  [/\bsk-[A-Za-z0-9_-]{20,}/g, MASK],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, MASK],
  [/\bxox[baprse]-[A-Za-z0-9-]{10,}/g, MASK],
  [/\bAIza[A-Za-z0-9_-]{35}\b/g, MASK],
  [/\bglpat-[A-Za-z0-9_-]{20,}/g, MASK],
  [/\bnpm_[A-Za-z0-9]{36}\b/g, MASK],

  [
    /\b([A-Za-z_][A-Za-z0-9_.-]*)(["']?\s*[:=]\s*)(["'])([^"'\n]{3,})\3/g,
    (m, key, sep, q) => (SECRETISH_KEY.test(key) ? `${key}${sep}${q}${MASK}${q}` : m),
  ],
  [
    /\b([A-Za-z_][A-Za-z0-9_.-]*)(\s*[:=]\s*)([^\s"',;]{3,})/g,
    (m, key, sep) => (SECRETISH_KEY.test(key) ? `${key}${sep}${MASK}` : m),
  ],

  // Hex tops out at 4 bits/char, so the entropy pass below never catches digests.
  [/\b[0-9a-fA-F]{32,}\b/g, MASK],

  [/\b(https?:\/\/[^\s"'<>]+?)\?[^\s"'<>]*/g, `$1?${MASK}`],
  [/\b(https?:\/\/)[^\s/:@"']+:[^\s/@"']+@/g, `$1${MASK}@`],

  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]+\b/g, MASK],

  // ponytail: loose on purpose — version strings get masked too, which is the
  // harmless direction. Tighten only if it starts eating real vocabulary.
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, MASK],
  [/\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g, MASK],
  [/(?:^|\s)(?:[0-9a-fA-F]{1,4}:){1,6}:(?:[0-9a-fA-F]{1,4}:?){0,5}(?=\s|$)/g, ` ${MASK}`],

  // Absolute paths leak usernames, client names and directory layout.
  [/(?:\/(?:Users|home|root|var\/folders|private\/tmp)\/[^\s"'<>,;)\]]*)/g, MASK],
  [/\b[A-Za-z]:\\[^\s"'<>,;)\]]*/g, MASK],
];

/** Shannon entropy in bits per character. */
export function entropy(s) {
  const freq = new Map();
  for (const ch of s) freq.set(ch, (freq.get(ch) || 0) + 1);
  let h = 0;
  for (const n of freq.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

// Long high-entropy blobs no prefix rule caught: raw keys, hashes, base64.
const BLOB = /[A-Za-z0-9+/=_-]{20,}/g;
const ENTROPY_THRESHOLD = 4.0;
const MASK_RUN = new RegExp(`(?:${MASK}[\\s]*){2,}`, 'g');

export function scrub(text) {
  if (typeof text !== 'string' || !text) return '';
  let out = text;
  for (const [re, rep] of RULES) out = out.replace(re, rep);
  out = out.replace(BLOB, (m) => (entropy(m) > ENTROPY_THRESHOLD ? MASK : m));
  return out.replace(MASK_RUN, `${MASK} `).trim();
}
