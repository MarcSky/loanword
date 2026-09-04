import { MIN_ANSWERS } from './level.js';
import {
  $,
  ACTIONS,
  dialogHead,
  modal,
  MODE_LABEL,
  api,
  flagOf,
  app,
  byCategory,
  categoryChips,
  decks,
  emptyState,
  esc,
  go,
  icon,
  inLevel,
  languageName,
  levelChips,
  meta,
  pct,
  registerScreen,
  render,
  ringSvg,
  art,
  summarize,
  t,
  tintOf,
  tn,
  toast,
  weekDots,
} from './core.js';
import { heatmap, meter } from './charts.js';
import { kpi } from './analytics.js';
import { greetingKey } from './shell.js';
import { wordList } from './deck.js';

function buildRow(row) {
  const lang = languageName(row.target);
  if (!row.building && !app.startingPolls) {
    if (row.failed) {
      const reason = HINTS[row.hint] ? t(HINTS[row.hint]) : row.failed;
      return `<span class="build-failed">${esc(t('{lang}: the build stopped — {reason}', { lang, reason }))}</span>`;
    }
    const records = tn(row.queued, 'captured record', 'captured records');
    return `<span>${esc(t('{lang}: {records} waiting to become cards.', { lang, records }))}</span>`;
  }
  const total = row.total || row.queued;
  const done = Math.min(row.done || 0, total);
  return `<span class="build-line">
    <span>${esc(t('{lang}: building your cards', { lang }))}
      <b>${done} / ${total}</b>
      ${
        row.batches > 1
          ? `<i class="build-batch">${esc(t('batch {n} of {total}', { n: row.batch, total: row.batches }))}</i>`
          : ''
      }</span>
    <span class="track"><i style="--p:${total ? (done / total).toFixed(4) : 0}"></i></span>
  </span>`;
}

function filingRow() {
  const filing = app.filing;
  if (!filing) return '';
  const done = Math.min(filing.done || 0, filing.total || 0);
  return `<span class="build-line">
    <span>${esc(t('Filing your cards again'))} <b>${done} / ${filing.total}</b>
      ${
        filing.batches > 1
          ? `<i class="build-batch">${esc(t('batch {n} of {total}', { n: filing.batch, total: filing.batches }))}</i>`
          : ''
      }</span>
    <span class="track"><i style="--p:${filing.total ? (done / filing.total).toFixed(4) : 0}"></i></span>
  </span>`;
}

const STARTING_POLLS = 10;

const HINTS = {
  login: 'Sign in first: run claude in a terminal and type /login',
  credit: 'The Claude account has no credit left',
};

function buildBanner() {
  const rows = (app.targets || []).filter((row) => row.queued || row.building);
  if (!rows.length && !app.filing) return '';
  const running = rows.some((row) => row.building) || !!app.filing || app.startingPolls > 0;
  return `<div class="banner">
    ${running ? '<span class="spinner" aria-hidden="true"></span>' : icon('cards-three', 'icon')}
    <span class="build-rows">${rows.map(buildRow).join('')}${filingRow()}</span>
    ${
      running
        ? ''
        : `<button class="btn" data-act="build-now">${icon('play', 'icon-sm icon')} ${esc(t('Build now'))}</button>`
    }
  </div>`;
}

function starterBanner() {
  const fresh = !app.config.field;
  if (app.cards.length && !fresh) return '';
  const offers = [];
  if (app.starter && !app.cards.length) {
    const others = app.pairs.filter(
      (pair) => pair.total > 0 && !(pair.native === app.config.native && pair.target === app.config.target),
    );
    if (others.length) {
      offers.push(`<button class="btn" data-act="sync-open">
        ${icon('copy', 'icon-sm icon')} ${esc(t('Copy an existing deck into {lang}', { lang: languageName(app.config.target) }))}
      </button>`);
    }
  }
  if (fresh) {
    offers.push(`<button class="btn" data-act="topics-open">
      ${icon('squares-four', 'icon-sm icon')} ${esc(t('What do you work on?'))}
    </button>`);
  }
  if (app.alphabet && !app.cards.length) {
    offers.push(`<button class="btn" data-act="start-alphabet">
      ${icon('sparkle', 'icon-sm icon')} ${esc(t('Learn the {n} letters first', { n: app.alphabet.letters }))}
    </button>`);
  }
  if (!offers.length) return '';
  return `<div class="banner">
    <span>${esc(t('Fill it faster'))}</span>
    <span style="display:flex;gap:8px;flex-wrap:wrap">${offers.join('')}</span>
  </div>`;
}

