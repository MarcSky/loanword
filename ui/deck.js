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
import { chapterKey, chapterOf, chaptersOf, titleOf, topicsIn } from './chapters.js';
import { MAX_CHARS, RANGES } from './limits.js';
import { piecesOf } from './words.js';

const VIEWS = [
  { mode: 'chapters', icon: 'books', label: 'Chapters' },
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
  const { category, level, status, query, topic } = app.deck;
  const needle = query.trim().toLowerCase();
  return app.cards.filter((card) => {
    if (category && card.category !== category) return false;
    if (topic && card.topic !== topic) return false;
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

const deckTopics = () =>
  [...new Set(app.cards.map((card) => card.topic).filter(Boolean))].sort((one, other) => one.localeCompare(other));

function cardField(label, control, wide = false) {
  return `<label class="card-field${wide ? ' card-field-wide' : ''}">
    <span class="micro">${esc(label)}</span>
    ${control}
  </label>`;
}

function cardForm(card) {
  const text = (name, value, extra = '') =>
    `<input class="edit" name="${name}" value="${esc(value || '')}" maxlength="${MAX_CHARS.field}" ${extra}>`;
  return `
    ${dialogHead(t('Edit card'), 'edit-cancel')}
    <form data-edit-form data-value="${card.id}" class="card-form">
      ${cardField(t('Word'), text('front', card.front, `required ${langAttrs(app.config.target)}`))}
      ${cardField(t('Meaning'), text('back', card.back, `required ${langAttrs(app.config.native)}`))}
      ${cardField(t('Example'), text('example', card.example, langAttrs(app.config.target)), true)}
      ${cardField(t('Reading'), text('reading', card.reading, `placeholder="${esc(t('Romanised reading'))}" lang="und" dir="ltr"`))}
      ${cardField(
        t('Level'),
        `<select class="edit" name="cefr">
          <option value="">${esc(t('No level'))}</option>
          ${LEVELS.map((level) => `<option value="${level}" ${card.cefr === level ? 'selected' : ''}>${level}</option>`).join('')}
        </select>`,
      )}
      ${cardField(
        t('Domain'),
        `<select class="edit" name="category">
          ${categoryKeys()
            .map((key) => `<option value="${key}" ${card.category === key ? 'selected' : ''}>${esc(meta(key).label)}</option>`)
            .join('')}
        </select>`,
      )}
      ${cardField(
        t('Topic'),
        `<select class="edit" name="topic">
          <option value="" ${card.topic ? '' : 'selected'}>${esc(t('Unsorted'))}</option>
          ${deckTopics()
            .map((topic) => `<option value="${esc(topic)}" ${card.topic === topic ? 'selected' : ''}>${esc(titleOf(topic))}</option>`)
            .join('')}
        </select>`,
      )}
      ${cardField(t('Note'), text('note', card.note, `placeholder="${esc(t('Note'))}" ${langAttrs(app.config.native)}`), true)}
      <div class="sync-foot card-field-wide">
        <button class="btn" type="button" data-act="edit-cancel">${esc(t('Cancel'))} <kbd>esc</kbd></button>
        <button class="btn btn-primary" type="submit">${esc(t('Save'))} <kbd>↵</kbd></button>
      </div>
    </form>`;
}

function renderCardEditor() {
  const box = $('#edit-body');
  const card = app.cards.find((entry) => entry.id === app.deck.editing);
  if (!box) return;
  if (!card) return $('#edit').close();
  box.innerHTML = cardForm(card);
}

function wordRow(card) {
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

function topicList(cards) {
  const topics = topicsIn(cards);
  if (topics.length <= 1) return `<ul class="rows">${cards.map(wordRow).join('')}</ul>`;
  return topics
    .map(({ topic, n }) => {
      const owned = cards.filter((card) => (card.topic || '') === topic);
      return `<div class="group" style="${tintOf(owned[0].category)}">
        <h3 class="group-head">
          <span class="group-icon">${icon('books', 'icon-sm icon')}</span>
          ${esc(titleOf(topic) || t('Unsorted'))}
          <span class="group-count">${n}</span>
        </h3>
        <ul class="rows">${owned.map(wordRow).join('')}</ul>
      </div>`;
    })
    .join('');
}

export function topicChips(cards, active, action) {
  const topics = topicsIn(cards).filter((entry) => entry.topic);
  if (!topics.length) return '';
  return `<div class="filters" role="group" aria-label="${esc(t('Filter by topic'))}">
    <button class="chip chip-sm" data-act="${action}" data-value="" aria-pressed="${active === ''}">${esc(t('All'))}</button>
    ${topics
      .map(
        ({ topic, n }) => `<button class="chip chip-sm" data-act="${action}" data-value="${esc(topic)}"
          aria-pressed="${active === topic}">${esc(titleOf(topic))} <span class="count">${n}</span></button>`,
      )
      .join('')}
  </div>`;
}

function chapterPanel(chapter) {
  const info = categoryMeta(chapter.category);
  const ids = chapter.cards.map((card) => card.id).join(',');
  const open = !!app.deck.openAll;
  return `<details class="chapter" style="${tintOf(chapter.category)}" ${open ? 'open' : ''}>
    <summary>
      <span class="group-icon">${icon(info.icon, 'icon-sm icon')}</span>
      <span class="chapter-name">${esc(info.label)} · ${esc(titleOf(chapter.topic) || t('Unsorted'))}${
        chapter.parts > 1 ? ` · ${esc(t('Part {n} of {m}', { n: chapter.part, m: chapter.parts }))}` : ''
      }</span>
      <button class="star chapter-edit" data-act="chapter-rename" data-value="${esc(chapterKey(chapter))}"
        aria-label="${esc(t('Rename this chapter'))}">${icon('pencil-simple', 'icon-sm icon')}</button>
      <span class="count">${chapter.total}</span>
      <span class="meter" title="${esc(t('{n} mastered', { n: pct(chapter.mastery) }))}"><i style="width:${pct(chapter.mastery)}"></i></span>
    </summary>
    <div class="chapter-body">
      <div class="chapter-actions">
        <button class="btn" data-act="study-chapter" data-value="${ids}">
          ${icon('play', 'icon-sm icon')} ${esc(t('Study this chapter'))}
        </button>
      </div>
      <ul class="rows" ${open ? '' : `data-lazy="${ids}"`}>${open ? chapter.cards.map(wordRow).join('') : ''}</ul>
    </div>
  </details>`;
}

const chapterSize = (category, topic) =>
  app.cards.filter((card) => card.category === category && (card.topic || '') === topic).length;

function renderChapterDialog() {
  const box = $('#chapter-body');
  const chosen = app.chapter;
  if (!box || !chosen) return;
  const info = categoryMeta(chosen.category);
  box.innerHTML = `
    ${dialogHead(t('Rename this chapter'), 'chapter-close')}
    <p class="lede" style="font-size:.9375rem">${esc(
      t('A chapter is the topic its cards share. Rename it and every card in it moves along.'),
    )}</p>
    <form id="chapter-form" class="chapter-form">
      <div class="chapter-form-was" style="${tintOf(chosen.category)}">
        <span class="tag">${icon(info.icon)}${esc(info.label)}</span>
        <span class="chapter-form-name">${esc(titleOf(chosen.topic) || t('Unsorted'))}</span>
        <span class="count">${chapterSize(chosen.category, chosen.topic)}</span>
      </div>
      <label class="card-field">
        <span class="micro">${esc(t('New name'))}</span>
        <input class="edit" name="topic" value="${esc(titleOf(chosen.topic))}" maxlength="${MAX_CHARS.topic}" required
          placeholder="${esc(titleOf(chosen.topic) || t('Unsorted'))}" aria-label="${esc(t('New name'))}">
      </label>
    </form>
    <div class="sync-foot">
      <button class="btn" data-act="chapter-close">${esc(t('Cancel'))}</button>
      <button class="btn btn-primary" data-act="chapter-save">${esc(t('Save'))} <kbd>↵</kbd></button>
    </div>`;
}

function chapterList(cards) {
  return chaptersOf(cards, { order: categoryKeys() }).map(chapterPanel).join('');
}

export function wordList(cards, { by = 'category' } = {}) {
  if (by === 'topic') return topicList(cards);
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

let building = false;
let skipWords = new Set();

async function loadSkipWords() {
  const taken = new Set();
  for (const owned of app.cards) taken.add(String(owned.front || '').toLowerCase());
  const out = await api('/stopwords').catch(() => null);
  for (const word of out?.skip || []) taken.add(word);
  skipWords = taken;
}

const marks = (card) =>
  piecesOf(card.example, app.config.target).map((piece, index) => ({
    text: piece.segment,
    index,
    open: piece.isWordLike && !skipWords.has(piece.segment.toLowerCase()),
  }));

const picked = (marked) => marked.filter((mark) => mark.open && app.picks.has(mark.index));

const pickableExample = (marked) =>
  marked
    .map((mark) =>
      mark.open
        ? `<button class="pick" data-act="pick-word" data-value="${mark.index}"
            aria-pressed="${app.picks.has(mark.index)}">${esc(mark.text)}</button>`
        : esc(mark.text),
    )
    .join('');

function pickBar(marked) {
  const chosen = picked(marked).length;
  return `<div class="pick-bar">
    <p class="field-hint">${esc(t('Tap a word you do not know'))}</p>
    <div class="pick-actions">
      <button class="btn" data-act="pick-cancel">${esc(t('Cancel'))}</button>
      <button class="btn btn-primary" data-act="pick-create" ${chosen && !building ? '' : 'disabled'}>
        ${icon('plus', 'icon-sm icon')} ${esc(t('Make cards'))}
        ${chosen ? `<span class="count">${chosen}</span>` : ''}
      </button>
    </div>
  </div>`;
}

const pickButton = (card) =>
  card.example && !app.picking
    ? `<button class="btn" data-act="pick-start">
        ${icon('plus', 'icon-sm icon')} ${esc(t('Make cards'))}
      </button>`
    : '';

function cardCard(card) {
  const info = categoryMeta(card.category);
  const marked = app.picking && card.example ? marks(card) : [];
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
    ${
      card.example
        ? `<p class="example${marked.length ? ' example-pick' : ''}" ${langAttrs(app.config.target)}>${
            marked.length ? pickableExample(marked) : esc(card.example)
          }</p>`
        : ''
    }
    ${marked.length ? pickBar(marked) : ''}
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

    <p class="field-hint">${esc(
      t('Mastery is the FSRS stability of this card against 21 days: 100% means it should still be there in three weeks.'),
    )}</p>

    <div class="sync-foot" style="justify-content:space-between">
      <span>
        ${starButton(card)}${sayButton(card)}${editButton(card)}${rewriteButton(card)}
      </span>
      <span>
        ${pickButton(card)}
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
    <div class="page-head deck-head">
      <div>
        <h1>${t('Your deck')}</h1>
        <p class="lede">${esc(tn(app.cards.length, 'card', 'cards'))}</p>
      </div>
      <div class="deck-tools">
        <label class="search">
          ${icon('magnifying-glass', 'icon-sm icon')}
          <input class="input" id="deck-search" type="search" placeholder="${esc(t('Search words, translations, examples'))}"
            value="${esc(query)}" aria-label="${esc(t('Search the deck'))}">
        </label>
      <div class="page-actions">
        ${
          app.duplicates?.groups.length
            ? `<button class="btn" data-act="twins-open">
                ${icon('copy', 'icon-sm icon')} ${esc(tn(app.duplicates.groups.length, 'repeated meaning', 'repeated meanings'))}
              </button>`
            : ''
        }
        ${
          app.deck.view === 'chapters'
            ? ''
            : `<button class="btn" data-act="deck-view" data-value="chapters">${icon('books', 'icon-sm icon')} ${esc(t('Chapters'))}</button>`
        }
        <button class="btn" data-act="export" title="${esc(t('CSV for Anki: File → Import, separator ;'))}">${icon('download-simple', 'icon-sm icon')} ${esc(t('Export for Anki'))}</button>
        ${fresh ? `<button class="btn btn-primary" data-act="practice-tab" data-value="learn">${icon('sparkle', 'icon-sm icon')} ${esc(t('Learn {n} new', { n: fresh }))}</button>` : ''}
      </div>
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
    ${app.deck.category ? topicChips(app.cards.filter((card) => card.category === app.deck.category), app.deck.topic, 'deck-topic') : ''}
    ${levelChips(app.deck.level, 'deck-level')}

    <div class="section-head">
      <h2 class="title">${esc(cards.length ? tn(cards.length, 'card', 'cards') : t('Nothing matches'))}</h2>
      <div style="display:flex;gap:8px">
        ${
          app.deck.view === 'chapters'
            ? `<button class="btn" data-act="chapters-fold">
                ${icon(app.deck.openAll ? 'minus' : 'plus', 'icon-sm icon')}
                ${esc(app.deck.openAll ? t('Collapse all') : t('Open all'))}
              </button>`
            : ''
        }
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
          : app.deck.view === 'chapters'
            ? `<div class="chapters">${chapterList(cards)}</div>`
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
    app.deck.topic = '';
    renderDeck();
  },
  'deck-topic': (value) => {
    app.deck.topic = value;
    renderDeck();
  },
  'chapters-fold': () => {
    app.deck.openAll = !app.deck.openAll;
    renderDeck();
  },
  'chapter-rename': (value) => {
    const chosen = chapterOf(value);
    if (!chosen) return;
    app.chapter = chosen;
    $('#chapter').showModal();
    renderChapterDialog();
    $('#chapter-form input')?.focus();
  },
  'chapter-close': () => $('#chapter').close(),
  'chapter-save': async () => {
    const chosen = app.chapter;
    const field = $('#chapter-form input');
    if (!chosen || !field) return;
    const to = field.value.trim().toLocaleLowerCase();
    if (!to || to === chosen.topic) return $('#chapter').close();
    try {
      const out = await api('/topic/rename', { category: chosen.category, from: chosen.topic, to });
      $('#chapter').close();
      const { refresh } = await import('./core.js');
      await refresh();
      toast(t('{n} cards moved to “{topic}”', { n: out.moved, topic: titleOf(out.topic) }));
    } catch (error) {
      toast(error.message || t('Could not save'), 'error');
    }
  },
  'study-chapter': async (value) => {
    const include = String(value || '').split(',').filter(Boolean);
    if (!include.length) return;
    const { startSession } = await import('./study.js');
    await startSession({ include });
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
    app.deck = { ...app.deck, category: '', level: '', status: 'all', query: '', topic: '' };
    renderDeck();
  },
  'edit-card': (id) => {
    if ($('#card').open) {
      app.deck.editReturn = id;
      $('#card').close();
    }
    app.deck.editing = id;
    $('#edit').showModal();
    renderCardEditor();
    $('#edit-body input')?.focus();
  },
  'edit-cancel': () => $('#edit').close(),
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
    app.picks = new Set();
    app.picking = false;
    $('#card').showModal();
    renderCard();
  },
  'card-close': () => $('#card').close(),
  'pick-start': async () => {
    app.picking = true;
    app.picks = new Set();
    renderCard();
    await loadSkipWords();
    renderCard();
  },
  'pick-cancel': () => {
    app.picking = false;
    app.picks = new Set();
    renderCard();
  },
  'pick-word': (value) => {
    const index = Number(value);
    if (app.picks.has(index)) app.picks.delete(index);
    else if (app.picks.size >= RANGES.picks.max) {
      return toast(t('At most {n} words at a time', { n: RANGES.picks.max }), 'error');
    } else app.picks.add(index);
    renderCard();
  },
  'pick-create': async () => {
    const card = app.cards.find((entry) => entry.id === app.opened);
    const words = card && card.example ? picked(marks(card)).map((mark) => mark.text) : [];
    if (!words.length || building) return;
    building = true;
    renderCard();
    try {
      await api('/words', { words, example: card.example });
    } catch (error) {
      building = false;
      renderCard();
      return toast(error.message || t('Could not build those cards'), 'error');
    }
    building = false;
    for (const word of words) skipWords.add(word.toLowerCase());
    app.picks = new Set();
    app.picking = false;
    renderCard();
    toast(t('Building your cards'));
  },
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
    await startSession({ category: app.deck.category, level: app.deck.level, topic: app.deck.topic });
  },
});

document.addEventListener(
  'toggle',
  (event) => {
    const rows = event.target.matches?.('details.chapter[open]') && event.target.querySelector('.rows[data-lazy]');
    if (!rows) return;
    const wanted = new Set(rows.dataset.lazy.split(','));
    rows.innerHTML = app.cards.filter((card) => wanted.has(card.id)).map(wordRow).join('');
    delete rows.dataset.lazy;
  },
  true,
);

document.addEventListener('submit', (event) => {
  if (event.target.id !== 'chapter-form') return;
  event.preventDefault();
  ACTIONS['chapter-save']();
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
    $('#edit').close();
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
modal('chapter', () => {
  app.chapter = null;
});

modal('edit', () => {
  app.deck.editing = null;
  const back = app.deck.editReturn;
  app.deck.editReturn = '';
  if (back && app.cards.some((card) => card.id === back)) ACTIONS['card-open'](back);
});

modal('card', () => {
  app.opened = null;
});

registerScreen('deck', renderDeck);

export { renderDeck };
