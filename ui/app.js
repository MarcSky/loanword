// Loanword trainer. No framework, no build step: serve.mjs sends this file as-is.

/* ── Taxonomy ─────────────────────────────────────────────────────────
   The six categories are fixed in scripts/store.mjs. Every one of them
   renders whether or not it holds cards — a filter that appears and
   disappears between visits is worse than an empty one. */

const CATEGORY = {
  engineering: {
    label: 'Engineering',
    icon: 'terminal',
    tint: 'sky',
    blurb: 'Code, systems, debugging, review',
  },
  process: {
    label: 'Process',
    icon: 'waypoints',
    tint: 'peach',
    blurb: 'Plans, estimates, releases, specs',
  },
  collaboration: {
    label: 'Collaboration',
    icon: 'users-round',
    tint: 'rose',
    blurb: 'Meetings, feedback, asking, disagreeing',
  },
  phrasing: {
    label: 'Phrasing',
    icon: 'quote',
    tint: 'lavender',
    blurb: 'Set phrases and idioms that resist translation',
  },
  connectors: {
    label: 'Connectors',
    icon: 'git-branch',
    tint: 'butter',
    blurb: 'However, in terms of, that said, provided that',
  },
  everyday: {
    label: 'Everyday',
    icon: 'coffee',
    tint: 'mint',
    blurb: 'General vocabulary and everything unplaced',
  },
};

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const LEVEL_BLURB = {
  A1: 'Breakthrough',
  A2: 'Waystage',
  B1: 'Threshold',
  B2: 'Vantage',
  C1: 'Advanced',
  C2: 'Mastery',
};

const LANGUAGES = [
  ['en', 'English'], ['es', 'Español'], ['pt', 'Português'], ['fr', 'Français'],
  ['de', 'Deutsch'], ['it', 'Italiano'], ['nl', 'Nederlands'], ['pl', 'Polski'],
  ['ru', 'Русский'], ['uk', 'Українська'], ['cs', 'Čeština'], ['sv', 'Svenska'],
  ['no', 'Norsk'], ['da', 'Dansk'], ['fi', 'Suomi'], ['tr', 'Türkçe'],
  ['el', 'Ελληνικά'], ['he', 'עברית'], ['ar', 'العربية'], ['fa', 'فارسی'],
  ['hi', 'हिन्दी'], ['ja', '日本語'], ['ko', '한국어'], ['zh', '中文'],
  ['vi', 'Tiếng Việt'], ['id', 'Bahasa Indonesia'], ['ka', 'ქართული'],
  ['ro', 'Română'], ['hu', 'Magyar'], ['bg', 'Български'],
];

const ROUTES = [
  { id: 'overview', label: 'Overview', icon: 'layout-dashboard' },
  { id: 'deck', label: 'Deck', icon: 'layers' },
  { id: 'study', label: 'Study', icon: 'graduation-cap' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

const MODE_LABEL = { flashcards: 'Flashcards', learn: 'Learn' };

const GRADES = [
  null,
  { n: 1, label: 'Again', hint: 'no idea', tint: 'grade-again' },
  { n: 2, label: 'Hard', hint: 'barely', tint: 'grade-hard' },
  { n: 3, label: 'Good', hint: 'got it', tint: 'grade-good' },
  { n: 4, label: 'Easy', hint: 'instant', tint: 'grade-easy' },
];

const SHORTCUTS = () => [
  ['1 – 5', t('Jump to a section')],
  ['space', t('Show the answer')],
  ['1 2 3 4', t('Again / Hard / Good / Easy')],
  ['d', t('Throw the card away as junk')],
  ['/', t('Search the deck')],
  ['t', t('Switch theme')],
  ['?', t('This list')],
  ['esc', t('Leave the session')],
];



/* ── State ────────────────────────────────────────────────────────── */

const app = {
  loaded: false,
  cards: [], // the open deck only: one language pair at a time
  pairs: [], // every deck on disk, so switching never implies deleting
  uiLanguages: [], // which interface dictionaries exist on disk
  stats: null,
  config: {},
  route: 'overview',
  level: '', // overview scope
  category: '', // overview scope
  deck: { category: '', level: '', status: 'all', query: '', view: 'list' },
  session: null,
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);

const icon = (name, cls = 'icon') =>
  `<svg class="${cls}" aria-hidden="true"><use href="icons.svg#i-${name}"></use></svg>`;

/** Translated on read: the constant is evaluated before the dictionary loads. */
const meta = (key) => {
  const info = CATEGORY[key] || CATEGORY.everyday;
  return { ...info, label: t(info.label), blurb: t(info.blurb) };
};

const levelBlurb = (level) => (LEVEL_BLURB[level] ? t(LEVEL_BLURB[level]) : '');

const tintOf = (key) => {
  const { tint } = meta(key);
  return `--tint:var(--${tint});--tint-ink:var(--${tint}-ink)`;
};

const pct = (value) => `${Math.round((value || 0) * 100)}%`;

/* ── Interface language ───────────────────────────────────────────────
   gettext-style: the English sentence IS the key. A missing entry degrades
   to English rather than to a bare identifier, the code stays readable, and
   there is no en.json to keep in sync. Dictionaries live in ui/i18n/. */

let DICT = {};
let UI_LANG = 'en';
let PLURAL = new Intl.PluralRules('en');

function t(text, vars) {
  let out = DICT[text] ?? text;
  if (vars) for (const [key, value] of Object.entries(vars)) out = out.split(`{${key}}`).join(value);
  return out;
}

/** Two forms are not enough for Russian, Polish or Arabic; Intl picks the right one. */
function tn(n, one, many) {
  const forms = DICT[`${one}|${many}`];
  const word = forms ? forms[PLURAL.select(n)] || forms.other || many : n === 1 ? one : many;
  return `${n} ${word}`;
}

async function loadLanguage() {
  try {
    const pack = await api('/i18n');
    DICT = pack.strings && typeof pack.strings === 'object' ? pack.strings : {};
    UI_LANG = pack.lang || 'en';
    PLURAL = new Intl.PluralRules(UI_LANG);
    document.documentElement.lang = UI_LANG;
    document.documentElement.dir = pack.dir || 'ltr';
  } catch {
    DICT = {}; // English is compiled in, so a missing dictionary is survivable
  }
}

function languageName(code) {
  const found = LANGUAGES.find(([id]) => id === code);
  return found ? found[1] : String(code || '').toUpperCase();
}

function relativeDay(iso) {
  if (!iso) return '';
  const days = Math.round((new Date(iso) - Date.now()) / 864e5);
  try {
    return new Intl.RelativeTimeFormat(UI_LANG, { numeric: 'auto' }).format(days, 'day');
  } catch {
    return `${Math.abs(days)}d`;
  }
}

/* ── Transport ────────────────────────────────────────────────────── */

async function api(path, payload) {
  const options = payload
    ? {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }
    : {};
  const response = await fetch(path, options);
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || response.statusText);
  return response.json();
}

async function load() {
  const state = await api('/state');
  app.cards = state.cards;
  app.pairs = state.pairs || [];
  app.uiLanguages = state.uiLanguages || [];
  app.stats = state.stats;
  app.config = state.config;
  app.loaded = true;
  applyTheme(app.config.theme);
}

let toastTimer;
function toast(message, tone = 'ok') {
  const node = $('#toast');
  node.innerHTML = `${icon(tone === 'error' ? 'circle-alert' : 'circle-check', 'icon-sm icon')}<span>${esc(message)}</span>`;
  node.dataset.tone = tone;
  node.dataset.show = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => delete node.dataset.show, 2600);
}