const buildKey = () =>
  (app.targets || []).map((row) => `${row.target}:${row.building ? 1 : 0}:${row.queued}:${row.done || 0}`).join(',') +
  `|${app.filing ? `${app.filing.done}/${app.filing.total}` : ''}|${app.startingPolls}`;

const idleNow = () => !app.queued && !app.building && !app.filing && !app.startingPolls;

export function watchBuild() {
  if (idleNow()) {
    clearInterval(app.buildPoll);
    app.buildPoll = 0;
    return;
  }
  if (app.buildPoll) return;
  app.buildPoll = setInterval(async () => {
    const before = buildKey();
    const { load } = await import('./core.js');
    await load().catch(() => {});
    app.startingPolls = app.building || !app.queued ? 0 : Math.max(0, app.startingPolls - 1);
    if (buildKey() !== before) render();
    if (idleNow()) {
      clearInterval(app.buildPoll);
      app.buildPoll = 0;
    }
  }, 2000);
}

async function loadQueue() {
  app.queue = { profiles: app.queue?.profiles || [], loading: true };
  renderQueue();
  try {
    const out = await api('/queue');
    app.queue = { profiles: out.profiles || [], loading: false };
  } catch {
    app.queue = { profiles: [], loading: false };
  }
  renderQueue();
}

const queueRowAt = (value) => {
  const [column, index] = String(value).split(':').map(Number);
  return (app.queue?.profiles || [])[column]?.rows?.[index];
};

const queueTotal = () => (app.queue?.profiles || []).reduce((sum, profile) => sum + profile.rows.length, 0);

function queueRow(row, column, index) {
  return `<div class="q-row">
    <span class="q-text" title="${esc(row.text)}">${esc(row.text)}</span>
    <span class="q-meta">${esc(row.project || row.source)}</span>
    <button class="star danger" data-act="queue-drop" data-value="${column}:${index}"
      aria-label="${esc(t('Delete {word} for good', { word: row.text }))}">
      ${icon('trash', 'icon-sm icon')}
    </button>
  </div>`;
}

function queueColumn(profile, column) {
  return `<section class="q-col">
    <div class="q-col-head">
      <span class="flag">${flagOf(profile.target)}</span>
      <b>${esc(languageName(profile.target))}</b>
      <span class="n">${esc(tn(profile.rows.length, 'captured record', 'captured records'))}</span>
    </div>
    <div class="q-rows">
      ${
        profile.rows.length
          ? profile.rows.map((row, index) => queueRow(row, column, index)).join('')
          : `<p class="field-hint">${esc(t('Nothing is waiting.'))}</p>`
      }
    </div>
  </section>`;
}

export function renderQueue() {
  const box = $('#queue-body');
  if (!box) return;
  const profiles = app.queue?.profiles || [];
  const total = queueTotal();
  $('#queue')?.style.setProperty('--cols', String(Math.max(1, profiles.length)));
  box.innerHTML = `
    ${dialogHead(t('What we are about to build'), 'queue-close')}
    <p class="lede" style="font-size:.9375rem">${esc(
      t('Every one of these costs a model call. Throw away what you already know — it never comes back.'),
    )}</p>
    <div class="q-cols">${profiles.map(queueColumn).join('')}</div>
    <div class="sync-foot">
      ${app.queue?.error ? `<span class="q-error">${esc(app.queue.error)}</span>` : ''}
      <button class="btn" data-act="queue-close">${esc(t('Cancel'))}</button>
      <button class="btn btn-primary" data-act="queue-start" ${total ? '' : 'aria-disabled="true" disabled'}>
        ${icon('play', 'icon-sm icon')} ${esc(t('Start'))}${total ? ` · ${total}` : ''}
      </button>
    </div>`;
}

export function deckChips() {
  const { native, target } = app.config;
  return decks()
    .map((pair) => {
      const open = pair.native === native && pair.target === target;
      return `<div class="deck-row" ${open ? 'data-open' : ''}>
        <button class="deck-open" data-act="open-deck" data-value="${pair.native}>${pair.target}"
          aria-pressed="${open}"
          aria-label="${esc(t('Study {lang} from {from}', { lang: languageName(pair.target), from: languageName(pair.native) }))}">
          <span class="code">${esc(pair.native)}<i>→</i>${esc(pair.target)}</span>
          <span class="lang">${esc(languageName(pair.target))}
            <i class="deck-from">${esc(t('from {lang}', { lang: languageName(pair.native) }))}</i>
          </span>
          <span class="n">${esc(tn(pair.total || 0, 'card', 'cards'))}</span>
          ${open ? `<span class="tag" data-plain>${esc(t('open'))}</span>` : ''}
        </button>
        <button class="star danger" data-act="deck-drop" data-value="${pair.native}>${pair.target}"
          aria-label="${esc(t('Delete the {lang} deck', { lang: languageName(pair.target) }))}">
          ${icon('trash', 'icon-sm icon')}
        </button>
      </div>`;
    })
    .join('');
}

