import { NAME_PAIRS, flagOf, isRtl, languageName, scriptOf } from './languages.js';
import { flyDirection, swipeTint, swipeVerdict } from './quiz.js';
import { railState } from './shell.js';
import { summarize } from './chapters.js';
import { SESSION_LENGTHS } from './limits.js';
import { ALL_CATEGORIES, CATEGORY, CORE, FIELDS, categoriesForField, categoriesOf, groupByCategory } from './categories.js';


export { ALL_CATEGORIES, CATEGORY, CORE, FIELDS, categoriesForField, categoriesOf, groupByCategory };

export const categoryKeys = () => categoriesOf(app.config.categories);

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const LEVEL_BLURB = {
  A1: 'Breakthrough',
  A2: 'Waystage',
  B1: 'Threshold',
  B2: 'Vantage',
  C1: 'Advanced',
  C2: 'Mastery',
};

export const LANGUAGES = NAME_PAIRS;
export { languageName, flagOf, isRtl, scriptOf };

export const ROUTES = [
  { id: 'overview', label: 'Overview', icon: 'house' },
  { id: 'practice', label: 'Practice', icon: 'lightning' },
  { id: 'deck', label: 'Deck', icon: 'cards-three' },
  { id: 'study', label: 'Study', icon: 'graduation-cap' },
  { id: 'analytics', label: 'Analytics', icon: 'chart-bar' },
  { id: 'settings', label: 'Settings', icon: 'gear-six' },
];

export const MODE_LABEL = {
  present: 'First look',
  flashcards: 'Flashcards',
  learn: 'Learn',
  cloze: 'Cloze',
  type: 'Type it',
  reverse: 'Reverse',
};

export const GRADES = [
  null,
  { n: 1, label: 'Again', hint: 'no idea', tint: 'grade-again' },
  { n: 2, label: 'Hard', hint: 'barely', tint: 'grade-hard' },
  { n: 3, label: 'Good', hint: 'got it', tint: 'grade-good' },
  { n: 4, label: 'Easy', hint: 'instant', tint: 'grade-easy' },
];

export { SESSION_LENGTHS };

export const SHORTCUTS = () => [
  ['1 – 6', t('Jump to a section')],
  ['space', t('Show the answer')],
  ['1 2 3 4', t('Again / Hard / Good / Easy')],
  ['enter', t('Submit a typed answer, or go to the next card')],
  ['s', t('Say the phrase out loud, again for the example')],
  ['d', t('Throw the card away as junk')],
  ['u', t('Undo the last card you threw away')],
  ['r', t('Five more minutes, on the summary screen')],
  ['/', t('Search the deck')],
  ['t', t('Switch theme')],
  ['[', t('Collapse or expand the sidebar')],
  ['?', t('This list')],
  ['esc', t('Leave the session')],
];

export const app = {
  loaded: false,
  cards: [],
  pairs: [],
  uiLanguages: [],
  stats: null,
  config: {},
  route: 'overview',
  level: '',
  category: '',
  deck: { category: '', level: '', status: 'all', query: '', view: 'list', editing: null, editReturn: '', topic: '', openAll: false },
  session: null,
  sync: null,
  export: null,
  duplicates: null,
  queue: null,
  offline: false,
  ability: null,
  startingPolls: 0,
  chapter: null,
  dropping: null,
  opened: null,
  picks: new Set(),
  picking: false,
  adding: null,
  topics: null,
  filing: null,
  analytics: { range: '30d', category: [], cefr: [], data: null, loading: false, tables: new Set() },
};

export const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);

export const icon = (name, cls = 'icon') =>
  `<svg class="${cls}" aria-hidden="true"><use href="icons.svg#i-${name}"></use></svg>`;

export const meta = (key) => {
  const info = CATEGORY[key] || CATEGORY.everyday;
  return { ...info, label: t(info.label), blurb: t(info.blurb) };
};

export const levelBlurb = (level) => (LEVEL_BLURB[level] ? t(LEVEL_BLURB[level]) : '');

export const tintOf = (key) => {
  const { tint } = meta(key);
  return `--tint:var(--${tint});--tint-ink:var(--${tint}-ink)`;
};

export const pct = (value) => `${Math.round((value || 0) * 100)}%`;