/* ── Derived numbers ──────────────────────────────────────────────
   Computed here rather than taken from /stats so the level filter can
   re-scope every tile without a round trip. */

const inLevel = (card, level) => !level || card.cefr === level;

function summarize(cards) {
  const total = cards.length;
  const seen = cards.filter((card) => !card.isNew);
  return {
    total,
    seen: seen.length,
    due: cards.filter((card) => card.isDue).length,
    learned: cards.filter((card) => card.mastery >= 1).length,
    mastery: total ? cards.reduce((sum, card) => sum + card.mastery, 0) / total : 0,
  };
}

const byCategory = (level) =>
  Object.keys(CATEGORY).map((key) => ({
    key,
    ...summarize(app.cards.filter((card) => card.category === key && inLevel(card, level))),
  }));

/* ── Shared fragments ─────────────────────────────────────────────── */

function ring(value, { size = 40, label = pct(value), hole = 'var(--tint)' } = {}) {
  return `<div class="ring" style="--value:${value.toFixed(3)};--size:${size}px;--ring-hole:${hole}"
    role="img" aria-label="${esc(t('{n} mastered', { n: label }))}"><span class="ring-label">${esc(label)}</span></div>`;
}

function levelChips(active, action) {
  return `<div class="filters" role="group" aria-label="${esc(t('Filter by CEFR level'))}">
    <button class="chip chip-sm" data-act="${action}" data-value="" aria-pressed="${active === ''}">${esc(t('All levels'))}</button>
    ${LEVELS.map(
      (level) => `<button class="chip chip-sm" data-act="${action}" data-value="${level}"
        aria-pressed="${active === level}" title="${esc(levelBlurb(level))}">${level}</button>`,
    ).join('')}
  </div>`;
}

function categoryChips(active, action) {
  return `<div class="filters" role="group" aria-label="${esc(t('Filter by category'))}">
    <button class="chip" data-act="${action}" data-value="" aria-pressed="${active === ''}">
      <span class="dot">${icon('layers')}</span>${esc(t('All'))}
    </button>
    ${Object.keys(CATEGORY)
      .map((key) => {
        const info = meta(key);
        return `<button class="chip" data-act="${action}" data-value="${key}"
          aria-pressed="${active === key}" style="${tintOf(key)}">
          <span class="dot">${icon(info.icon)}</span>${esc(info.label)}
        </button>`;
      })
      .join('')}
  </div>`;
}

function emptyState({ art, title, body, action = '' }) {
  return `<div class="empty enter">
    <div class="art-frame"><img class="art" src="art/${art.src}" alt="${esc(art.alt)}"></div>
    <h2>${title}</h2>
    <p>${body}</p>
    ${action}
  </div>`;
}

/* ── Overview ─────────────────────────────────────────────────────── */

function renderOverview() {
  const stats = app.stats;
  const scoped = app.cards.filter(
    (card) => inLevel(card, app.level) && (!app.category || card.category === app.category),
  );
  const totals = summarize(scoped);
  const deckTotals = summarize(app.cards); // the lede counts the deck, not the filter
  const cats = byCategory(app.level).sort((a, b) => b.due - a.due || b.total - a.total);
  const shown = app.category ? cats.filter((cat) => cat.key === app.category) : cats;

  const dueLine = totals.due
    ? t('{cards} ready — {minutes}', {
        cards: tn(totals.due, 'card', 'cards'),
        minutes: totals.due <= 12 ? t('about five minutes') : t('about ten minutes'),
      })
    : t('Nothing is due. The deck is ahead of you.');

  $('#page-overview').innerHTML = `
    <div class="page-head">
      <div>
        <h1>${t('The words you <em>actually</em> needed')}</h1>
        <p class="lede">${t('Captured while you worked, levelled A1 to C2, scheduled by FSRS.')}
          ${
            deckTotals.total
              ? esc(t('{cards} in the deck, {n} learned for good.', {
                  cards: tn(deckTotals.total, 'card', 'cards'),
                  n: deckTotals.learned,
                }))
              : ''
          }</p>
      </div>
      <div class="segmented" role="group" aria-label="${esc(t('Study mode'))}">
        ${['flashcards', 'learn']
          .map(
            (mode) => `<button data-act="study-mode" data-value="${mode}"
              aria-pressed="${app.config.studyMode === mode}">
              ${icon(mode === 'flashcards' ? 'layers' : 'brain', 'icon-sm icon')}
              ${esc(t(MODE_LABEL[mode]))}
            </button>`,
          )
          .join('')}
      </div>
    </div>

    ${
      app.cards.length
        ? `<div class="due-cta">
            ${icon('flame')}
            <div>
              <div class="headline">${esc(totals.due ? t('{n} due right now', { n: totals.due }) : t('All caught up'))}</div>
              <div class="sub">${esc(dueLine)}</div>
            </div>
            <button class="btn" data-act="start" data-value="${app.category}" ${totals.due ? '' : 'aria-disabled="true"'}>
              ${icon('play', 'icon-sm icon')} ${esc(t('Start session'))}
            </button>
          </div>

          <div style="margin-top:22px">
            ${categoryChips(app.category, 'overview-category')}
            ${levelChips(app.level, 'overview-level')}
            <div class="section-head">
              <h2>${esc(app.category ? meta(app.category).label : t('Where your words live'))}</h2>
              <button class="btn btn-quiet" data-act="go" data-value="deck">
                ${esc(t('Search and filter'))} ${icon('arrow-right', 'icon-sm icon')}
              </button>
            </div>
            ${
              app.category
                ? categoryPreview(scoped)
                : `<div class="cat-grid">${shown.map(categoryTile).join('')}</div>`
            }
          </div>`
        : newDeckState()
    }`;
}

/** With one category in focus the tiles alone are thin — show the words themselves. */
function categoryPreview(cards) {
  const ordered = [...cards].sort((a, b) => Number(b.isDue) - Number(a.isDue) || a.mastery - b.mastery);
  if (!ordered.length) return '';
  return wordList(ordered);
}