export function captureSwitches() {
  const capturing = new Set((app.config.targets || []).filter((code) => !(app.config.paused || []).includes(code)));
  const languages = [...new Set(decks().map((pair) => pair.target))];
  return languages
    .map(
      (code) => `<div class="capture-row">
        <span class="flag">${flagOf(code)}</span>
        <span class="capture-lang">${esc(languageName(code))}</span>
        <button class="switch" role="switch" data-act="toggle-capture" data-value="${code}"
          aria-checked="${capturing.has(code)}"
          aria-label="${esc(t('Capture into {lang}', { lang: languageName(code) }))}"></button>
      </div>`,
    )
    .join('');
}

const EMPTY_DECK_ART = {
  src: 'empty-deck.webp',
  alt: 'Flat line illustration: an empty index-card box on a desk beside a closed laptop, one blank card standing upright, thin black outline, blue and beige fills, white background, no text',
};

function newDeckState() {
  const elsewhere = app.pairs.filter(
    (pair) => pair.target !== app.config.target || pair.native !== app.config.native,
  );
  const carried = elsewhere.reduce((sum, pair) => sum + pair.total, 0);

  if (carried) {
    return emptyState({
      art: EMPTY_DECK_ART,
      title: esc(
        t('Nothing in {from} → {to} yet', {
          from: languageName(app.config.native),
          to: languageName(app.config.target),
        }),
      ),
      body: esc(t('Your other {cards} are untouched.', { cards: tn(carried, 'card', 'cards') })),
      action: `<div class="decks">${deckChips()}</div>`,
    });
  }

  return emptyState({
    art: EMPTY_DECK_ART,
    title: t('Your deck is still empty'),
    body: t('It fills as you work.'),
    action: `<button class="btn" data-act="go" data-value="settings">${icon('gear-six', 'icon-sm icon')} ${esc(t('Check your languages'))}</button>`,
  });
}

function categoryTile(cat) {
  const info = meta(cat.key);
  return `<button class="cat" style="${tintOf(cat.key)}" data-act="overview-category" data-value="${cat.key}" data-tint="${info.tint}">
    <div class="cat-top">
      <span class="badge-icon">${icon(info.icon, 'icon-lg icon')}</span>
      <span class="cat-name">${esc(info.label)}</span>
      ${cat.due ? `<span class="cat-due">${esc(t('{n} due', { n: cat.due }))}</span>` : ''}
    </div>
    <div class="cat-title">${esc(cat.total ? tn(cat.total, 'word', 'words') : t('Nothing here yet'))}</div>
    <div class="cat-foot">
      ${meter(cat.mastery, { size: 'sm', color: 'var(--tint-ink)' })}
      <span>${esc(t('{n} learned', { n: cat.learned }))}</span>
    </div>
  </button>`;
}

function kpiStrip(stats, totals) {
  const spark = (stats.activity || []).slice(-14).map((day) => day.reviews);
  const tomorrow = app.cards.filter((card) => {
    if (!card.due) return false;
    const days = (new Date(card.due) - Date.now()) / 864e5;
    return days > 0 && days <= 1;
  }).length;

  return `<div class="kpis" data-count="4">
    ${kpi({
      label: t('Due now'),
      value: totals.due,
      icon: 'bell-ringing',
      tint: 'sky',
      bar: app.cards.length ? Math.min(1, totals.due / app.cards.length) : 0,
      foot: esc(t('{n} tomorrow', { n: tomorrow })),
    })}
    ${kpi({
      label: t('Reviewed today'),
      value: stats.reviewed_today,
      icon: 'check-circle',
      tint: 'mint',
      spark,
      foot: esc(t('limit {n} new a day', { n: stats.daily_limit })),
    })}
    ${kpi({
      label: t('Your level'),
      value: app.ability?.band || '—',
      icon: 'graduation-cap',
      tint: 'butter',
      foot: esc(levelFoot()),
    })}
    ${kpi({
      label: t('In long-term memory'),
      value: stats.learned,
      unit: ` / ${stats.total}`,
      icon: 'brain',
      tint: 'lavender',
      bar: stats.total ? stats.learned / stats.total : 0,
      foot: esc(t('{n} mastered', { n: pct(stats.mastery) })),
    })}
  </div>`;
}