let DICT = {};
export let UI_LANG = 'en';
let PLURAL = new Intl.PluralRules('en');

export function t(text, vars) {
  let out = DICT[text] ?? text;
  if (vars) for (const [key, value] of Object.entries(vars)) out = out.split(`{${key}}`).join(value);
  return out;
}

export function tn(n, one, many) {
  const forms = DICT[`${one}|${many}`];
  const word = forms ? forms[PLURAL.select(n)] || forms.other || many : n === 1 ? one : many;
  return `${n} ${word}`;
}

export async function loadLanguage() {
  try {
    const pack = await api('/i18n');
    DICT = pack.strings && typeof pack.strings === 'object' ? pack.strings : {};
    UI_LANG = pack.lang || 'en';
    PLURAL = new Intl.PluralRules(UI_LANG);
    document.documentElement.lang = UI_LANG;
    document.documentElement.dir = pack.dir || 'ltr';
    document.documentElement.dataset.script = scriptOf(UI_LANG);
  } catch {
    DICT = {};
  }
}

const dirOf = (code) => (isRtl(code) ? 'rtl' : 'ltr');

export const langAttrs = (code) => `lang="${code || ''}" dir="${dirOf(code)}"`;

export function relativeDay(iso) {
  if (!iso) return '';
  const days = Math.round((new Date(iso) - Date.now()) / 864e5);
  try {
    return new Intl.RelativeTimeFormat(UI_LANG, { numeric: 'auto' }).format(days, 'day');
  } catch {
    return `${Math.abs(days)}d`;
  }
}

export function ago(iso) {
  if (!iso) return '';
  const days = Math.round((new Date(iso) - Date.now()) / 864e5);
  const [value, unit] =
    Math.abs(days) < 30 ? [days, 'day'] : Math.abs(days) < 365 ? [Math.round(days / 30), 'month'] : [Math.round(days / 365), 'year'];
  try {
    return new Intl.RelativeTimeFormat(UI_LANG, { numeric: 'auto' }).format(value, unit);
  } catch {
    return `${Math.abs(days)}d`;
  }
}

export const shortDay = (day) => {
  try {
    return new Intl.DateTimeFormat(UI_LANG, { month: 'short', day: 'numeric' }).format(new Date(`${day}T12:00:00`));
  } catch {
    return day;
  }
};

export const monthName = (yearMonth) => {
  try {
    return new Intl.DateTimeFormat(UI_LANG, { month: 'short' }).format(new Date(`${yearMonth}-15T12:00:00`));
  } catch {
    return yearMonth;
  }
};

export const weekdayName = (index, style = 'short') => {
  try {
    return new Intl.DateTimeFormat(UI_LANG, { weekday: style }).format(new Date(2024, 0, 7 + index));
  } catch {
    return ['S', 'M', 'T', 'W', 'T', 'F', 'S'][index];
  }
};

const RECONNECT_MS = 3000;

export function offline() {
  if (app.offline) return;
  app.offline = true;
  const main = $('#main');
  if (main) {
    main.innerHTML = `<div class="page" data-active>${emptyState({
      art: {
        src: 'offline-error.webp',
        alt: 'Flat line illustration: a laptop with its cable unplugged, a person leaning in to look; thin black outline, blue and beige fills, white background, no text',
      },
      title: t('The trainer is not running'),
      body: t('Start it with <code>loanword</code> in a terminal, or <code>/loanword:start</code> in Claude Code. This page reconnects on its own.'),
    })}</div>`;
  }
  const again = setInterval(async () => {
    try {
      const reply = await fetch('/state', { cache: 'no-store' });
      if (reply.ok) {
        clearInterval(again);
        location.reload();
      }
    } catch {}
  }, RECONNECT_MS);
  return again;
}

export async function api(path, payload) {
  const options = payload
    ? {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }
    : {};
  let response;
  try {
    response = await fetch(path, options);
  } catch {
    offline();
    throw new Error(t('The trainer is not running'));
  }
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || response.statusText);
  return response.json();
}