/**
 * Empty is not always first-run: switching target language opens a deck that is
 * legitimately empty while the other decks sit untouched on disk.
 */
function newDeckState() {
  const elsewhere = app.pairs.filter((pair) => pair.target !== app.config.target || pair.native !== app.config.native);
  const carried = elsewhere.reduce((sum, pair) => sum + pair.total, 0);

  if (carried) {
    return emptyState({
      art: {
        src: 'empty-deck.png',
        alt: 'Flat pastel illustration: an empty index-card box on a desk beside a closed laptop, one blank card standing upright, mint and cream palette, soft shadows, no text',
      },
      title: esc(t('Nothing in {from} → {to} yet', {
        from: languageName(app.config.native),
        to: languageName(app.config.target),
      })),
      body: esc(t(
        'Your other {cards} are exactly where you left them — switching language opens a second deck, it never touches the first. Keep working and this one fills up too.',
        { cards: tn(carried, 'card', 'cards') },
      )),
      action: `<div class="decks" style="justify-content:center">${deckChips()}</div>`,
    });
  }

  return emptyState({
    art: {
      src: 'empty-deck.png',
      alt: 'Flat pastel illustration: an empty index-card box on a desk beside a closed laptop, one blank card standing upright, mint and cream palette, soft shadows, no text',
    },
    title: t('No cards yet — and that is correct'),
    body: t('Loanword never ships a deck. Work as usual; the hooks collect the phrases you reached for. When enough has piled up, run <code>/loanword:build</code> and they become cards.'),
    action: `<button class="btn" data-act="go" data-value="settings">${icon('settings', 'icon-sm icon')} ${esc(t('Check your languages'))}</button>`,
  });
}

/** One chip per language pair found on disk. The pressed one is the open deck. */
function deckChips() {
  const known = new Map(app.pairs.map((pair) => [`${pair.native}>${pair.target}`, pair]));
  const current = { native: app.config.native, target: app.config.target, total: app.cards.length };
  known.set(`${current.native}>${current.target}`, { ...current, ...known.get(`${current.native}>${current.target}`) });

  return [...known.values()]
    .map((pair) => {
      const open = pair.native === current.native && pair.target === current.target;
      return `<button class="deck-chip" data-act="open-deck" data-value="${pair.native}>${pair.target}"
        aria-pressed="${open}">
        ${esc(languageName(pair.native))} ${icon('arrow-right', 'icon-sm icon')} ${esc(languageName(pair.target))}
        <span class="n">${pair.total || 0}</span>
      </button>`;
    })
    .join('');
}

/**
 * Every category renders the same way: what it is, what is waiting, how many
 * words, how far they have settled. A feature tile with different fields made
 * the grid something to parse rather than something to scan.
 */
function categoryTile(cat) {
  const info = meta(cat.key);
  return `<button class="cat" style="${tintOf(cat.key)}" data-act="overview-category" data-value="${cat.key}">
    <div class="cat-top">
      <span class="cat-icon">${icon(info.icon)}</span>
      <span class="cat-name">${esc(info.label)}</span>
      ${
        cat.due
          ? `<span class="cat-due">${icon('flame', 'icon-sm icon')}${esc(t('{n} due', { n: cat.due }))}</span>`
          : ''
      }
    </div>
    <div class="cat-title">${esc(cat.total ? tn(cat.total, 'word', 'words') : t('Nothing here yet'))}</div>
    <div class="cat-foot">
      <span>${esc(t('{n} learned', { n: cat.learned }))}</span>
      ${ring(cat.mastery)}
    </div>
  </button>`;
}

/* ── Deck ─────────────────────────────────────────────────────────── */

const STATUSES = [
  ['all', 'Everything'],
  ['favorite', 'Favourites'],
  ['due', 'Due now'],
  ['new', 'Never seen'],
  ['learned', 'Learned'],
];