function levelFoot() {
  const ability = app.ability || { n: 0, min: MIN_ANSWERS, confident: false };
  if (app.config.level) return t('floor {level} set by you', { level: app.config.level });
  if (ability.confident) return t('estimated from {n} answers', { n: ability.n });
  return t('{n} of {min} answers to estimate', { n: ability.n, min: ability.min });
}

function goalCard(stats) {
  const weekly = stats.weekly;
  const minutes = stats.minutes_today ?? 0;
  const goal = app.config.sessionMinutes || 10;
  const days = weekly?.days ?? stats.streak ?? 0;
  const target = weekly?.goal ?? 7;
  return `<section class="panel goal-card">
    <div class="card-head">
      <h2 class="title">${esc(t('Your daily goal'))}</h2>
      <button class="btn btn-quiet" data-act="go" data-value="settings">${esc(t('Edit'))} ${icon('caret-right', 'icon-sm icon')}</button>
    </div>
    <div class="goal-ring">
      ${ringSvg(goal ? minutes / goal : 0, { size: 160, label: String(minutes), unit: `/ ${goal} ${t('min')}` })}
      <div class="goal-copy">
        <b>${esc(days >= target ? t('That is the goal.') : t('Keep going.'))}</b>
        <span>${esc(t('{done} of {goal} days this week', { done: days, goal: target }))}</span>
      </div>
    </div>
    ${weekDots(weekly, { big: true })}
  </section>`;
}

function heroCard(totals, dueLine) {
  const fresh = app.cards.filter((card) => card.isNew).length;
  return `<section class="panel hero-card">
    <div class="hero-copy">
      <span class="eyebrow-pill">${icon('translate', 'icon-sm icon')} ${esc(t('Learning {lang}', { lang: languageName(app.config.target) }))}</span>
      <h2 class="hero-title">${esc(totals.due ? t('{n} due right now', { n: totals.due }) : t('All caught up'))}</h2>
      <p class="hero-sub">${esc(dueLine)}</p>
      <div class="hero-actions">
        ${totals.due || fresh ? `<button class="btn btn-primary lg" data-act="start" data-value="${app.category}">${icon('play', 'icon-sm icon')} ${esc(t('Start quiz'))}</button>` : ''}
        ${fresh ? `<button class="btn lg" data-act="practice-tab" data-value="learn">${icon('sparkle', 'icon-sm icon')} ${esc(t('Learn {n} new words', { n: fresh }))}</button>` : ''}
      </div>
    </div>
    ${art(
      totals.due ? 'hero' : 'caught-up',
      totals.due
        ? 'Flat line illustration: a developer sitting cross-legged on a giant blank flashcard with a laptop, holding a smaller card up to the light; blue shirt, beige trousers, white background, no text'
        : 'Flat line illustration: a developer sitting back at a small table with a laptop and a coffee, nothing left to do; blue shirt, beige trousers, white background, no text',
      { width: 640, height: 400, cls: 'hero-art' },
    )}
  </section>`;
}

function promoCard() {
  let seen = false;
  try {
    seen = localStorage.getItem('tutorial') === 'seen';
  } catch {}
  if (seen) return '';
  return `<section class="promo">
    <div class="promo-copy">
      <h2 class="title">${esc(t('Learn the keys'))}</h2>
      <p>${esc(t('Space reveals, 1 to 4 grade, d throws a card away. Five minutes is a session.'))}</p>
      <button class="btn" data-act="shortcuts">${icon('keyboard', 'icon-sm icon')} ${esc(t('Show me'))}</button>
    </div>
    ${art('tutorial', 'Flat line illustration: a person floating weightless with headphones, one knee bent, a blank card drifting nearby; white outline on dark, blue shirt', { width: 280, height: 210, cls: 'promo-art', fixed: true })}
    <button class="btn-icon promo-close" data-act="dismiss-tutorial" aria-label="${esc(t('Dismiss'))}">${icon('x', 'icon-sm icon')}</button>
  </section>`;
}