export async function load() {
  const state = await api('/state');

  app.cards = state.cards.map((card) => ({
    ...card,
    isFavorite: !!card.starred,
    haystack: [card.front, card.back, card.example, ...(card.keywords || [])].join(' ').toLowerCase(),
  }));
  app.pairs = state.pairs || [];
  app.uiLanguages = state.uiLanguages || [];
  app.stats = state.stats;
  app.usage = state.usage || null;
  app.config = state.config;
  app.queued = state.queued || 0;
  app.building = !!state.building;
  app.filing = state.filing || null;
  app.targets = state.targets || [];
  app.speech = state.speech || {};
  app.peekMatches = state.peekMatches ?? 0;
  app.alphabet = state.alphabet || null;
  app.starter = state.starter || null;
  app.ability = state.ability || null;
  app.loaded = true;
  applyTheme(app.config.theme);
}

let toastTimer;
export function toast(message, tone = 'ok', action = '') {
  const node = $('#toast');
  node.innerHTML = `${icon(tone === 'error' ? 'warning-circle' : 'check-circle', 'icon-sm icon')}<span>${esc(message)}</span>${action}`;
  node.dataset.tone = tone;
  node.dataset.show = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => delete node.dataset.show, action ? 6000 : 2600);
}

export const hideToast = () => {
  clearTimeout(toastTimer);
  delete $('#toast').dataset.show;
};

export const inLevel = (card, level) => !level || card.cefr === level;

export { summarize };

export function byCategory(level) {
  const buckets = groupByCategory(app.cards.filter((card) => inLevel(card, level)));
  return categoryKeys().map((key) => ({ key, ...summarize(buckets.get(key) || []) }));
}

export function ring(value, { size = 40, label = pct(value), hole = 'var(--tint)' } = {}) {
  return `<div class="ring" style="--value:${value.toFixed(3)};--size:${size}px;--ring-hole:${hole}"
    role="img" aria-label="${esc(t('{n} mastered', { n: label }))}"><span class="ring-label">${esc(label)}</span></div>`;
}

export function levelChips(active, action) {
  return `<div class="filters" role="group" aria-label="${esc(t('Filter by CEFR level'))}">
    <button class="chip chip-sm" data-act="${action}" data-value="" aria-pressed="${active === ''}">${esc(t('All levels'))}</button>
    ${LEVELS.map(
      (level) => `<button class="chip chip-sm" data-act="${action}" data-value="${level}"
        aria-pressed="${active === level}" title="${esc(levelBlurb(level))}">${level}</button>`,
    ).join('')}
  </div>`;
}

export function categoryChips(active, action) {
  return `<div class="filters" role="group" aria-label="${esc(t('Filter by category'))}">
    <button class="chip" data-act="${action}" data-value="" aria-pressed="${active === ''}">
      <span class="dot">${icon('cards-three')}</span>${esc(t('All'))}
    </button>
    ${categoryKeys()
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

export function emptyState({ art, title, body, action = '' }) {
  const name = art.src.replace(/\.webp$/, '');
  return `<div class="empty enter">
    <div class="art-frame"><img class="art" src="art/${name}.webp" data-art="${name}" alt="${esc(art.alt)}" width="640" height="480"></div>
    <h2>${title}</h2>
    <p>${body}</p>
    ${action}
  </div>`;
}

export function weekDots(weekly, { big = false } = {}) {
  if (!weekly?.week) return '';
  const today = weekly.week[weekly.week.length - 1]?.day;
  const initial = (day) => {
    try {
      return weekdayName(new Date(`${day}T12:00:00`).getDay(), 'narrow');
    } catch {
      return '';
    }
  };
  return `<span class="week-dots${big ? ' week-dots-big' : ''}" role="img"
    aria-label="${esc(t('{done} of {goal} days this week', { done: weekly.days, goal: weekly.goal }))}">
    ${weekly.week
      .map(
        (day) => `<span class="wd"><i ${day.hit ? 'data-hit' : ''} ${day.day === today ? 'data-today' : ''}>${
          big && day.hit ? icon('check', 'icon-sm icon') : ''
        }</i>${big ? `<small>${esc(initial(day.day))}</small>` : ''}</span>`,
      )
      .join('')}
  </span>`;
}

export const isDark = () => document.documentElement.dataset.theme === 'dark';

export function applyTheme(theme) {
  const dark =
    theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const railIcon = $('#sb-theme use');
  if (railIcon) railIcon.setAttribute('href', `icons.svg#i-${dark ? 'moon-stars' : 'sun'}`);
  const color = $('meta[name="theme-color"]');
  if (color) color.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim());
  document.querySelectorAll('img[data-art]').forEach((img) => {
    img.src = `art/${img.dataset.art}${dark ? '-dark' : ''}.webp`;
  });
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let index = { list: null, byId: new Map() };