function deckCards() {
  const { category, level, status, query } = app.deck;
  const needle = query.trim().toLowerCase();
  return app.cards.filter((card) => {
    if (category && card.category !== category) return false;
    if (level && card.cefr !== level) return false;
    if (status === 'favorite' && !card.isFavorite) return false;
    if (status === 'due' && !card.isDue) return false;
    if (status === 'new' && !card.isNew) return false;
    if (status === 'learned' && card.mastery < 1) return false;
    if (needle) {
      const haystack = [card.front, card.back, card.example, ...(card.keywords || [])].join(' ').toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

function renderDeck() {
  const cards = deckCards();
  const { status, query } = app.deck;

  $('#page-deck').innerHTML = `
    <div class="page-head">
      <div>
        <h1>${t('Your deck')}</h1>
        <p class="lede">${esc(t('{cards}, every one of them from a session you actually had. Filter by domain, by level, or by how well it has settled.', { cards: tn(app.cards.length, 'card', 'cards') }))}</p>
      </div>
      <button class="btn" data-act="export">${icon('download', 'icon-sm icon')} ${esc(t('Export CSV'))}</button>
    </div>

    <div class="deck-bar">
      <label class="search">
        ${icon('search', 'icon-sm icon')}
        <input class="input" id="deck-search" type="search" placeholder="${esc(t('Search words, translations, examples'))}"
          value="${esc(query)}" aria-label="${esc(t('Search the deck'))}">
      </label>
      <div class="segmented" role="group" aria-label="${esc(t('Filter by status'))}">
        ${STATUSES.map(
          ([key, label]) => `<button data-act="deck-status" data-value="${key}"
            aria-pressed="${status === key}">${esc(t(label))}</button>`,
        ).join('')}
      </div>
      <div class="segmented" role="group" aria-label="${esc(t('View'))}" style="margin-inline-start:auto">
        ${[
          ['list', 'list-filter', 'List'],
          ['grid', 'layers', 'Cards'],
        ]
          .map(
            ([mode, ic, label]) => `<button data-act="deck-view" data-value="${mode}"
              aria-pressed="${app.deck.view === mode}" title="${esc(t(label))}" aria-label="${esc(t(label))}">
              ${icon(ic, 'icon-sm icon')}
            </button>`,
          )
          .join('')}
      </div>
    </div>

    ${categoryChips(app.deck.category, 'deck-category')}
    ${levelChips(app.deck.level, 'deck-level')}

    <div class="section-head">
      <h2>${esc(cards.length ? tn(cards.length, 'card', 'cards') : t('Nothing matches'))}</h2>
      ${
        cards.some((card) => card.isDue)
          ? `<button class="btn" data-act="start-filtered">
              ${icon('play', 'icon-sm icon')} ${esc(t('Study these'))}
              <span class="count">${cards.filter((c) => c.isDue).length}</span>
            </button>`
          : ''
      }
    </div>

    ${
      cards.length
        ? app.deck.view === 'grid'
          ? `<div class="deck-grid">${cards.map(wordCard).join('')}</div>`
          : wordList(cards)
        : emptyState({
            art: {
              src: 'empty-filter.png',
              alt: 'Flat pastel illustration: a magnifying glass resting on an empty card tray, one card tipped forward, rose and cream palette, no text',
            },
            title: t('No card matches those filters'),
            body: t('Widen the level, clear the search, or switch the status back to everything.'),
            action: `<button class="btn" data-act="deck-reset">${icon('rotate-ccw', 'icon-sm icon')} ${esc(t('Reset filters'))}</button>`,
          })
    }`;

  const search = $('#deck-search');
  if (search && document.activeElement !== search) search.setSelectionRange(query.length, query.length);
}

/** Reading view: one line per word, so a category can be read straight through. */
function wordRow(card) {
  return `<li class="row" style="${tintOf(card.category)}">
    <button class="star" data-act="favorite" data-value="${card.id}"
      aria-pressed="${!!card.isFavorite}"
      aria-label="${esc(card.isFavorite ? t('Remove from favourites') : t('Add to favourites'))}">
      ${icon('star', 'icon-sm icon')}
    </button>
    <span class="row-front">${esc(card.front)}</span>
    <span class="row-back">${esc(card.back)}</span>
    ${card.cefr ? `<span class="level" title="${esc(levelBlurb(card.cefr))}">${esc(card.cefr)}</span>` : ''}
    <span class="meter" title="${esc(t('{n} mastered', { n: pct(card.mastery) }))}"><i style="width:${pct(card.mastery)}"></i></span>
  </li>`;
}

/** Grouped by category when the list spans more than one, flat when it does not. */
function wordList(cards) {
  const groups = Object.keys(CATEGORY)
    .map((key) => ({ key, cards: cards.filter((card) => card.category === key) }))
    .filter((group) => group.cards.length);

  if (groups.length <= 1) return `<ul class="rows">${cards.map(wordRow).join('')}</ul>`;

  return groups
    .map((group) => {
      const info = meta(group.key);
      return `<div class="group" style="${tintOf(group.key)}">
        <h3 class="group-head">
          <span class="group-icon">${icon(info.icon, 'icon-sm icon')}</span>
          ${esc(info.label)}
          <span class="group-count">${group.cards.length}</span>
        </h3>
        <ul class="rows">${group.cards.map(wordRow).join('')}</ul>
      </div>`;
    })
    .join('');
}

function wordCard(card) {
  const info = meta(card.category);
  const status = card.isNew
    ? t('never seen')
    : card.isDue
      ? t('due {when}', { when: relativeDay(card.due) })
      : t('next {when}', { when: relativeDay(card.due) });
  return `<article class="word" style="${tintOf(card.category)}">
    <div class="word-top">
      <span class="tag">${icon(info.icon)}${esc(info.label)}</span>
      ${card.cefr ? `<span class="level" title="${esc(levelBlurb(card.cefr))}">${esc(card.cefr)}</span>` : ''}
    </div>
    <div class="word-front">${esc(card.front)}</div>
    <div class="word-back">${esc(card.back)}</div>
    ${
      card.example
        ? `<div class="word-back" style="font-size:.8125rem">${esc(card.example)}</div>`
        : ''
    }
    <div class="word-foot">
      <span class="meter" title="${esc(t('{n} mastered', { n: pct(card.mastery) }))}"><i style="width:${pct(card.mastery)}"></i></span>
      <span>${esc(status)}</span>
    </div>
  </article>`;
}

/* ── Study ────────────────────────────────────────────────────────── */

/** Recognition first, recall second: Learn hands you four candidates, Flashcards none. */
function startSession(category = '') {
  const pool = app.cards.filter((card) => card.isDue && (!category || card.category === category));
  if (!pool.length) {
    toast(t('Nothing is due in that group yet'));
    return;
  }
  app.session = {
    category,
    mode: app.config.studyMode || 'flashcards',
    queue: shuffle(pool),
    index: 0,
    revealed: false,
    known: 0,
    learning: 0,
    graded: 0,
    choices: null,
    answered: null,
    asked: 0,
    busy: false,
  };
  go('study');
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function currentCard() {
  return app.session?.queue[app.session.index] || null;
}

/**
 * Distractors must share the card's direction: `phrase` backs are in the target
 * language and `word` backs are in the native one, so mixing them hands the
 * answer over on language alone. Same category on top of that keeps them
 * plausible instead of merely well-formed.
 */
function buildChoices(card) {
  const siblings = app.cards.filter(
    (other) => other.id !== card.id && other.back !== card.back && other.type === card.type,
  );
  const near = siblings.filter((other) => other.category === card.category);
  const seen = new Set([card.back]);
  const picks = [];
  // Same category first, then the rest of the same direction, then anything at
  // all — a small deck should still get four options rather than a giveaway.
  for (const pool of [near, siblings, app.cards]) {
    for (const other of shuffle(pool)) {
      if (picks.length === 3) break;
      if (other.id === card.id || seen.has(other.back)) continue;
      seen.add(other.back);
      picks.push(other.back);
    }
  }
  return shuffle([card.back, ...picks]);
}

function renderStudy() {
  const session = app.session;
  const page = $('#page-study');

  page.dataset.idle = '1';
  if (!session) {
    page.innerHTML = `<div class="stage">${emptyState({
      art: {
        src: 'empty-session.png',
        alt: 'Flat pastel illustration: a single flashcard lying face down on a mint surface with a soft cast shadow, no text',
      },
      title: t('No session running'),
      body: t('Pick a category from the overview, or start with everything that is due.'),
      action: `<button class="btn btn-primary" data-act="start" data-value="">${icon('play', 'icon-sm icon')} ${esc(t('Start with what is due'))}</button>`,
    })}</div>`;
    return;
  }

  if (session.index >= session.queue.length) return renderSummary(page, session);

  delete page.dataset.idle;
  const card = currentCard();
  const info = meta(card.category);
  const done = session.index / session.queue.length;

  const learn = session.mode === 'learn' && app.cards.length >= 4;

  page.innerHTML = `
    <div class="study-bar">
      <button class="btn btn-quiet" data-act="quit" aria-label="${esc(t('Leave the session'))}">
        ${icon('arrow-left', 'icon-sm icon')} ${esc(t('Leave'))}
      </button>
      <div class="segmented" role="group" aria-label="${esc(t('Study mode'))}">
        ${['flashcards', 'learn']
          .map(
            (mode) => `<button data-act="session-mode" data-value="${mode}" aria-pressed="${session.mode === mode}">
              ${icon(mode === 'flashcards' ? 'layers' : 'brain', 'icon-sm icon')}
              ${esc(t(MODE_LABEL[mode]))}
            </button>`,
          )
          .join('')}
      </div>
      <button class="star" data-act="favorite" data-value="${card.id}"
        aria-pressed="${!!card.isFavorite}"
        aria-label="${esc(card.isFavorite ? t('Remove from favourites') : t('Add to favourites'))}">
        ${icon('star', 'icon-sm icon')}
      </button>
    </div>

    <div class="stage">
      <div class="card-face">
        <div class="face-ask">
          <div class="tags">
            <span class="tag" style="${tintOf(card.category)}">${icon(info.icon)}${esc(info.label)}</span>
            ${card.cefr ? `<span class="level">${esc(card.cefr)}</span>` : ''}
            ${card.isNew ? `<span class="tag" style="${tintOf('everyday')}">${icon('sparkles')}${esc(t('New'))}</span>` : ''}
          </div>
          <div class="prompt">${esc(card.front)}</div>
          ${originLine(card)}
        </div>
        <div class="face-tell">
          ${learn ? learnBody(session, card) : flashBody(session, card)}
        </div>
      </div>
      ${learn ? '' : flashGrades(session)}
    </div>

    ${sessionPanel(session, done)}

    <div class="keys">${keyHints(session)}</div>`;
}

/** Session progress, beside the card rather than crammed into the top bar. */
function sessionPanel(session, done) {
  const seen = session.queue.slice(0, session.index).reverse();
  const left = session.queue.length - session.index;

  return `<aside class="session">
    <div class="session-head">
      <span class="session-count">${session.index + 1}<span class="of"> / ${session.queue.length}</span></span>
      <span class="progress-track"><i style="--p:${done.toFixed(4)}"></i></span>
    </div>

    <div class="tally">
      <span class="known">${icon('check', 'icon-sm icon')}${session.known}</span>
      <span class="learning">${icon('rotate-ccw', 'icon-sm icon')}${session.learning}</span>
    </div>

    ${
      seen.length
        ? `<ul class="session-log">
            ${seen
              .map(
                (card) => `<li class="logged" data-grade="${card.lastGrade || ''}">
                  ${icon(card.lastGrade >= 3 ? 'check' : 'rotate-ccw', 'icon-sm icon')}
                  <span>${esc(card.front)}</span>
                </li>`,
              )
              .join('')}
          </ul>`
        : `<p class="session-empty">${t('What you answer shows up here.')}</p>`
    }

    ${left > 1 ? `<p class="session-left">${esc(t('{n} still to come', { n: left - 1 }))}</p>` : ''}
  </aside>`;
}

function flashBody(session, card) {
  if (!session.revealed) {
    return `<button class="btn btn-primary reveal-btn" data-act="reveal">
      ${icon('eye', 'icon-sm icon')} ${esc(t('Show the answer'))}
    </button>`;
  }
  return `<div class="reveal">
    <div class="answer">${esc(card.back)}</div>
    ${keywordRow(card)}
    ${card.example ? `<p class="example">${esc(card.example)}</p>` : ''}
  </div>`;
}

function flashGrades(session) {
  if (!session.revealed) return '';
  return `<div class="grades">
    ${GRADES.slice(1)
      .map(
        (grade) => `<button class="grade" data-act="grade" data-value="${grade.n}"
          style="--tint:var(--${grade.tint});--tint-ink:var(--${grade.tint}-ink)">
          <span>${grade.n} · ${esc(t(grade.label))}</span>
          <span class="when">${esc(t(grade.hint))}</span>
        </button>`,
      )
      .join('')}
  </div>`;
}

/** A keyword identical to the answer is not a hint, it is the answer printed twice. */
function keywordRow(card) {
  const said = new Set([card.front, card.back].map((t) => String(t).toLowerCase().trim()));
  const words = (card.keywords || []).filter((word) => !said.has(String(word).toLowerCase().trim()));
  if (!words.length) return '';
  return `<div class="keywords">${words.map((word) => `<span class="keyword">${esc(word)}</span>`).join('')}</div>`;
}

function learnBody(session, card) {
  if (!session.choices) session.choices = buildChoices(card);
  const answered = session.answered;

  return `<div class="choices" ${answered ? 'data-answered' : ''}>
    ${session.choices
      .map((choice, i) => {
        let state = '';
        if (answered) {
          if (choice === card.back) state = 'right';
          else if (choice === answered.picked) state = 'wrong';
          else state = 'muted';
        }
        return `<button class="choice" data-act="choose" data-value="${esc(choice)}" ${state ? `data-state="${state}"` : ''}>
          <span class="key">${i + 1}</span><span>${esc(choice)}</span>
        </button>`;
      })
      .join('')}
  </div>
  ${
    answered
      ? `<div class="verdict" style="color:var(--${answered.correct ? 'mint' : 'rose'}-ink)">
          ${icon(answered.correct ? 'circle-check' : 'circle-alert', 'icon-sm icon')}
          ${answered.correct ? esc(t('Right — scheduled further out')) : t('Not quite. It is <b>{answer}</b>', { answer: esc(card.back) })}
        </div>
        ${card.example ? `<p class="example">${esc(card.example)}</p>` : ''}
        <button class="btn btn-primary next-btn" data-act="next">
          ${esc(t('Next'))} ${icon('arrow-right', 'icon-sm icon')}
        </button>`
      : ''
  }`;
}

function originLine(card) {
  const parts = [card.project, card.ts ? new Date(card.ts).toLocaleDateString(UI_LANG) : ''].filter(Boolean);
  return parts.length
    ? `<div class="origin">${icon('clock', 'icon-sm icon')} ${esc(t('you needed this in {where}', { where: parts.join(' · ') }))}</div>`
    : '';
}

function keyHints(session) {
  const hint = (keys, what) =>
    `<span>${keys.map((key) => `<kbd>${key}</kbd>`).join('')}<b>${esc(t(what))}</b></span>`;
  const leave = hint(['esc'], 'leave');

  if (session.mode === 'learn') {
    return session.answered
      ? hint(['↵'], 'next card') + leave
      : hint(['1', '2', '3', '4'], 'pick an answer') + leave;
  }
  return session.revealed
    ? hint(['1'], 'again') + hint(['2'], 'hard') + hint(['3'], 'good') + hint(['4'], 'easy') +
        hint(['d'], 'junk') + leave
    : hint(['space'], 'show the answer') + leave;
}

function renderSummary(page, session) {
  const total = session.graded || session.queue.length;
  const share = total ? session.known / total : 0;
  page.innerHTML = `<div class="stage">
    <div class="card-face enter">
      <div style="display:grid;place-items:center;margin-bottom:24px">
        ${ring(share, { size: 96, label: pct(share), hole: 'var(--plate)' })}
      </div>
      <h1 style="font-size:2.5rem;margin:0 auto">${esc(session.known === total ? t('Clean run') : t('Session done'))}</h1>
      <p class="lede" style="margin:14px auto 0">
        ${esc(t('{cards} reviewed · {known} you knew · {learning} coming back sooner.', {
          cards: tn(total, 'card', 'cards'),
          known: session.known,
          learning: session.learning,
        }))}
      </p>
      <div class="grades">
        ${
          session.learning
            ? `<button class="btn btn-primary" data-act="start" data-value="${session.category}">
                ${icon('rotate-ccw', 'icon-sm icon')} ${esc(t('Another round'))}
              </button>`
            : ''
        }
        <button class="btn" data-act="go" data-value="overview">${icon('layout-dashboard', 'icon-sm icon')} ${esc(t('Back to overview'))}</button>
      </div>
    </div>
  </div>`;
}

/* Grading. Learn maps its single click onto the same four FSRS ratings:
   a fast right answer is Easy, a slow one Good, a miss is Again. */
async function grade(rating) {
  const session = app.session;
  const card = currentCard();
  if (!session || !card || session.busy) return;
  session.busy = true;
  try {
    const result = await api('/grade', { id: card.id, rating });
    session.graded++;
    card.lastGrade = rating; // the session log reports what you actually pressed
    if (rating >= 3) session.known++;
    else session.learning++;
    card.isDue = false;
    card.isNew = false;
    card.due = result.due;
    toast(t('{grade} — back {when}', { grade: t(GRADES[rating].label), when: relativeDay(result.due) }));
  } catch (error) {
    toast(error.message || t('Could not save that grade'), 'error');
    session.busy = false;
    return;
  }
  session.busy = false;
  advance();
}

async function junk() {
  const session = app.session;
  const card = currentCard();
  if (!session || !card || session.busy) return;
  session.busy = true;
  try {
    await api('/delete', { id: card.id, reason: 'user marked junk in review' });
    app.cards = app.cards.filter((other) => other.id !== card.id);
    toast(t('Thrown away'));
  } catch (error) {
    toast(error.message || t('Could not delete that card'), 'error');
  }
  session.busy = false;
  advance();
}

function advance() {
  const session = app.session;
  const page = $('#page-study');
  page.classList.add('turning');
  setTimeout(() => {
    session.index++;
    session.revealed = false;
    session.choices = null;
    session.answered = null;
    session.asked = Date.now();
    renderStudy();
    page.classList.remove('turning');
    if (session.index >= session.queue.length) refresh();
  }, 170);
}

function choose(picked) {
  const session = app.session;
  const card = currentCard();
  if (!session || !card || session.answered) return;
  const correct = picked === card.back;
  const quick = Date.now() - (session.asked || Date.now()) < 5000;
  session.answered = { picked, correct, rating: correct ? (quick ? 4 : 3) : 1 };
  renderStudy();
}

/* ── Settings ─────────────────────────────────────────────────────── */

const langOptions = (selected) =>
  LANGUAGES.map(
    ([code, name]) =>
      `<option value="${code}" ${code === selected ? 'selected' : ''}>${esc(name)} · ${code}</option>`,
  ).join('');

function setting(title, description, control) {
  return `<div class="setting">
    <div class="setting-copy"><div class="t">${title}</div><div class="d">${description}</div></div>
    <div class="setting-control">${control}</div>
  </div>`;
}

function renderSettings() {
  const cfg = app.config;

  $('#page-settings').innerHTML = `
    <div class="page-head">
      <div>
        <h1>${t('Settings')}</h1>
        <p class="lede">${t('Everything here is written to <code style="font-size:.85em">settings.json</code> in the plugin data directory and takes effect immediately — for the trainer and for the capture hooks alike.')}</p>
      </div>
    </div>

    <div class="settings">
      <div class="section-head"><h2>${t('Languages')}</h2></div>
      <div class="lang-pair">
        <label class="field">
          <span class="field-label">${t('You write prompts in')}</span>
          <select class="select" data-setting="native">${langOptions(cfg.native)}</select>
        </label>
        <button class="swap" data-act="swap-langs" aria-label="${esc(t('Swap the two languages'))}">
          ${icon('arrow-right-left', 'icon-sm icon')}
        </button>
        <label class="field">
          <span class="field-label">${t('You are learning')}</span>
          <select class="select" data-setting="target">${langOptions(cfg.target)}</select>
        </label>
      </div>
      ${setting(
        t('Interface language'),
        t('Separate from what you are learning. Changing your target language never changes this.'),
        // The value shown is the language actually being rendered, not the raw
        // setting — a control that claims a language with no dictionary lies.
        `<select class="select" data-setting="uiLang">
          ${['en', ...(app.uiLanguages || [])]
            .filter((code, i, all) => all.indexOf(code) === i)
            .map(
              (code) =>
                `<option value="${code}" ${UI_LANG === code ? 'selected' : ''}>${esc(languageName(code))}</option>`,
            )
            .join('')}
        </select>`,
      )}

      <p class="field-hint">${t('Nothing is ever deleted by this. Each pair is its own deck: the cards you already have keep the pair they were built with and the schedule they earned, and switching simply opens a different one. Learn <b>en</b>, <b>pl</b> and <b>es</b> side by side if you like.')}</p>

      <div class="decks">${deckChips()}</div>
      <p class="field-hint">${t('Your decks. The open one is filled in; the number is how many cards it holds.')}</p>

      <div class="section-head"><h2>${t('Capture')}</h2></div>
      ${setting(
        t('What gets captured'),
        t('<b>Active</b> takes your own prompts and shows how a native speaker would have put it. <b>Passive</b> takes unfamiliar words out of the assistant\u2019s replies. <b>Both</b> does each.'),
        `<select class="select" data-setting="mode">
          ${['active', 'passive', 'both']
            .map((mode) => `<option value="${mode}" ${cfg.mode === mode ? 'selected' : ''}>${esc(t(mode))}</option>`)
            .join('')}
        </select>`,
      )}
      ${setting(
        t('Floor level'),
        t('Words below this CEFR level never become cards. Leave it open if you want everything.'),
        `<select class="select" data-setting="level">
          <option value="" ${!cfg.level ? 'selected' : ''}>${esc(t('No floor'))}</option>
          ${LEVELS.map(
            (level) =>
              `<option value="${level}" ${cfg.level === level ? 'selected' : ''}>${level} · ${esc(levelBlurb(level))}</option>`,
          ).join('')}
        </select>`,
      )}
      ${setting(
        t('Offer to build at session end'),
        t('When a work session leaves ten or more captured records behind, Claude asks once whether to turn them into cards.'),
        `<button class="switch" role="switch" data-setting="autoBuild" aria-checked="${!!cfg.autoBuild}"
          aria-label="${esc(t('Offer to build at session end'))}"></button>`,
      )}

      <div class="section-head"><h2>${t('Study')}</h2></div>
      ${setting(
        t('New cards per day'),
        t('A cap on unseen cards only. Reviews that are due are never held back — those are the ones that decay.'),
        `<input class="input" type="number" min="3" max="50" step="1" value="${cfg.dailyLimit}" data-setting="dailyLimit">`,
      )}
      ${setting(
        t('Default mode'),
        t('<b>Flashcards</b> asks you to recall and grade yourself against FSRS. <b>Learn</b> offers four candidates and grades the click for you — faster for cards you have never met.'),
        `<div class="segmented" role="group" aria-label="${esc(t('Default study mode'))}">
          ${['flashcards', 'learn']
            .map(
              (mode) => `<button data-act="study-mode" data-value="${mode}" aria-pressed="${cfg.studyMode === mode}">
                ${esc(t(MODE_LABEL[mode]))}</button>`,
            )
            .join('')}
        </div>`,
      )}

      <div class="section-head"><h2>${t('Appearance')}</h2></div>
      ${setting(
        t('Theme'),
        t('The trainer often sits next to an editor. Match it, or follow the system.'),
        `<div class="segmented" role="group" aria-label="${esc(t('Theme'))}">
          ${[
            ['light', 'sun'],
            ['dark', 'moon'],
            ['system', 'monitor'],
          ]
            .map(
              ([value, ic]) => `<button data-act="theme-set" data-value="${value}"
                aria-pressed="${cfg.theme === value}" aria-label="${esc(t(value))}">${icon(ic, 'icon-sm icon')}</button>`,
            )
            .join('')}
        </div>`,
      )}

      <div class="section-head"><h2>${t('Your data')}</h2></div>
      ${setting(
        t('Export to Anki'),
        t('A CSV of every card with its scheduling state. Nothing has ever left this machine — this file is the only way out.'),
        `<button class="btn" data-act="export">${icon('download', 'icon-sm icon')} ${esc(t('Download CSV'))}</button>`,
      )}
      ${setting(
        t('Read it on your phone'),
        t('Point this at your Obsidian vault and the deck is written there as markdown — one note per card plus an index. Your vault\u2019s own sync carries it to the phone; grading still happens here. Leave it empty to write nothing.'),
        `<input class="input" type="text" spellcheck="false" placeholder="${esc(t('/path/to/Vault'))}"
          value="${esc(cfg.vault || '')}" data-setting="vault" aria-label="${esc(t('Obsidian vault folder'))}">`,
      )}
      ${
        cfg.vault
          ? setting(
              t('Export now'),
              t('Runs automatically after every <code>/loanword:build</code>. Only notes whose content changed are rewritten, so an unchanged deck causes no sync traffic.'),
              `<button class="btn" data-act="obsidian">${icon('book-open', 'icon-sm icon')} ${esc(t('Write to the vault'))}</button>`,
            )
          : ''
      }

      <div class="section-head"><h2>Loanword</h2></div>
      ${setting(
        t('Made by @levan_fewnix'),
        t('Questions, a bug, or a word the card-builder mangled — the fastest way to reach me is a DM on X.'),
        `<a class="contact" href="https://x.com/levan_fewnix" target="_blank" rel="noopener">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          @levan_fewnix
        </a>`,
      )}
      ${setting(
        t('Privacy'),
        t('Secrets are scrubbed before anything is written, code and tool output are never captured at all, and the review server binds <code style="font-size:.85em">127.0.0.1</code> only. No accounts, no telemetry.'),
        `<a class="btn" href="https://github.com/MarcSky/loanword" target="_blank" rel="noopener">
          ${icon('book-open', 'icon-sm icon')} ${esc(t('Read the rules'))}</a>`,
      )}
    </div>`;
}

/* ── Settings plumbing ────────────────────────────────────────────── */

let saveTimer;
async function saveSetting(key, value) {
  app.config[key] = value;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      app.config = await api('/settings', { [key]: value });
      toast(t('Saved'));
      if (key === 'uiLang') {
        await loadLanguage();
        renderShortcuts();
        render();
        return;
      }
      if (key === 'native' || key === 'target') {
        // A different pair is a different deck: drop any scope or session that
        // belonged to the one we just closed.
        app.category = '';
        app.level = '';
        app.session = null;
        await refresh();
      }
    } catch (error) {
      toast(error.message || t('Could not save'), 'error');
    }
  }, 250);
}

function applyTheme(theme) {
  const dark =
    theme === 'dark' ||
    (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const railIcon = $('.rail-btn[data-act="theme"] use');
  if (railIcon) railIcon.setAttribute('href', `icons.svg#i-${dark ? 'moon' : 'sun'}`);
}

/* ── Routing ──────────────────────────────────────────────────────── */

function renderRail() {
  const due = app.cards.filter((card) => card.isDue).length;
  $('#rail').innerHTML = ROUTES.map(
    (route) => `<button class="rail-btn" data-act="go" data-value="${route.id}"
      ${app.route === route.id ? 'aria-current="page"' : ''} title="${esc(t(route.label))}" aria-label="${esc(t(route.label))}">
      ${icon(route.icon)}
      ${route.id === 'study' && due ? '<span class="badge"></span>' : ''}
    </button>`,
  ).join('');
}

const RENDER = {
  overview: renderOverview,
  deck: renderDeck,
  study: renderStudy,
  settings: renderSettings,
};

function render() {
  renderRail();
  $$('.page').forEach((page) => delete page.dataset.active);
  const page = $(`#page-${app.route}`);
  page.dataset.active = '1';
  RENDER[app.route]();
}

function go(route) {
  if (!RENDER[route]) route = 'overview';
  app.route = route;
  if (location.hash !== `#/${route}`) location.hash = `#/${route}`;
  else render();
  document.querySelector('#main').scrollTo?.({ top: 0 });
}

async function refresh() {
  // The interface language follows `native`, so a deck switch can change it.
  await loadLanguage();
  renderShortcuts();
  await load();
  render();
}

/* ── Events ───────────────────────────────────────────────────────── */

const ACTIONS = {
  go: (value) => go(value),
  start: (value) => startSession(value),
  'start-filtered': () => {
    const ids = new Set(deckCards().filter((card) => card.isDue).map((card) => card.id));
    const pool = app.cards.filter((card) => ids.has(card.id));
    if (!pool.length) return toast(t('Nothing due in this selection'));
    app.session = {
      category: '', mode: app.config.studyMode || 'flashcards', queue: shuffle(pool),
      index: 0, revealed: false, known: 0, learning: 0, graded: 0,
      choices: null, answered: null, asked: Date.now(), busy: false,
    };
    go('study');
  },
  reveal: () => {
    app.session.revealed = true;
    renderStudy();
  },
  grade: (value) => grade(Number(value)),
  choose: (value) => choose(value),
  next: () => grade(app.session.answered.rating),
  quit: () => {
    app.session = null;
    refresh().then(() => go('overview'));
  },
  'session-mode': (value) => {
    app.session.mode = value;
    app.session.choices = null;
    app.session.answered = null;
    app.session.revealed = false;
    app.session.asked = Date.now();
    saveSetting('studyMode', value);
    renderStudy();
  },
  'study-mode': (value) => {
    saveSetting('studyMode', value);
    render();
  },
  'overview-level': (value) => {
    app.level = value;
    renderOverview();
  },
  'overview-category': (value) => {
    app.category = value;
    renderOverview();
  },
  'open-deck': async (value) => {
    const [native, target] = String(value).split('>');
    if (native === app.config.native && target === app.config.target) return;
    app.config = await api('/settings', { native, target });
    app.category = '';
    app.level = '';
    app.session = null;
    await refresh();
    toast(t('Now studying {lang}', { lang: languageName(app.config.target) }));
  },
  'deck-category': (value) => {
    app.deck.category = value;
    renderDeck();
  },
  'deck-level': (value) => {
    app.deck.level = value;
    renderDeck();
  },
  'deck-status': (value) => {
    app.deck.status = value;
    renderDeck();
  },
  'deck-view': (value) => {
    app.deck.view = value;
    renderDeck();
  },
  favorite: async (id) => {
    const card = app.cards.find((other) => other.id === id);
    if (!card) return;
    const on = !card.isFavorite;
    card.isFavorite = on; // optimistic: the star must not lag the click
    RENDER[app.route]();
    try {
      await api('/favorite', { id, on });
    } catch (error) {
      card.isFavorite = !on;
      RENDER[app.route]();
      toast(error.message || t('Could not save that'), 'error');
    }
  },
  'deck-reset': () => {
    app.deck = { ...app.deck, category: '', level: '', status: 'all', query: '' };
    renderDeck();
  },
  export: () => {
    location.href = '/export.csv';
  },
  obsidian: async () => {
    try {
      const out = await api('/obsidian', { vault: app.config.vault });
      toast(t('{n} notes written to the vault', { n: out.written }));
    } catch (error) {
      toast(error.message || t('Could not write to the vault'), 'error');
    }
  },
  'swap-langs': async () => {
    const { native, target } = app.config;
    app.config = await api('/settings', { native: target, target: native });
    app.category = '';
    app.level = '';
    app.session = null;
    await refresh();
    toast(t('Now {from} → {to}', { from: languageName(app.config.native), to: languageName(app.config.target) }));
  },
  'theme-set': (value) => {
    applyTheme(value);
    saveSetting('theme', value);
    renderSettings();
  },
  theme: () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    saveSetting('theme', next);
    if (app.route === 'settings') renderSettings();
  },
  shortcuts: () => $('#shortcuts').showModal(),
  'close-shortcuts': () => $('#shortcuts').close(),
};

document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-act]');
  if (!trigger || trigger.getAttribute('aria-disabled') === 'true') return;
  const handler = ACTIONS[trigger.dataset.act];
  if (handler) {
    event.preventDefault();
    handler(trigger.dataset.value);
  }
});

