import {
  $,
  ACTIONS,
  CATEGORY,
  LEVELS,
  api,
  app,
  categoryChips,
  emptyState,
  esc,
  icon,
  levelChips,
  meta,
  meta as categoryMeta,
  pct,
  registerScreen,
  relativeDay,
  render,
  t,
  tintOf,
  tn,
  toast,
  levelBlurb,
  langAttrs,
} from './core.js';
import { canSpeak, speak } from './speak.js';

const VIEWS = [
  { mode: 'list', icon: 'list', label: 'List' },
  { mode: 'grid', icon: 'squares-four', label: 'Cards' },
];

const STATUSES = [
  ['all', 'Everything'],
  ['favorite', 'Favourites'],
  ['due', 'Due now'],
  ['new', 'Never seen'],
  ['learned', 'Learned'],
];

export function deckCards() {
  const { category, level, status, query } = app.deck;
  const needle = query.trim().toLowerCase();
  return app.cards.filter((card) => {
    if (category && card.category !== category) return false;
    if (level && card.cefr !== level) return false;
    if (status === 'favorite' && !card.isFavorite) return false;
    if (status === 'due' && !card.isDue) return false;
    if (status === 'new' && !card.isNew) return false;
    if (status === 'learned' && card.mastery < 1) return false;
    if (needle && !card.haystack.includes(needle)) return false;
    return true;
  });
}

const levelPill = (card) =>
  card.cefr ? `<span class="level" title="${esc(levelBlurb(card.cefr))}">${esc(card.cefr)}</span>` : '';

const masteryMeter = (card) =>
  `<span class="meter" title="${esc(t('{n} mastered', { n: pct(card.mastery) }))}"><i style="width:${pct(card.mastery)}"></i></span>`;

const starButton = (card) => `<button class="star" data-act="favorite" data-value="${card.id}"
  aria-pressed="${!!card.isFavorite}"
  aria-label="${esc(card.isFavorite ? t('Remove from favourites') : t('Add to favourites'))}">
  ${icon('star', 'icon-sm icon')}
</button>`;

const speakButton = (card) =>
  canSpeak(app.config.target)
    ? `<button class="star" data-act="say-card" data-value="${card.id}"
        aria-label="${esc(t('Say {word} out loud', { word: card.front }))}">
        ${icon('speaker-high', 'icon-sm icon')}
      </button>`
    : '';

const leechPill = (card) =>
  card.leech
    ? `<span class="level" data-leech title="${esc(t('Six lapses or more — ask for a fresh example'))}">${esc(t('leech'))}</span>`
    : '';

const rewriteButton = (card) =>
  card.leech
    ? `<button class="star" data-act="rewrite-card" data-value="${card.id}"
        aria-label="${esc(t('Ask for a fresh example for {word}', { word: card.front }))}">
        ${icon('sparkle', 'icon-sm icon')}
      </button>`
    : '';

const deleteButton = (card) => `<button class="star danger" data-act="discard" data-value="${card.id}"
  title="${esc(t('Remove from your deck'))}"
  aria-label="${esc(t('Delete {word} for good', { word: card.front }))}">
  ${icon('trash', 'icon-sm icon')}
</button>`;

const editButton = (card) => `<button class="star" data-act="edit-card" data-value="${card.id}"
  aria-label="${esc(t('Edit {word}', { word: card.front }))}">
  ${icon('pencil-simple', 'icon-sm icon')}
</button>`;