export function cardById(id) {
  if (index.list !== app.cards) {
    index = { list: app.cards, byId: new Map(app.cards.map((card) => [card.id, card])) };
  }
  return index.byId.get(id) || null;
}

export const FLY_MS = 260;

export function flyCard(face, rating) {
  if (!face || reducedMotion()) return;
  const way = flyDirection(rating);
  face.style.transition = `transform ${FLY_MS}ms var(--ease), opacity ${FLY_MS}ms var(--ease)`;
  face.style.transform = `translateX(${way * 130}%) rotate(${way * 18}deg)`;
  face.style.opacity = '0';
  face.dataset.swipe = way < 0 ? 'again' : 'good';
  face.style.setProperty('--swipe', '1');
}

export function bindSwipe(face, decide) {
  if (!face || reducedMotion()) return;
  let from = null;
  const rest = () => {
    face.style.transform = '';
    face.style.removeProperty('--swipe');
    delete face.dataset.swipe;
    delete face.dataset.dragging;
  };

  face.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button, input, a, select')) return;
    from = { x: event.clientX, y: event.clientY };
    face.setPointerCapture?.(event.pointerId);
    face.dataset.dragging = '1';
  });

  face.addEventListener('pointermove', (event) => {
    if (!from) return;
    const dx = event.clientX - from.x;
    face.style.transform = `translateX(${dx}px) rotate(${dx / 28}deg)`;
    const { tint, reach } = swipeTint(dx);
    face.dataset.swipe = tint;
    face.style.setProperty('--swipe', reach.toFixed(3));
  });

  face.addEventListener('pointerup', (event) => {
    if (!from) return;
    const dx = event.clientX - from.x;
    const dy = event.clientY - from.y;
    from = null;
    face.releasePointerCapture?.(event.pointerId);
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) face.dataset.noflip = '1';
    const rating = swipeVerdict({ dx, dy, width: face.getBoundingClientRect().width });
    if (!rating) return rest();
    delete face.dataset.dragging;
    flyCard(face, rating);
    decide(rating);
  });

  face.addEventListener('pointercancel', () => {
    from = null;
    rest();
  });
}

export function modal(id, onClose) {
  const node = $(`#${id}`);
  if (!node) return null;
  node.addEventListener('click', (event) => {
    if (event.target === node) node.close();
  });
  if (onClose) node.addEventListener('close', onClose);
  return node;
}

export const dialogHead = (title, close) => `<div class="section-head dialog-head">
  <h2>${esc(title)}</h2>
  <button class="btn btn-quiet" data-act="${close}" aria-label="${esc(t('Cancel'))}">
    ${icon('x', 'icon-sm icon')}
  </button>
</div>`;

export const RENDER = {};
export const ACTIONS = {};

export const registerScreen = (id, fn) => {
  RENDER[id] = fn;
};

function sidebarItems(prefix = 'sb') {
  const due = app.cards.filter((card) => card.isDue).length;
  const closed = document.documentElement.dataset.rail === 'closed' && prefix === 'sb';
  return ROUTES.map((route) => {
    const current = app.route === route.id;
    const id = `${prefix}-${route.id}`;
    return `<a class="sb-item" id="${id}" href="#/${route.id}" data-act="go" data-value="${route.id}"
      ${current ? 'aria-current="page"' : ''}>
      <span class="sb-icon">${icon(current ? `${route.icon}-fill` : route.icon)}</span>
      <span class="sb-label">${esc(t(route.label))}</span>
      ${route.id === 'study' && due ? `<span class="sb-badge">${due}</span>` : ''}
    </a>${closed ? `<wa-tooltip for="${id}" placement="right">${esc(t(route.label))}</wa-tooltip>` : ''}`;
  }).join('');
}