document.addEventListener('input', (event) => {
  const field = event.target;
  if (field.id === 'deck-search') {
    app.deck.query = field.value;
    renderDeck();
    $('#deck-search').focus();
    return;
  }
  if (!field.dataset.setting) return;
  const key = field.dataset.setting;
  saveSetting(key, key === 'dailyLimit' ? Number(field.value) : field.value);
});

document.addEventListener('click', (event) => {
  const toggle = event.target.closest('[role="switch"][data-setting]');
  if (!toggle) return;
  const next = toggle.getAttribute('aria-checked') !== 'true';
  toggle.setAttribute('aria-checked', String(next));
  saveSetting(toggle.dataset.setting, next);
});

addEventListener('keydown', (event) => {
  const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName);

  if (event.key === '?' && !typing) return ACTIONS.shortcuts();
  if (event.key === 'Escape' && $('#shortcuts').open) return ACTIONS['close-shortcuts']();

  if (app.route === 'study' && app.session) {
    const session = app.session;
    if (event.key === 'Escape') return ACTIONS.quit();
    if (session.index >= session.queue.length) return;

    if (session.mode === 'learn') {
      if (session.answered && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        return ACTIONS.next();
      }
      const pick = Number(event.key);
      if (!session.answered && pick >= 1 && pick <= session.choices.length) {
        return choose(session.choices[pick - 1]);
      }
      return;
    }

    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (!session.revealed) return ACTIONS.reveal();
      return;
    }
    if (!session.revealed) return;
    if (event.key >= '1' && event.key <= '4') return grade(Number(event.key));
    if (event.key.toLowerCase() === 'd') return junk();
    return;
  }

  if (typing) return;
  if (event.key === '/') {
    event.preventDefault();
    if (app.route !== 'deck') go('deck');
    return $('#deck-search')?.focus();
  }
  if (event.key.toLowerCase() === 't') return ACTIONS.theme();
  const index = Number(event.key);
  if (index >= 1 && index <= ROUTES.length) go(ROUTES[index - 1].id);
});