function editRow(card) {
  return `<li class="row" style="${tintOf(card.category)}" data-editing>
    <form data-edit-form data-value="${card.id}" style="display:grid;gap:8px;width:100%">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <input class="edit" name="front" value="${esc(card.front)}" aria-label="${esc(t('Word'))}" required>
        <input class="edit" name="back" value="${esc(card.back)}" aria-label="${esc(t('Meaning'))}" required>
      </div>
      <input class="edit" name="reading" value="${esc(card.reading || '')}" aria-label="${esc(t('Reading'))}"
        placeholder="${esc(t('Romanised reading'))}">
      <input class="edit" name="example" value="${esc(card.example || '')}" aria-label="${esc(t('Example'))}"
        placeholder="${esc(t('Example'))}">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <select class="edit" name="category" style="width:auto" aria-label="${esc(t('Domain'))}">
          ${Object.keys(CATEGORY)
            .map(
              (key) =>
                `<option value="${key}" ${card.category === key ? 'selected' : ''}>${esc(meta(key).label)}</option>`,
            )
            .join('')}
        </select>
        <select class="edit" name="cefr" style="width:auto" aria-label="${esc(t('Level'))}">
          <option value="">${esc(t('No level'))}</option>
          ${LEVELS.map(
            (level) => `<option value="${level}" ${card.cefr === level ? 'selected' : ''}>${level}</option>`,
          ).join('')}
        </select>
        <button class="btn btn-primary" type="submit" style="padding:6px 14px">${esc(t('Save'))} <kbd>↵</kbd></button>
        <button class="btn btn-quiet" type="button" data-act="edit-cancel" style="padding:6px 14px">${esc(t('Cancel'))} <kbd>esc</kbd></button>
      </div>
    </form>
  </li>`;
}

export function wordRow(card) {
  if (app.deck.editing === card.id) return editRow(card);
  return `<li class="row" style="${tintOf(card.category)}">
    <span class="row-actions">
      ${starButton(card)}${speakButton(card)}${editButton(card)}${rewriteButton(card)}${deleteButton(card)}
    </span>
    <span class="row-front" ${langAttrs(app.config.target)}>${esc(card.front)}${
      card.reading ? `<i class="reading-inline" lang="und" dir="ltr">${esc(card.reading)}</i>` : ''
    }</span>
    <span class="row-back" ${langAttrs(app.config.native)}>${esc(card.back)}</span>
    ${levelPill(card)}
    ${leechPill(card)}
    ${masteryMeter(card)}
  </li>`;
}