function renderRail() {
  $('#rail').innerHTML = sidebarItems('sb');
  const drawer = $('#drawer-rail');
  if (drawer) drawer.innerHTML = sidebarItems('dr');
  const themeLabel = $('[data-theme-label]');
  if (themeLabel) themeLabel.textContent = t('Theme');
  const toggle = $('.sb-toggle');
  if (toggle) {
    const open = document.documentElement.dataset.rail !== 'closed';
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? t('Collapse sidebar') : t('Expand sidebar'));
  }
}

export function setRail(open) {
  const state = railState(open);
  document.documentElement.dataset.rail = state;
  try {
    localStorage.setItem('rail', state);
  } catch {}
  renderRail();
}

export const art = (name, alt, { width = 640, height = 480, cls = '', fixed = false } = {}) =>
  `<picture class="art ${cls}"><img src="art/${name}.webp" ${fixed ? '' : `data-art="${name}"`} width="${width}" height="${height}" alt="${esc(alt)}" loading="lazy" decoding="async"></picture>`;

export function ringSvg(value, { size = 96, stroke = 8, label = '', unit = '', color = 'var(--accent)' } = {}) {
  const radius = 50 - stroke / 2;
  const length = 2 * Math.PI * radius;
  const done = Math.min(1, Math.max(0, value || 0));
  return `<div class="ring-big" style="--size:${size}px" role="img" aria-label="${esc(label)}${unit ? ` ${esc(unit)}` : ''}">
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="${radius}" fill="none" stroke="var(--sunk)" stroke-width="${stroke}"></circle>
      <circle cx="50" cy="50" r="${radius}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${length.toFixed(2)}" stroke-dashoffset="${(length * (1 - done)).toFixed(2)}"
        transform="rotate(-90 50 50)" class="ring-fill"></circle>
    </svg>
    <span class="ring-big-label"><b>${esc(label)}</b>${unit ? `<span>${esc(unit)}</span>` : ''}</span>
  </div>`;
}

export function decks() {
  const { native, target } = app.config;
  const known = new Map(app.pairs.map((pair) => [`${pair.native}>${pair.target}`, pair]));
  const key = `${native}>${target}`;
  known.set(key, {
    ...known.get(key),
    native,
    target,
    total: app.cards.length,
    due: app.cards.filter((card) => card.isDue).length,
  });
  return [...known.values()].filter(
    (pair) => (pair.total || 0) > 0 || (pair.native === native && pair.target === target),
  );
}

function renderTopbar() {
  const { native, target } = app.config;
  const list = decks();
  const taken = new Set(list.map((pair) => pair.target));
  const due = app.cards.filter((card) => card.isDue).length;
  const uiLangs = ['en', ...(app.uiLanguages || [])].filter((code, index, all) => all.indexOf(code) === index);
  const uiLang = uiLangs.includes(app.config.uiLang) ? app.config.uiLang : 'en';
  const row = (pair) => {
    const open = pair.native === native && pair.target === target;
    const foot = pair.due ? t('{n} due', { n: pair.due }) : tn(pair.total || 0, 'card', 'cards');
    return `<button role="menuitem" data-act="open-deck" data-value="${pair.native}>${pair.target}" ${open ? 'aria-current="true"' : ''}>
      <span class="code">${esc(pair.native)}<i>→</i>${esc(pair.target)}</span>
      <span class="lang">${esc(languageName(pair.target))}</span>
      <span class="n">${esc(foot)}</span>
    </button>`;
  };
  $('#topbar').innerHTML = `
    <button class="btn-icon burger" data-act="drawer" aria-label="${esc(t('Menu'))}">${icon('list')}</button>
    <details class="switcher" id="switcher">
      <summary aria-label="${esc(t('Switch the language you are learning'))}">
        <span class="code">${esc(native)}<i>→</i>${esc(target)}</span>
        <span class="lang">${esc(languageName(target))}</span>
        ${icon('caret-down', 'icon-sm icon')}
      </summary>
      <div class="menu" role="menu">
        ${list.map(row).join('')}
        <button class="add" data-act="pair-open">
          ${icon('plus', 'icon-sm icon')} ${esc(t('Add a language'))}
        </button>
      </div>
    </details>
    ${
      (app.pairs || []).some((pair) => pair.total > 0 && !(pair.native === native && pair.target === target))
        ? `<button class="sync-btn" data-act="sync-open"
            title="${esc(t('Copy into {lang}', { lang: languageName(target) }))}">
            ${icon('arrows-clockwise', 'icon-sm icon')}<span>${esc(t('Sync'))}</span>
          </button>`
        : ''
    }
    <span class="topbar-gap"></span>
    ${
      due && app.route !== 'study'
        ? `<button class="due-pill" data-act="go" data-value="study">${icon('bell-ringing', 'icon-sm icon')}${esc(t('{n} due', { n: due }))}</button>`
        : ''
    }
    <details class="switcher lang-switcher" id="ui-switcher">
      <summary aria-label="${esc(t('Interface language'))}">
        <span class="flag">${flagOf(uiLang)}</span>
        <span class="lang">${esc(languageName(uiLang))}</span>
        ${icon('caret-down', 'icon-sm icon')}
      </summary>
      <div class="menu" role="menu">
        ${uiLangs
          .map(
            (code) => `<button role="menuitem" data-act="pick-ui-lang" data-value="${code}"
              ${code === uiLang ? 'aria-current="true"' : ''}>
              <span class="flag">${flagOf(code)}</span>
              <span class="lang">${esc(languageName(code))}</span>
            </button>`,
          )
          .join('')}
      </div>
    </details>`;
}