addEventListener('hashchange', () => {
  const route = location.hash.replace(/^#\/?/, '') || 'overview';
  app.route = RENDER[route] ? route : 'overview';
  render();
});

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (app.config.theme === 'system' || !app.config.theme) applyTheme('system');
});

/* ── Boot ─────────────────────────────────────────────────────────── */

function renderShortcuts() {
  $('#shortcuts h2').textContent = t('Keyboard');
  $('#shortcut-list').innerHTML = SHORTCUTS()
    .map(
      ([keys, what]) =>
        `<dt style="text-align:end">${keys.split(' ').map((key) => `<kbd>${esc(key)}</kbd>`).join('')}</dt>
         <dd style="margin:0;color:var(--ink-2)">${esc(what)}</dd>`,
    )
    .join('');
}

$('#shortcuts').addEventListener('click', (event) => {
  if (event.target.id === 'shortcuts') $('#shortcuts').close();
});

try {
  // Language first: every render below reads the dictionary synchronously.
  await loadLanguage();
  renderShortcuts();
  await load();
  const hash = location.hash.replace(/^#\/?/, '');
  app.route = RENDER[hash] ? hash : 'overview';
  render();
} catch (error) {
  document.querySelector('#main').innerHTML = `<div class="page" data-active><div class="empty">
    <h2>${t('The trainer could not reach its own server')}</h2>
    <p>${esc(error.message)}. ${t('Restart it with <code>/loanword:review</code>.')}</p>
  </div></div>`;
}