function renderOverview() {
  watchBuild();
  const stats = app.stats;
  const scoped = app.cards.filter(
    (card) => inLevel(card, app.level) && (!app.category || card.category === app.category),
  );
  const totals = summarize(scoped);
  const cats = byCategory(app.level).sort((a, b) => b.due - a.due || b.total - a.total);
  const shown = app.category ? cats.filter((cat) => cat.key === app.category) : cats;

  const dueLine = totals.due
    ? t('{cards} ready — {minutes}', {
        cards: tn(totals.due, 'card', 'cards'),
        minutes: totals.due <= 12 ? t('about five minutes') : t('about ten minutes'),
      })
    : t('Nothing is due. The deck is ahead of you.');

  const weeks = (stats.activity || []).slice(-56);
  const peak = weeks.reduce((max, day) => Math.max(max, day.reviews), 0);
  const name = app.config.name || '';

  $('#page-overview').innerHTML = `
    ${buildBanner()}
    ${starterBanner()}
    <div class="page-head">
      <div>
        <h1>${esc(t(greetingKey(new Date().getHours())))}${name ? `, ${esc(name)}` : ''}</h1>
        <p class="lede">${esc(t('One session closer to keeping them.'))}</p>
      </div>
      <div class="segmented" role="group" aria-label="${esc(t('Study mode'))}">
        ${['flashcards', 'learn']
          .map(
            (mode) => `<button data-act="study-mode" data-value="${mode}"
              aria-pressed="${app.config.studyMode === mode}">
              ${icon(mode === 'flashcards' ? 'cards-three' : 'brain', 'icon-sm icon')}
              ${esc(t(MODE_LABEL[mode]))}
            </button>`,
          )
          .join('')}
      </div>
    </div>

    ${
      app.cards.length
        ? `<div class="overview-top">
            ${heroCard(totals, dueLine)}
            ${goalCard(stats)}
          </div>

          ${kpiStrip(stats, totals)}

          <div class="section-head">
            <h2 class="title">${esc(app.category ? meta(app.category).label : t('Where your words live'))}</h2>
            <button class="btn btn-quiet" data-act="go" data-value="analytics">
              ${esc(t('See the numbers'))} ${icon('arrow-right', 'icon-sm icon')}
            </button>
          </div>
          <div class="filters-stack">
            ${categoryChips(app.category, 'overview-category')}
            ${levelChips(app.level, 'overview-level')}
          </div>
          ${
            app.category
              ? wordList([...scoped].sort((a, b) => Number(b.isDue) - Number(a.isDue) || a.mastery - b.mastery), { by: 'topic' })
              : `<div class="cat-grid">${shown.map(categoryTile).join('')}</div>`
          }

          <div class="overview-bottom">
            <section class="panel">
              <div class="card-head">
                <h2 class="title">${esc(t('The last eight weeks'))}</h2>
                <button class="btn btn-quiet" data-act="go" data-value="analytics">
                  ${esc(t('A year of it'))} ${icon('arrow-right', 'icon-sm icon')}
                </button>
              </div>
              ${heatmap(
                weeks.map((day) => ({ day: day.date, reviews: day.reviews, new: 0, minutes: 0 })),
                peak,
              )}
            </section>
            ${promoCard()}
          </div>`
        : newDeckState()
    }`;
}

Object.assign(ACTIONS, {
  'dismiss-tutorial': () => {
    try {
      localStorage.setItem('tutorial', 'seen');
    } catch {}
    renderOverview();
  },
  'toggle-capture': async (value) => {
    const { api, refresh } = await import('./core.js');
    const paused = new Set(app.config.paused || []);
    if (paused.has(value)) paused.delete(value);
    else paused.add(value);
    await api('/settings', { paused: [...paused] });
    await refresh();
  },
  'build-now': () => {
    if (app.building || app.startingPolls > 0) return;
    $('#queue').showModal();
    loadQueue();
  },
  'queue-close': () => $('#queue').close(),
  'queue-drop': async (value) => {
    const row = queueRowAt(value);
    if (!row) return;
    try {
      const out = await api('/queue/drop', { key: row.key });
      app.queue = { profiles: out.profiles || [], loading: false };
    } catch (error) {
      app.queue = { ...app.queue, error: error.message || t('Could not delete that card') };
    }
    renderQueue();
  },
  'queue-start': async () => {
    $('#queue').close();
    try {
      const out = await api('/build', {});
      app.targets = (out.targets || app.targets).map((row) =>
        out.started && row.queued ? { ...row, building: true, total: row.total || row.queued } : row,
      );
      app.startingPolls = out.started ? STARTING_POLLS : 0;
      toast(out.started ? t('Building your cards') : t('Nothing to build right now'));
      render();
      watchBuild();
    } catch (error) {
      toast(error.message || t('Could not start the build'), 'error');
    }
  },
  'start-alphabet': async () => {
    const { api, refresh, toast } = await import('./core.js');
    try {
      const out = await api('/alphabet', {});
      toast(t('{n} letters queued — they arrive with the next build', { n: out.letters }));
      await refresh();
    } catch (error) {
      toast(error.message || t('Could not queue the alphabet'), 'error');
    }
  },
  'overview-level': (value) => {
    app.level = value;
    renderOverview();
  },
  'overview-category': (value) => {
    app.category = value;
    renderOverview();
  },
});

modal('queue');

registerScreen('overview', renderOverview);

