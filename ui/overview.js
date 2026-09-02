import {
  $,
  ACTIONS,
  MODE_LABEL,
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
  weekDots,
} from './core.js';
import { heatmap, meter } from './charts.js';
import { kpi } from './analytics.js';
import { greetingKey } from './shell.js';
import { wordList } from './deck.js';

function buildBanner() {
  const rows = (app.targets || []).filter((row) => row.queued || row.building);
  if (!rows.length) return '';
  return `<div class="banner">
    <img class="art" src="art/queue-building.webp" alt="" style="width:36px;height:auto;border-radius:8px">
    <span>${rows
      .map((row) => {
        const records = tn(row.queued, 'captured record', 'captured records');
        return row.building
          ? esc(t('{lang}: building your cards — {records}.', { lang: languageName(row.target), records }))
          : esc(t('{lang}: {records} waiting to become cards.', { lang: languageName(row.target), records }));
      })
      .join('<br>')}</span>
  </div>`;
}

function starterBanner() {
  if (app.cards.length) return '';
  const offers = [];
  if (app.starter) {
    const others = app.pairs.filter((pair) => pair.target !== app.config.target && pair.total > 0);
    if (others.length) {
      offers.push(`<button class="btn" data-act="go" data-value="settings">
        ${icon('copy', 'icon-sm icon')} ${esc(t('Copy an existing deck into {lang}', { lang: languageName(app.config.target) }))}
      </button>`);
    }
  }
  if (app.alphabet) {
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

export function watchBuild() {
  clearInterval(app.buildPoll);
  if (!app.queued) return;
  app.buildPoll = setInterval(async () => {
    const before = app.queued;
    const { load } = await import('./core.js');
    await load().catch(() => {});
    if (app.queued !== before || !app.queued) render();
    if (!app.queued) clearInterval(app.buildPoll);
  }, 15_000);
}

export function deckChips() {
  const { native, target } = app.config;
  const capturing = new Set((app.config.targets || []).filter((code) => !(app.config.paused || []).includes(code)));
  return decks()
    .map((pair) => {
      const open = pair.native === native && pair.target === target;
      const on = capturing.has(pair.target);
      return `<div class="deck-row" ${open ? 'data-open' : ''}>
        <button class="deck-open" data-act="open-deck" data-value="${pair.native}>${pair.target}"
          aria-pressed="${open}" aria-label="${esc(t('Study {lang}', { lang: languageName(pair.target) }))}">
          <span class="code">${esc(pair.native)}<i>→</i>${esc(pair.target)}</span>
          <span class="lang">${esc(languageName(pair.target))}</span>
          <span class="n">${pair.total || 0}</span>
        </button>
        <button class="switch" role="switch" data-act="toggle-capture" data-value="${pair.target}"
          aria-checked="${on}"
          aria-label="${esc(t('Capture into {lang}', { lang: languageName(pair.target) }))}"></button>
      </div>`;
    })
    .join('');
}

function newDeckState() {
  const elsewhere = app.pairs.filter(
    (pair) => pair.target !== app.config.target || pair.native !== app.config.native,
  );
  const carried = elsewhere.reduce((sum, pair) => sum + pair.total, 0);

  if (carried) {
    return emptyState({
      art: {
        src: 'empty-deck.webp',
        alt: 'Flat line illustration: an empty index-card box on a desk beside a closed laptop, one blank card standing upright, thin black outline, blue and beige fills, white background, no text',
      },
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
    art: {
      src: 'empty-deck.webp',
      alt: 'Flat line illustration: an empty index-card box on a desk beside a closed laptop, one blank card standing upright, thin black outline, blue and beige fills, white background, no text',
    },
    title: t('Your deck is still empty'),
    body: t('It fills as you work.'),
    action: `<button class="btn" data-act="go" data-value="settings">${icon('gear-six', 'icon-sm icon')} ${esc(t('Check your languages'))}</button>`,
  });
}

function categoryTile(cat) {
  const info = meta(cat.key);
  return `<button class="cat" style="${tintOf(cat.key)}" data-act="overview-category" data-value="${cat.key}" data-tint="${info.tint}">
    <div class="cat-top">
      <span class="badge-icon">${icon(`${info.icon}-duotone`, 'icon-lg icon')}</span>
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

  return `<div class="kpis">
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
  return `<section class="panel hero-card">
    <div class="hero-copy">
      <span class="eyebrow-pill">${icon('translate', 'icon-sm icon')} ${esc(t('Learning {lang}', { lang: languageName(app.config.target) }))}</span>
      <h2 class="hero-title">${esc(totals.due ? t('{n} due right now', { n: totals.due }) : t('All caught up'))}</h2>
      <p class="hero-sub">${esc(dueLine)}</p>
      <button class="btn btn-primary lg" data-act="start" data-value="${app.category}" ${totals.due ? '' : 'aria-disabled="true"'}>
        ${icon('play', 'icon-sm icon')} ${esc(t('Start session'))}
      </button>
    </div>
    ${art('hero', 'Flat line illustration: a developer sitting cross-legged on a giant blank flashcard with a laptop, holding a smaller card up to the light; blue shirt, beige trousers, white background, no text', { width: 640, height: 400, cls: 'hero-art' })}
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
    ${art('tutorial', 'Flat line illustration: a person floating weightless with headphones, one knee bent, a blank card drifting nearby; white outline on dark, blue shirt', { width: 280, height: 210, cls: 'promo-art' })}
    <button class="btn-icon promo-close" data-act="dismiss-tutorial" aria-label="${esc(t('Dismiss'))}">${icon('x', 'icon-sm icon')}</button>
  </section>`;
}

function renderOverview() {
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
              ? wordList([...scoped].sort((a, b) => Number(b.isDue) - Number(a.isDue) || a.mastery - b.mastery))
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

registerScreen('overview', renderOverview);

export { renderOverview };
