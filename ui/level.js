export const BANDS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
export const CENTRE = { A1: -2.5, A2: -1.5, B1: -0.5, B2: 0.5, C1: 1.5, C2: 2.5 };
const GAMMA = 1.8;
const BETA = 0.05;
export const GAIN_FLOOR = 0.06;
const HYSTERESIS = 0.15;
export const MIN_ANSWERS = 100;
export const MIN_PER_BAND = 10;
export const THETA_LIMIT = 3;
export const SEED = -0.5;
const COUNTED_MODES = new Set(['flashcards', 'learn', 'cloze', 'type', 'reverse']);
export const CHOICES = { learn: 4 };

const OUTCOME = { 1: 0, 2: 0.5, 3: 1, 4: 1 };
const HALF_BAND = 0.5;
const DIFFICULTY_MID = 5.5;
const DIFFICULTY_SPAN = 4.5;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const sigma = (value) => 1 / (1 + Math.exp(-value));
const isBand = (band) => Object.prototype.hasOwnProperty.call(CENTRE, band);

export const seedTheta = (level) => (isBand(level) ? CENTRE[level] : SEED);

export function itemDifficulty(cefr, difficulty) {
  if (!isBand(cefr)) return null;
  const raw = Number(difficulty);
  const scaled = Number.isFinite(raw) ? clamp(raw, 1, 10) : DIFFICULTY_MID;
  return CENTRE[cefr] + (HALF_BAND * (scaled - DIFFICULTY_MID)) / DIFFICULTY_SPAN;
}

export function outcome(rating) {
  const key = Number(rating);
  return Number.isInteger(key) && key in OUTCOME ? OUTCOME[key] : null;
}

export function expected(theta, difficulty, mode = '') {
  const chance = sigma(theta - difficulty);
  const choices = CHOICES[mode];
  return choices ? 1 / choices + (1 - 1 / choices) * chance : chance;
}

export const gain = (answers) => Math.max(GAIN_FLOOR, GAMMA / (1 + BETA * Math.max(0, answers)));

function nearestBand(theta) {
  let nearest = BANDS[0];
  let best = Infinity;
  for (const band of BANDS) {
    const gap = Math.abs(theta - CENTRE[band]);
    if (gap < best) {
      best = gap;
      nearest = band;
    }
  }
  return nearest;
}

export function labelOf(theta, previous = '') {
  const band = nearestBand(theta);
  if (!isBand(previous) || previous === band) return band;
  const up = theta > CENTRE[previous];
  const boundary = CENTRE[previous] + (up ? HALF_BAND : -HALF_BAND);
  const held = up ? theta < boundary + HYSTERESIS : theta > boundary - HYSTERESIS;
  return held ? previous : band;
}

export function bandsOf(bands) {
  const counts = {};
  for (const band of BANDS) {
    const seen = Number(bands?.[band]);
    if (Number.isFinite(seen) && seen > 0) counts[band] = Math.floor(seen);
  }
  return counts;
}

export function ceilingOf(bands) {
  const counts = bandsOf(bands);
  let ceiling = '';
  for (const band of BANDS) if ((counts[band] || 0) >= MIN_PER_BAND) ceiling = band;
  return ceiling;
}

const lowerOf = (band, other) =>
  BANDS.indexOf(band) <= BANDS.indexOf(other) ? band : other;

function normalise(state) {
  const theta = Number(state?.theta);
  const answers = Number(state?.n);
  return {
    theta: Number.isFinite(theta) ? clamp(theta, -THETA_LIMIT, THETA_LIMIT) : SEED,
    n: Number.isFinite(answers) && answers > 0 ? Math.floor(answers) : 0,
    label: isBand(state?.label) ? state.label : '',
    bands: bandsOf(state?.bands),
  };
}

export function update(state, review) {
  if (!review?.first) return state;
  const mode = String(review?.mode || '');
  if (!COUNTED_MODES.has(mode)) return state;
  const scored = outcome(review?.rating);
  if (scored === null) return state;
  const band = String(review?.cefr || '');
  const difficulty = itemDifficulty(band, review?.difficulty);
  if (difficulty === null) return state;

  const current = normalise(state);
  const answers = current.n + 1;
  const moved = current.theta + gain(answers) * (scored - expected(current.theta, difficulty, mode));
  const theta = clamp(moved, -THETA_LIMIT, THETA_LIMIT);
  return {
    theta,
    n: answers,
    label: labelOf(theta, current.label),
    bands: { ...current.bands, [band]: (current.bands[band] || 0) + 1 },
  };
}

export function replay(reviews, seed = SEED) {
  const start = Number(seed);
  let state = { theta: Number.isFinite(start) ? start : SEED, n: 0, label: '', bands: {} };
  for (const review of Array.isArray(reviews) ? reviews : []) state = update(state, review);
  return state;
}

export function estimate(state) {
  const current = normalise(state);
  const ceiling = ceilingOf(current.bands);
  const confident = current.n >= MIN_ANSWERS && !!ceiling;
  return {
    band: confident ? lowerOf(current.label, ceiling) : '',
    theta: current.theta,
    n: current.n,
    min: MIN_ANSWERS,
    ceiling,
    confident,
  };
}

export function windowOf(band) {
  const index = BANDS.indexOf(band);
  if (index < 0) return ['B1', 'B2'];
  return [band, BANDS[Math.min(index + 1, BANDS.length - 1)]];
}

export const levelFor = (cfg, state) => (isBand(cfg?.level) ? cfg.level : estimate(state).band);