export function setTitle() {
  const parts = ['Loanword'];
  if (app.route === 'study' && app.session) {
    const total = app.session.queue.length;
    parts.push(`${t('Study')} · ${Math.min(app.session.index + 1, total)}/${total}`);
  } else if (app.route === 'analytics') {
    parts.push(t('Analytics'));
  } else if (app.route === 'deck') {
    parts.push(`${t('Deck')} · ${app.config.native}→${app.config.target}`);
  } else {
    const due = app.cards.filter((card) => card.isDue).length;
    if (due) parts.push(t('{n} due', { n: due }));
  }
  document.title = parts.join(' — ');
}

export function render() {
  renderRail();
  renderTopbar();
  $$('.page').forEach((page) => delete page.dataset.active);
  const page = $(`#page-${app.route}`);
  if (!page) return;
  page.dataset.active = '1';
  RENDER[app.route]();
  setTitle();
  watchArt();
}

function watchArt() {
  document.querySelectorAll('img[data-art]:not([data-watched])').forEach((img) => {
    img.dataset.watched = '1';
    img.addEventListener('error', () => {
      img.dataset.missing = '1';
      const frame = img.closest('.art-frame, .art');
      if (frame) {
        frame.dataset.missing = '1';
        frame.title = img.alt;
      }
    });
  });
}

export function go(route) {
  if (!RENDER[route]) route = 'overview';
  app.route = route;
  const hash = route === 'analytics' ? analyticsHash() : `#/${route}`;
  if (location.hash !== hash) location.hash = hash;
  else render();
  $('#main')?.scrollTo?.({ top: 0 });
}

function analyticsHash() {
  const { range, category, cefr } = app.analytics;
  const params = new URLSearchParams();
  if (range !== '30d') params.set('range', range);
  if (category.length) params.set('cat', category.join(','));
  if (cefr.length) params.set('cefr', cefr.join(','));
  const query = params.toString();
  return `#/analytics${query ? `?${query}` : ''}`;
}

export function readAnalyticsHash(hash) {
  const [, query = ''] = hash.split('?');
  const params = new URLSearchParams(query);
  const range = params.get('range');
  app.analytics.range = ['7d', '30d', '90d', 'all'].includes(range) ? range : '30d';
  app.analytics.category = (params.get('cat') || '').split(',').filter((key) => key in CATEGORY);
  app.analytics.cefr = (params.get('cefr') || '').split(',').filter((key) => LEVELS.includes(key));
}

export async function refresh() {
  await loadLanguage();
  await load();
  render();
}

let saveTimer;
export async function saveSetting(key, value) {
  app.config[key] = value;
  clearTimeout(saveTimer);
  return new Promise((resolve) => {
    saveTimer = setTimeout(async () => {
      try {
        app.config = await api('/settings', { [key]: value });
        toast(t('Saved'));
        resolve(true);
      } catch (error) {
        toast(error.message || t('Could not save'), 'error');
        resolve(false);
      }
    }, 250);
  });
}