export function wordList(cards) {
  const groups = Object.keys(CATEGORY)
    .map((key) => ({ key, cards: cards.filter((card) => card.category === key) }))
    .filter((group) => group.cards.length);

  if (groups.length <= 1) return `<ul class="rows">${cards.map(wordRow).join('')}</ul>`;

  return groups
    .map((group) => {
      const info = categoryMeta(group.key);
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

export function wordTable(cards) {
  const { sort = 'front', dir = 'asc' } = app.deck;
  const head = [
    ['front', t('Word')],
    ['back', t('Meaning')],
    ['cefr', t('Level')],
    ['mastery', t('Mastery')],
    ['due', t('Next')],
  ];
  const sorted = [...cards].sort((a, b) => {
    const [x, y] = [a[sort], b[sort]];
    const cmp = typeof x === 'number' ? (x || 0) - (y || 0) : String(x || '').localeCompare(String(y || ''));
    return dir === 'asc' ? cmp : -cmp;
  });
  return `<div class="tbl-wrap"><table class="tbl">
    <thead><tr>
      <th></th>
      ${head
        .map(
          ([key, label]) => `<th aria-sort="${sort === key ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}">
            <button data-act="deck-sort" data-value="${key}">${esc(label)}${icon(sort === key ? (dir === 'asc' ? 'caret-down' : 'caret-right') : 'caret-up-down', 'icon-sm icon')}</button>
          </th>`,
        )
        .join('')}
      <th></th>
    </tr></thead>
    <tbody>${sorted
      .map((card) => {
        if (app.deck.editing === card.id) return `<tr><td colspan="7"><ul class="rows">${editRow(card)}</ul></td></tr>`;
        const info = categoryMeta(card.category);
        const status = card.isNew ? t('never seen') : card.isDue ? t('due {when}', { when: relativeDay(card.due) }) : relativeDay(card.due);
        return `<tr style="${tintOf(card.category)}">
          <td class="tbl-badge"><span class="badge-icon" title="${esc(info.label)}">${icon(`${info.icon}-duotone`)}</span></td>
          <td class="tbl-front" ${langAttrs(app.config.target)}>${esc(card.front)}${
            card.reading ? `<i class="reading-inline" lang="und" dir="ltr">${esc(card.reading)}</i>` : ''
          }</td>
          <td class="tbl-back" ${langAttrs(app.config.native)}>${esc(card.back)}</td>
          <td>${levelPill(card)}${leechPill(card)}</td>
          <td class="tbl-meter">${masteryMeter(card)}<span class="n">${esc(pct(card.mastery))}</span></td>
          <td class="tbl-when" ${card.isDue ? 'data-due' : ''}>${esc(status)}</td>
          <td class="tbl-actions"><span class="row-actions">${starButton(card)}${speakButton(card)}${editButton(card)}${rewriteButton(card)}${deleteButton(card)}</span></td>
        </tr>`;
      })
      .join('')}</tbody>
  </table></div>`;
}

export function wordCard(card) {
  const info = categoryMeta(card.category);
  const status = card.isNew
    ? t('never seen')
    : card.isDue
      ? t('due {when}', { when: relativeDay(card.due) })
      : t('next {when}', { when: relativeDay(card.due) });
  return `<article class="word" style="${tintOf(card.category)}">
    <div class="word-top">
      <span class="tag">${icon(info.icon)}${esc(info.label)}</span>
      ${levelPill(card)}
    </div>
    <div class="word-front" ${langAttrs(app.config.target)}>${esc(card.front)}</div>
    ${card.reading ? `<div class="reading" lang="und" dir="ltr">${esc(card.reading)}</div>` : ''}
    <div class="word-back" ${langAttrs(app.config.native)}>${esc(card.back)}</div>
    ${card.example ? `<div class="word-back" style="font-size:.8125rem" ${langAttrs(app.config.target)}>${esc(card.example)}</div>` : ''}
    <div class="word-foot">
      ${masteryMeter(card)}
      <span>${esc(status)}</span>
      ${speakButton(card)}
      ${editButton(card)}
      ${rewriteButton(card)}
      ${deleteButton(card)}
    </div>
  </article>`;
}

function renderDeck() {
  const cards = deckCards();
  const { status, query } = app.deck;

  $('#page-deck').innerHTML = `
    <div class="page-head">
      <div>
        <h1>${t('Your deck')}</h1>
        <p class="lede">${esc(tn(app.cards.length, 'card', 'cards'))}</p>
      </div>
      <div class="page-actions">
        <label class="search">
          ${icon('magnifying-glass', 'icon-sm icon')}
          <input class="input" id="deck-search" type="search" placeholder="${esc(t('Search words, translations, examples'))}"
            value="${esc(query)}" aria-label="${esc(t('Search the deck'))}">
        </label>
        <button class="btn" data-act="export" title="${esc(t('CSV for Anki: File → Import, separator ;'))}">${icon('download-simple', 'icon-sm icon')} ${esc(t('Export for Anki'))}</button>
      </div>
    </div>

    <div class="deck-bar">
      <div class="segmented" role="group" aria-label="${esc(t('Filter by status'))}">
        ${STATUSES.map(
          ([key, label]) => `<button data-act="deck-status" data-value="${key}"
            aria-pressed="${status === key}">${esc(t(label))}</button>`,
        ).join('')}
      </div>
      <div class="segmented" role="group" aria-label="${esc(t('View'))}" style="margin-inline-start:auto">
        ${VIEWS.map(
          ({ mode, label, icon: ic }) => `<button data-act="deck-view" data-value="${mode}"
              aria-pressed="${app.deck.view === mode}" title="${esc(t(label))}" aria-label="${esc(t(label))}">
              ${icon(ic, 'icon-sm icon')}
            </button>`,
        ).join('')}
      </div>
    </div>

    ${categoryChips(app.deck.category, 'deck-category')}
    ${levelChips(app.deck.level, 'deck-level')}

    <div class="section-head">
      <h2 class="title">${esc(cards.length ? tn(cards.length, 'card', 'cards') : t('Nothing matches'))}</h2>
      <div style="display:flex;gap:8px">
        ${
          cards.some((card) => card.isDue)
            ? `<button class="btn" data-act="start-filtered">
                ${icon('play', 'icon-sm icon')} ${esc(t('Study these'))}
                <span class="count">${cards.filter((card) => card.isDue).length}</span>
              </button>`
            : ''
        }
      </div>
    </div>

    ${
      cards.length
        ? app.deck.view === 'grid'
          ? `<div class="deck-grid">${cards.map(wordCard).join('')}</div>`
          : `<div class="panel panel-table">${wordTable(cards)}</div>`
        : emptyState({
            art: {
              src: 'empty-filter.webp',
              alt: 'Flat line illustration: a magnifying glass resting on an empty card tray, one card tipped forward, thin black outline, blue and beige fills, white background, no text',
            },
            title: t('Nothing matches'),
            body: t('Widen the filters.'),
            action: `<button class="btn" data-act="deck-reset">${icon('arrow-counter-clockwise', 'icon-sm icon')} ${esc(t('Reset filters'))}</button>`,
          })
    }`;

  const search = $('#deck-search');
  if (search && document.activeElement !== search) search.setSelectionRange(query.length, query.length);
  const editing = $('[data-edit-form] input');
  if (editing) editing.focus();
}

export async function removeCard(card) {
  try {
    await api('/delete', { id: card.id, reason: 'deleted from the deck' });
    app.cards = app.cards.filter((other) => other.id !== card.id);
    render();
    toast(
      t('Removed from your deck'),
      'ok',
      `<button class="undo" data-act="undo-junk" data-value="${card.id}">${esc(t('Undo'))}</button>`,
    );
  } catch (error) {
    toast(error.message || t('Could not delete that card'), 'error');
  }
}

Object.assign(ACTIONS, {
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
  'deck-sort': (value) => {
    const same = app.deck.sort === value;
    app.deck.dir = same && app.deck.dir === 'asc' ? 'desc' : 'asc';
    app.deck.sort = value;
    renderDeck();
  },
  'deck-reset': () => {
    app.deck = { ...app.deck, category: '', level: '', status: 'all', query: '' };
    renderDeck();
  },
  'edit-card': (id) => {
    app.deck.editing = id;
    render();
  },
  'edit-cancel': () => {
    app.deck.editing = null;
    render();
  },
  export: () => {
    location.href = '/export.csv';
  },
  discard: async (id) => {
    const card = app.cards.find((entry) => entry.id === id);
    if (card) await removeCard(card);
  },
  'undo-junk': async (id) => {
    try {
      await api('/restore', { id });
      const { refresh, hideToast } = await import('./core.js');
      hideToast();
      await refresh();
      toast(t('Back in the deck'));
    } catch (error) {
      toast(error.message || t('Could not undo that'), 'error');
    }
  },
  favorite: async (id) => {
    const card = app.cards.find((other) => other.id === id);
    if (!card) return;
    const on = !card.isFavorite;
    card.isFavorite = on;
    render();
    try {
      await api('/favorite', { id, on });
    } catch (error) {
      card.isFavorite = !on;
      render();
      toast(error.message || t('Could not save that'), 'error');
    }
  },
  'say-card': async (id) => {
    const card = app.cards.find((entry) => entry.id === id);
    if (!card) return;
    const ok = await speak(card.front, app.config.target);
    if (!ok) toast(t('No offline voice for that language yet'), 'error');
  },
  'rewrite-card': async (id) => {
    try {
      await api('/rewrite', { id });
      toast(t('Asked for a fresh example — it lands with the next build'));
    } catch (error) {
      toast(error.message || t('Could not ask for that'), 'error');
    }
  },
  'start-filtered': async () => {
    const { startSession } = await import('./study.js');
    await startSession({ category: app.deck.category, level: app.deck.level });
  },
});

document.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-edit-form]');
  if (!form) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  try {
    const { card } = await api('/card', { id: form.dataset.value, ...data });
    const index = app.cards.findIndex((entry) => entry.id === card.id);
    if (index >= 0) {
      app.cards[index] = {
        ...app.cards[index],
        ...card,
        isFavorite: !!card.starred,
        haystack: [card.front, card.back, card.example, ...(card.keywords || [])].join(' ').toLowerCase(),
      };
    }
    app.deck.editing = null;
    render();
    toast(t('Saved'));
  } catch (error) {
    toast(error.message || t('Could not save'), 'error');
  }
});

registerScreen('deck', renderDeck);

export { renderDeck };
