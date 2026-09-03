import {
  $,
  ACTIONS,
  LEVELS,
  ago,
  api,
  app,
  categoryChips,
  categoryKeys,
  emptyState,
  dialogHead,
  esc,
  groupByCategory,
  icon,
  languageName,
  levelChips,
  meta,
  modal,
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
import { sayButton } from './speak.js';

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
  ${icon(card.isFavorite ? 'star-fill' : 'star', 'icon-sm icon')}
</button>`;

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
          ${categoryKeys()
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

function wordRow(card) {
  if (app.deck.editing === card.id) return editRow(card);
  return `<li class="row" style="${tintOf(card.category)}" data-act="card-open" data-value="${card.id}"
    role="button" tabindex="0" aria-label="${esc(card.front)}">
    <span class="row-actions">
      ${starButton(card)}${sayButton(card)}${editButton(card)}${rewriteButton(card)}${deleteButton(card)}
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
  const buckets = groupByCategory(cards);
  const groups = categoryKeys()
    .map((key) => ({ key, cards: buckets.get(key) || [] }))
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

function wordTable(cards) {
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
          <td class="tbl-badge"><span class="badge-icon" title="${esc(info.label)}">${icon(info.icon)}</span></td>
          <td class="tbl-front" ${langAttrs(app.config.target)}>${esc(card.front)}${
            card.reading ? `<i class="reading-inline" lang="und" dir="ltr">${esc(card.reading)}</i>` : ''
          }</td>
          <td class="tbl-back" ${langAttrs(app.config.native)}>${esc(card.back)}</td>
          <td>${levelPill(card)}${leechPill(card)}</td>
          <td class="tbl-meter">${masteryMeter(card)}<span class="n">${esc(pct(card.mastery))}</span></td>
          <td class="tbl-when" ${card.isDue ? 'data-due' : ''}>${esc(status)}</td>
          <td class="tbl-actions"><span class="row-actions">${starButton(card)}${sayButton(card)}${editButton(card)}${rewriteButton(card)}${deleteButton(card)}</span></td>
        </tr>`;
      })
      .join('')}</tbody>
  </table></div>`;
}

function wordCard(card) {
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
      ${starButton(card)}${sayButton(card)}
      ${editButton(card)}
      ${rewriteButton(card)}
      ${deleteButton(card)}
    </div>
  </article>`;
}

async function loadDuplicates() {
  if (app.duplicates) return;
  app.duplicates = { groups: [], loading: true };
  try {
    const out = await api('/duplicates');
    app.duplicates = { groups: out.groups || [], loading: false };
  } catch {
    app.duplicates = { groups: [], loading: false };
  }
  if (app.route === 'deck') renderDeck();
}

const repeats = () =>
  (app.duplicates?.groups || []).flatMap((group) => group.cards.filter((card) => card.repeat));

function renderDuplicates() {
  const box = $('#twins-body');
  const groups = app.duplicates?.groups || [];
  if (!box) return;
  const again = repeats();

  box.innerHTML = `
    ${dialogHead(t('One meaning, more than one card'), 'twins-close')}
    <p class="lede" style="font-size:.9375rem">${esc(
      t('Two words for one meaning can both be worth learning. Throw away the one that is not.'),
    )}</p>
    ${
      groups.length
        ? `<div class="twins">${groups.map(twinGroup).join('')}</div>`
        : `<p class="field-hint" style="margin-top:16px">${esc(t('Every meaning has exactly one card.'))}</p>`
    }
    <div class="sync-foot">
      ${
        again.length
          ? `<button class="btn btn-danger" style="margin-inline-end:auto" data-act="twins-sweep"
              ${app.duplicates?.sweeping ? 'disabled' : ''}>
              ${icon('trash', 'icon-sm icon')} ${esc(t('Drop the repeats'))} · ${again.length}
            </button>`
          : ''
      }
      <button class="btn" data-act="twins-close">${esc(t('Done for now'))}</button>
    </div>`;
}

function twinGroup(group) {
  return `<div class="twin-group">
    <div class="twin-meaning" ${langAttrs(app.config.native)}>${esc(group.meaning)}</div>
    ${group.cards
      .map(
        (card) => `<div class="twin-card" ${card.repeat ? 'data-repeat' : ''}>
          <span class="twin-front" ${langAttrs(app.config.target)}>${esc(card.front)}</span>
          ${
            card.repeat
              ? `<span class="level" data-repeat>${esc(t('the same word again'))}</span>`
              : card.cefr
                ? `<span class="level">${esc(card.cefr)}</span>`
                : ''
          }
          ${card.example ? `<span class="twin-example" ${langAttrs(app.config.target)}>${esc(card.example)}</span>` : ''}
          <button class="star danger" data-act="twins-drop" data-value="${card.id}"
            aria-label="${esc(t('Delete {word} for good', { word: card.front }))}">
            ${icon('trash', 'icon-sm icon')}
          </button>
        </div>`,
      )
      .join('')}
  </div>`;
}

function cardCard(card) {
  const info = categoryMeta(card.category);
  const words = (card.keywords || []).filter(
    (word) => ![card.front, card.back].some((side) => String(side).toLowerCase() === String(word).toLowerCase()),
  );
  return `
    <div class="section-head" style="margin:0 0 14px">
      <span class="tag" style="${tintOf(card.category)}">${icon(info.icon)}${esc(info.label)}</span>
      ${levelPill(card)}${leechPill(card)}
      <button class="btn btn-quiet dialog-close" data-act="card-close" aria-label="${esc(t('Cancel'))}">
        ${icon('x', 'icon-sm icon')}
      </button>
    </div>

    <div class="card-front" ${langAttrs(app.config.target)}>${esc(card.front)}</div>
    ${card.reading ? `<div class="reading" lang="und" dir="ltr">${esc(card.reading)}</div>` : ''}
    <div class="card-back" ${langAttrs(app.config.native)}>${esc(card.back)}</div>
    ${card.example ? `<p class="example" ${langAttrs(app.config.target)}>${esc(card.example)}</p>` : ''}
    ${card.note ? `<p class="note">${icon('warning-circle', 'icon-sm icon')} ${esc(card.note)}</p>` : ''}
    ${
      words.length
        ? `<div class="keywords" ${langAttrs(app.config.target)}>${words
            .map((word) => `<span class="keyword">${esc(word)}</span>`)
            .join('')}</div>`
        : ''
    }

    ${
      card.source
        ? `<div class="card-source">
            <div class="micro">${esc(t('Where it came from'))}</div>
            <p ${langAttrs(app.config.native)}>${esc(card.source)}</p>
            <div class="field-hint">${[card.project, card.ts ? ago(card.ts) : '']
              .filter(Boolean)
              .map((part) => esc(part))
              .join(' · ')}</div>
          </div>`
        : ''
    }

    <div class="card-facts">
      <div><span class="l">${esc(t('Mastery'))}</span><span class="v">${esc(pct(card.mastery))}</span></div>
      <div><span class="l">${esc(t('Next'))}</span><span class="v">${esc(
        card.isNew ? t('never seen') : relativeDay(card.due),
      )}</span></div>
      <div><span class="l">${esc(t('Reviews'))}</span><span class="v">${card.reps || 0}</span></div>
      <div><span class="l">${esc(t('Lapses'))}</span><span class="v">${card.lapses || 0}</span></div>
    </div>

    <div class="sync-foot" style="justify-content:space-between">
      <span style="display:flex;gap:8px">
        ${starButton(card)}${sayButton(card)}${editButton(card)}${rewriteButton(card)}
      </span>
      <span style="display:flex;gap:8px">
        <button class="btn btn-danger" data-act="card-drop" data-value="${card.id}">
          ${icon('trash', 'icon-sm icon')} ${esc(t('Delete it'))}
        </button>
      </span>
    </div>`;
}

function renderCard() {
  const box = $('#card-body');
  const card = app.opened && app.cards.find((entry) => entry.id === app.opened);
  if (!box) return;
  if (!card) return $('#card').close();
  box.innerHTML = cardCard(card);
}

function renderExport() {
  const box = $('#export-body');
  const picked = app.export;
  if (!box || !picked) return;
  const decks = (app.pairs || []).filter((pair) => pair.total > 0);
  const cards = decks
    .filter((pair) => picked.has(`${pair.native}>${pair.target}`))
    .reduce((sum, pair) => sum + pair.total, 0);

  box.innerHTML = `
    ${dialogHead(t('Export for Anki'), 'export-close')}
    <p class="lede" style="font-size:.9375rem">${esc(t('CSV for Anki: File → Import, separator ;'))}</p>
    <div class="sync-list">
      ${decks
        .map((pair) => {
          const key = `${pair.native}>${pair.target}`;
          const pairName = t('{from} → {to}', {
            from: languageName(pair.native),
            to: languageName(pair.target),
          });
          return `<div class="sync-row">
            <button class="switch" role="switch" data-act="export-toggle" data-value="${key}"
              aria-checked="${picked.has(key)}" aria-label="${esc(pairName)}"></button>
            <span class="code">${esc(pair.native)}<i>→</i>${esc(pair.target)}</span>
            <span class="sync-lang">${esc(pairName)}</span>
            <span class="sync-n">${esc(tn(pair.total, 'card', 'cards'))}</span>
          </div>`;
        })
        .join('')}
    </div>
    <div class="sync-foot">
      <button class="btn" data-act="export-close">${esc(t('Cancel'))}</button>
      <button class="btn btn-primary" data-act="export-run" ${cards ? '' : 'disabled'}>
        ${icon('download-simple', 'icon-sm icon')}
        ${esc(cards ? `${t('Export')} · ${tn(cards, 'card', 'cards')}` : t('Export'))}
      </button>
    </div>`;
}

function renderDeck() {
  loadDuplicates();
  const cards = deckCards();
  const { status, query } = app.deck;
  const fresh = cards.filter((card) => card.isNew).length;

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
        ${
          app.duplicates?.groups.length
            ? `<button class="btn" data-act="twins-open">
                ${icon('copy', 'icon-sm icon')} ${esc(tn(app.duplicates.groups.length, 'repeated meaning', 'repeated meanings'))}
              </button>`
            : ''
        }
        <button class="btn" data-act="export" title="${esc(t('CSV for Anki: File → Import, separator ;'))}">${icon('download-simple', 'icon-sm icon')} ${esc(t('Export for Anki'))}</button>
        ${fresh ? `<button class="btn btn-primary" data-act="practice-tab" data-value="learn">${icon('sparkle', 'icon-sm icon')} ${esc(t('Learn {n} new', { n: fresh }))}</button>` : ''}
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

async function removeCard(card) {
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
    const decks = (app.pairs || []).filter((pair) => pair.total > 0);
    if (decks.length < 2) return (location.href = '/export.csv');
    app.export = new Set(decks.map((pair) => `${pair.native}>${pair.target}`));
    $('#export').showModal();
    renderExport();
  },
  'export-toggle': (value) => {
    if (!app.export) return;
    if (app.export.has(value)) app.export.delete(value);
    else app.export.add(value);
    renderExport();
  },
  'export-close': () => $('#export').close(),
  'card-open': (id) => {
    app.opened = id;
    $('#card').showModal();
    renderCard();
  },
  'card-close': () => $('#card').close(),
  'card-drop': async (id) => {
    const card = app.cards.find((entry) => entry.id === id);
    if (!card) return;
    $('#card').close();
    await removeCard(card);
  },
  'twins-open': () => {
    $('#twins').showModal();
    renderDuplicates();
  },
  'twins-close': () => $('#twins').close(),
  'twins-drop': async (id) => {
    const groups = app.duplicates?.groups || [];
    const card = groups.flatMap((group) => group.cards).find((entry) => entry.id === id);
    if (!card) return;
    try {
      await api('/delete', { id, reason: 'duplicate' });
    } catch (error) {
      return toast(error.message || t('Could not delete that card'), 'error');
    }
    app.cards = app.cards.filter((entry) => entry.id !== id);
    app.duplicates = null;
    await loadDuplicates();
    renderDuplicates();
    toast(
      t('Removed from your deck'),
      'ok',
      `<button class="undo" data-act="undo-junk" data-value="${id}">${esc(t('Undo'))} <kbd>u</kbd></button>`,
    );
  },
  'twins-sweep': async () => {
    const state = app.duplicates;
    const again = repeats();
    if (!state || state.sweeping || !again.length) return;
    state.sweeping = true;
    renderDuplicates();

    let gone = 0;
    for (const card of again) {
      try {
        await api('/delete', { id: card.id, reason: 'duplicate' });
        app.cards = app.cards.filter((entry) => entry.id !== card.id);
        gone += 1;
      } catch {}
    }
    app.duplicates = null;
    await loadDuplicates();
    renderDuplicates();
    toast(gone ? tn(gone, 'card removed', 'cards removed') : t('Could not delete that card'), gone ? 'ok' : 'error');
  },
  'export-run': () => {
    const picked = [...(app.export || [])];
    if (!picked.length) return;
    $('#export').close();
    location.href = `/export.csv?decks=${encodeURIComponent(picked.join(','))}`;
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

modal('export', () => {
  app.export = null;
});
modal('twins');

modal('card', () => {
  app.opened = null;
});

registerScreen('deck', renderDeck);

export { renderDeck };
