import { MIN_ANSWERS } from './level.js';
import {
  $,
  ACTIONS,
  categoryKeys,
  LEVELS,
  api,
  app,
  esc,
  go,
  icon,
  levelBlurb,
  meta,
  pct,
  registerScreen,
  render,
  t,
  tn,
  toast,
  weekDots,
  weekdayName,
  shortDay,
  monthName,
} from './core.js';
import {
  CHART_TABLES,
  area,
  bars,
  chart,
  donut,
  gauge,
  gradeDots,
  heatmap,
  line,
  meter,
  skeleton,
  sparkline,
  stackedBars,
  table,
  tipRows,
} from './charts.js';

const RANGES = [
  ['7d', '7 days', 7],
  ['30d', '30 days', 30],
  ['90d', '90 days', 90],
  ['all', 'All time', 0],
];

const CATEGORY_COLOR = {
  engineering: 'var(--c-engineering)',
  process: 'var(--c-process)',
  collaboration: 'var(--c-collaboration)',
  phrasing: 'var(--c-phrasing)',
  connectors: 'var(--c-connectors)',
  everyday: 'var(--c-everyday)',
};

const GRADE_SERIES = [
  { key: '1', label: 'Again', color: 'var(--g1)' },
  { key: '2', label: 'Hard', color: 'var(--g2)' },
  { key: '3', label: 'Good', color: 'var(--g3)' },
  { key: '4', label: 'Easy', color: 'var(--g4)' },
];

const CEFR_COLOR = {
  A1: 'var(--seq-1)',
  A2: 'var(--seq-2)',
  B1: 'var(--seq-3)',
  B2: 'var(--seq-4)',
  C1: 'var(--seq-5)',
  C2: 'var(--c-collaboration)',
};

function dayString(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function query({ range = true } = {}) {
  const params = new URLSearchParams();
  const span = RANGES.find(([key]) => key === app.analytics.range)?.[2] ?? 30;
  if (range && span) params.set('from', dayString(-(span - 1)));
  if (app.analytics.category.length) params.set('category', app.analytics.category.join(','));
  if (app.analytics.cefr.length) params.set('cefr', app.analytics.cefr.join(','));
  return params.toString();
}

const FULL_HISTORY = new Set(['calendar', 'forecast', 'memory', 'retention', 'categories', 'cefr', 'hardest', 'level']);

const REPORTS = [
  'summary',
  'calendar',
  'forecast',
  'categories',
  'cefr',
  'memory',
  'retention',
  'activity',
  'grades',
  'hardest',
  'sessions',
  'level',
];

export async function loadAnalytics() {
  const scoped = query();
  const whole = query({ range: false });
  app.analytics.loading = true;
  try {
    const answers = await Promise.all(
      REPORTS.map((name) => {
        const suffix = FULL_HISTORY.has(name) ? whole : scoped;
        return api(`/api/analytics/${name}${suffix ? `?${suffix}` : ''}`);
      }),
    );
    app.analytics.data = Object.fromEntries(REPORTS.map((name, index) => [name, answers[index]]));
    app.analytics.ms = Math.max(...answers.map((answer) => answer.ms || 0));
  } catch (error) {
    toast(error.message || t('Could not load the numbers'), 'error');
    app.analytics.data = null;
  } finally {
    app.analytics.loading = false;
  }
}

const isDemo = () => !app.cards.length;

function demoData() {
  const days = [];
  for (let i = 370; i >= 0; i--) {
    const day = dayString(-i);
    const weekday = new Date(`${day}T12:00:00`).getDay();
    const base = weekday === 0 || weekday === 6 ? 3 : 14;
    const reviews = Math.max(0, Math.round(base + Math.sin(i / 5) * 7 + ((i * 7) % 5) - 2));
    days.push({ day, reviews, new: Math.min(4, reviews % 5), minutes: Math.round(reviews * 0.22) });
  }
  const cats = categoryKeys().map((key, index) => ({
    key,
    total: [64, 41, 33, 28, 19, 47][index],
    seen: [58, 36, 27, 21, 15, 39][index],
    new: [6, 5, 6, 7, 4, 8][index],
    due: [7, 4, 3, 5, 2, 6][index],
    learned: [31, 18, 11, 8, 6, 20][index],
    mastery: [0.62, 0.51, 0.44, 0.38, 0.47, 0.55][index],
    stability: [24, 18, 13, 11, 15, 20][index],
    retention: [0.91, 0.87, 0.83, 0.79, 0.88, 0.9][index],
    lapses: [9, 12, 15, 18, 6, 10][index],
  }));
  return {
    summary: {
      total: 232,
      seen: 196,
      new: 36,
      learned: 94,
      due_now: 27,
      due_reviews: 22,
      due_new: 5,
      daily_limit: 15,
      reviewed_today: 18,
      reviewed_yesterday: 12,
      minutes_today: 9,
      retention_7: 0.89,
      retention_30: 0.86,
      sessions: 64,
      avg_session_minutes: 11,
      avg_session_cards: 42,
      junk_rate: 0.04,
      mastery: 0.52,
      tomorrow: 19,
      streak: {
        goal: 5,
        days: 5,
        week: [0, 1, 1, 0, 1, 1, 1].map((hit, index) => ({ day: dayString(index - 6), hit: !!hit, reviews: hit * 14 })),
      },
      spark: days.slice(-14).map((day) => ({ day: day.day, value: day.reviews })),
    },
    calendar: { days, peak: Math.max(...days.map((day) => day.reviews)) },
    forecast: {
      limit: 15,
      overdue: 6,
      days: Array.from({ length: 30 }, (_, index) => ({
        day: dayString(index),
        reviews: Math.round(12 + Math.sin(index / 3) * 8 + (index % 4)),
        new: index < 12 ? 15 : 0,
      })).map((day) => ({ ...day, total: day.reviews + day.new })),
    },
    categories: { rows: cats },
    cefr: {
      rows: LEVELS.map((key, index) => ({
        key,
        total: [12, 34, 66, 71, 38, 11][index],
        seen: [12, 31, 58, 60, 28, 7][index],
        new: [0, 3, 8, 11, 10, 4][index],
        due: [1, 3, 8, 9, 5, 1][index],
        learned: [9, 21, 32, 24, 7, 1][index],
        mastery: [0.82, 0.71, 0.56, 0.4, 0.29, 0.18][index],
        stability: [40, 31, 19, 12, 8, 5][index],
        retention: [0.95, 0.92, 0.87, 0.82, 0.77, 0.7][index],
        lapses: [1, 4, 14, 21, 16, 5][index],
      })),
    },
    memory: { counts: { new: 36, learning: 22, review: 68, relearning: 12, learned: 94 }, total: 232 },
    retention: {
      histogram: [0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1].map((top, index) => ({
        top,
        cards: [8, 11, 17, 29, 46, 51, 34][index],
      })),
      curve: [1, 3, 7, 14, 30, 60, 120].map((days, index) => ({
        days,
        retrievability: [0.99, 0.96, 0.93, 0.9, 0.86, 0.81, 0.74][index],
        cards: [12, 21, 33, 41, 38, 26, 14][index],
      })),
      measured: [1, 2, 3, 5, 8, 13, 21, 34].map((days, index) => ({
        days,
        recalled: [0.97, 0.95, 0.94, 0.91, 0.89, 0.86, 0.84, 0.8][index],
        reviews: [40, 35, 33, 28, 24, 19, 14, 9][index],
      })),
      scheduled: 196,
    },
    activity: {
      hours: Array.from({ length: 24 }, (_, hour) => ({
        hour,
        reviews: hour < 7 || hour > 22 ? 0 : Math.round(20 * Math.exp(-((hour - 15) ** 2) / 26)),
      })),
      weekdays: Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        reviews: [42, 180, 164, 171, 158, 133, 51][weekday],
        minutes: [9, 41, 37, 39, 35, 30, 12][weekday],
      })),
      wild: days.slice(-14).map((day) => ({ day: day.day, reviews: Math.round(day.reviews * 0.06) })),
    },
    grades: {
      days: days.slice(-30).map((day) => ({
        day: day.day,
        1: Math.round(day.reviews * 0.12),
        2: Math.round(day.reviews * 0.16),
        3: Math.round(day.reviews * 0.48),
        4: Math.round(day.reviews * 0.24),
        total: day.reviews,
      })),
      totals: { 1: 61, 2: 84, 3: 246, 4: 121 },
    },
    hardest: {
      rows: [
        ['ship it behind a flag', 'выкатить под флагом', 'engineering', 'B2', 7],
        ['I would push back on that', 'я бы поспорил', 'collaboration', 'C1', 6],
        ['that said', 'при этом', 'connectors', 'B1', 5],
        ['a rough estimate', 'грубая оценка', 'process', 'B1', 4],
        ['it slipped my mind', 'вылетело из головы', 'phrasing', 'B2', 4],
      ].map(([front, back, category, cefr, lapses], index) => ({
        id: `demo${index}`,
        front,
        back,
        example: '',
        category,
        cefr,
        starred: index === 1,
        lapses,
        reviews: lapses + 6,
        difficulty: 7 - index * 0.4,
        stability: 3 + index,
        recent: [1, 3, 1, 2, 3].map((rating) => ({ rating })),
      })),
    },
    sessions: {
      rows: Array.from({ length: 8 }, (_, index) => ({
        id: index,
        started_at: new Date(Date.now() - index * 864e5).toISOString(),
        day: dayString(-index),
        minutes: [10, 15, 5, 10, 10, 15, 5, 10][index],
        reviewed: [42, 61, 21, 39, 44, 66, 19, 40][index],
        correct: [37, 52, 19, 33, 39, 58, 15, 35][index],
        duration_ms: [10, 15, 5, 10, 10, 15, 5, 10][index] * 60_000,
        accuracy: [0.88, 0.85, 0.9, 0.85, 0.89, 0.88, 0.79, 0.88][index],
      })),
    },
    level: {
      points: Array.from({ length: 12 }, (_, index) => ({
        day: dayString(-11 + index),
        theta: Number((-0.5 + index * 0.09).toFixed(4)),
        band: index < 7 ? 'B1' : 'B2',
        n: (index + 1) * 9,
      })),
      current: { band: 'B2', theta: 0.49, n: 108, min: MIN_ANSWERS, ceiling: 'B2', confident: true },
      floor: '',
    },
  };
}

export function kpi({ label, value, unit = '', foot = '', delta = null, spark = null, icon: ico = 'chart-bar', tint = 'sky', bar = null }) {
  const dir = delta === null ? null : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  return `<div class="kpi" data-tint="${tint}">
    <div class="kpi-head">
      <span class="badge-icon">${icon(`${ico}-duotone`, 'icon-lg icon')}</span>
      <span class="kpi-label">${esc(label)}</span>
    </div>
    <div class="kpi-main">
      <span class="kpi-value">${esc(String(value))}${unit ? `<span class="unit">${esc(unit)}</span>` : ''}</span>
      ${
        dir
          ? `<span class="kpi-delta" data-dir="${dir}">${icon(dir === 'up' ? 'arrow-up-right' : dir === 'down' ? 'arrow-down-right' : 'minus', 'icon-sm icon')}${esc(`${delta > 0 ? '+' : ''}${delta}`)}</span>`
          : ''
      }
    </div>
    <div class="kpi-foot">
      ${bar !== null ? meter(bar, { size: 'md' }) : spark ? sparkline(spark, { height: 48 }) : ''}
      ${foot ? `<span class="kpi-note">${foot}</span>` : ''}
    </div>
  </div>`;
}

function kpiRow(data) {
  const { summary } = data;
  return `<div class="kpis">
    ${kpi({
      label: t('Due now'),
      value: summary.due_now,
      icon: 'bell-ringing',
      tint: 'sky',
      bar: summary.total ? Math.min(1, summary.due_now / summary.total) : 0,
      foot: esc(t('{r} reviews · {n} new', { r: summary.due_reviews, n: summary.due_new })),
    })}
    ${kpi({
      label: t('Reviewed today'),
      value: summary.reviewed_today,
      icon: 'check-circle',
      tint: 'mint',
      delta: summary.reviewed_today - summary.reviewed_yesterday,
      foot: esc(t('{n} min', { n: summary.minutes_today })),
      spark: summary.spark?.map((point) => point.value),
    })}
    ${kpi({
      label: t('In long-term memory'),
      value: summary.learned,
      unit: ` / ${summary.total}`,
      icon: 'brain',
      tint: 'lavender',
      bar: summary.total ? summary.learned / summary.total : 0,
      foot: esc(t('stability over 21 days')),
    })}
    ${kpi({
      label: t('This week'),
      value: `${summary.streak.days}/${summary.streak.goal}`,
      unit: ` ${t('days')}`,
      icon: 'calendar-dots',
      tint: 'peach',
      foot: weekDots(summary.streak),
    })}
    ${kpi({
      label: t('Retention'),
      value: pct(summary.retention_7),
      icon: 'target',
      tint: 'rose',
      delta: Math.round((summary.retention_7 - summary.retention_30) * 100),
      bar: summary.retention_7,
      foot: esc(t('{n} over 30 days', { n: pct(summary.retention_30) })),
    })}
    ${kpi({
      label: t('Average session'),
      value: summary.avg_session_minutes,
      unit: ` ${t('min')}`,
      icon: 'clock',
      tint: 'butter',
      foot: esc(t('{n} cards · {s} sessions', { n: summary.avg_session_cards, s: summary.sessions })),
    })}
  </div>`;
}

function filterBar() {
  const { range, category, cefr } = app.analytics;
  return `<div class="filter-bar">
    <div class="filters filters-category" role="group" aria-label="${esc(t('Filter by category'))}">
      ${categoryKeys()
        .map((key) => {
          const info = meta(key);
          return `<button class="chip chip-sm" data-act="an-category" data-value="${key}"
            aria-pressed="${category.includes(key)}" style="${`--tint:var(--${info.tint});--tint-ink:var(--${info.tint}-ink)`}">
            <span class="dot">${icon(info.icon)}</span>${esc(info.label)}</button>`;
        })
        .join('')}
    </div>
    <div class="filters filters-level" role="group" aria-label="${esc(t('Filter by CEFR level'))}">
      ${LEVELS.map(
        (level) => `<button class="chip chip-sm" data-act="an-cefr" data-value="${level}"
          aria-pressed="${cefr.includes(level)}" title="${esc(levelBlurb(level))}">${level}</button>`,
      ).join('')}
    </div>
    <div class="actions">
      ${
        category.length || cefr.length || range !== '30d'
          ? `<button class="btn btn-quiet" data-act="an-reset">${icon('arrow-counter-clockwise', 'icon-sm icon')} ${esc(t('Reset'))}</button>`
          : ''
      }
      <button class="btn btn-quiet" data-act="an-copy">${icon('funnel', 'icon-sm icon')} ${esc(t('Copy as Markdown'))}</button>
      <button class="btn" data-act="an-csv">${icon('download-simple', 'icon-sm icon')} ${esc(t('Download CSV'))}</button>
    </div>
  </div>`;
}

function domainDonut(rows) {
  const live = rows.filter((row) => row.total > 0);
  const total = live.reduce((sum, row) => sum + row.total, 0);
  const segments = live.map((row) => ({
    key: row.key,
    value: row.total,
    color: CATEGORY_COLOR[row.key],
    action: 'an-category',
    label: `${meta(row.key).label}: ${row.total}`,
    tip: tipRows(meta(row.key).label, [
      [t('Cards'), row.total],
      [t('Share'), pct(row.total / (total || 1))],
      [t('Learned'), row.learned],
      [t('Due'), row.due],
      [t('Retention'), pct(row.retention)],
    ]),
  }));

  const legend = `<div class="legend">${live
    .map(
      (row) => `<button data-act="an-category" data-value="${row.key}"
        aria-pressed="${app.analytics.category.includes(row.key)}">
        <span class="swatch" style="--swatch:${CATEGORY_COLOR[row.key]}"></span>
        ${esc(meta(row.key).label)}<span class="n">${row.total}</span></button>`,
    )
    .join('')}</div>`;

  return chart('domains', {
    title: t('Where your words live'),
    note: t('click a slice to filter'),
    span: 6,
    aria: t('{n} cards across {d} domains', { n: total, d: live.length }),
    body: total
      ? donut(segments, { id: 'domains', size: 190, thickness: 18, center: { value: String(total), label: t('cards') } }) + legend
      : `<p class="session-empty">${esc(t('No cards in this slice.'))}</p>`,
    table: table(
      [t('Domain'), t('Cards'), t('Learned'), t('Due'), t('Retention')],
      rows.map((row) => [meta(row.key).label, row.total, row.learned, row.due, pct(row.retention)]),
    ),
  });
}

function memoryGauge(memory) {
  const order = [
    ['learned', 'Learned', 'var(--g3)'],
    ['review', 'In review', 'var(--g4)'],
    ['learning', 'Learning', 'var(--g2)'],
    ['relearning', 'Relearning', 'var(--g1)'],
    ['new', 'Not started', 'var(--chart-axis)'],
  ];
  const segments = order.map(([key, label, color]) => ({
    key,
    value: memory.counts[key] || 0,
    color,
    label: `${t(label)}: ${memory.counts[key] || 0}`,
    tip: tipRows(t(label), [
      [t('Cards'), memory.counts[key] || 0],
      [t('Share'), pct((memory.counts[key] || 0) / (memory.total || 1))],
    ]),
  }));

  return chart('memory', {
    title: t('Memory'),
    span: 6,
    aria: t('{n} of {total} cards learned', { n: memory.counts.learned, total: memory.total }),
    body:
      gauge(segments, {
        size: 190,
        thickness: 18,
        center: { value: pct((memory.counts.learned || 0) / (memory.total || 1)), label: t('learned') },
      }) +
      `<div class="legend">${order
        .map(
          ([key, label, color]) =>
            `<button tabindex="-1" aria-pressed="false"><span class="swatch" style="--swatch:${color}"></span>${esc(
              t(label),
            )}<span class="n">${memory.counts[key] || 0}</span></button>`,
        )
        .join('')}</div>`,
    table: table(
      [t('State'), t('Cards')],
      order.map(([key, label]) => [t(label), memory.counts[key] || 0]),
    ),
  });
}

function cefrChart(rows) {
  const max = Math.max(1, ...rows.map((row) => row.total));
  return chart('cefr', {
    title: t('By level'),
    span: 6,
    aria: t('cards by CEFR level'),
    body: `<div style="display:grid;gap:10px">
      ${rows
        .map(
          (row) => `<div class="hit" tabindex="0" data-act="an-cefr" data-value="${row.key}"
            data-tip="${tipRows(`${row.key} · ${levelBlurb(row.key)}`, [
              [t('Cards'), row.total],
              [t('Learned'), row.learned],
              [t('Mastery'), pct(row.mastery)],
            ])}"
            aria-label="${esc(`${row.key}: ${row.total}`)}"
            style="display:grid;grid-template-columns:28px 1fr auto;align-items:center;gap:10px;cursor:pointer">
            <b style="font-size:.8125rem">${row.key}</b>
            <span style="position:relative;height:14px;border-radius:var(--pill);background:var(--sunk);overflow:hidden">
              <i style="position:absolute;inset-block:0;inset-inline-start:0;width:${(row.total / max) * 100}%;border-radius:var(--pill);background:${CEFR_COLOR[row.key]};opacity:.35"></i>
              <i style="position:absolute;inset-block:0;inset-inline-start:0;width:${(row.learned / max) * 100}%;border-radius:var(--pill);background:${CEFR_COLOR[row.key]}"></i>
            </span>
            <span style="font-size:.75rem;color:var(--ink-3);font-variant-numeric:tabular-nums">${row.total}</span>
          </div>`,
        )
        .join('')}
    </div>
    <p class="lede" style="margin-top:12px;font-size:.75rem">${esc(t('Solid is learned, faded is the rest.'))}</p>`,
    table: table(
      [t('Level'), t('Cards'), t('Learned'), t('Mastery')],
      rows.map((row) => [row.key, row.total, row.learned, pct(row.mastery)]),
    ),
  });
}

function progressChart(calendarData) {
  const months = new Map();
  for (const day of calendarData.days) {
    const key = day.day.slice(0, 7);
    months.set(key, (months.get(key) || 0) + day.reviews);
  }
  const rows = [...months.entries()].slice(-12);
  const points = rows.map(([key, reviews]) => {
    const label = monthName(key);
    return {
      value: reviews,
      axis: label,
      label: `${label}: ${reviews}`,
      tip: tipRows(label, [[t('Reviews'), reviews, 'check-circle']]),
    };
  });
  const total = rows.reduce((sum, [, reviews]) => sum + reviews, 0);
  return chart('progress', {
    title: t('Progress over time'),
    note: t('{n} in total', { n: total }),
    span: 12,
    aria: t('reviews per month over the last year'),
    body: bars(points, { height: 260, width: 1200, current: points.length - 1, id: 'progress' }),
    table: table([t('Month'), t('Reviews')], rows.map(([key, reviews]) => [key, reviews])),
  });
}

function calendarChart(calendarData) {
  return chart('calendar', {
    title: t('A year of reviews'),
    note: t('{n} in total', { n: calendarData.days.reduce((sum, day) => sum + day.reviews, 0) }),
    span: 12,
    aria: t('daily review counts for the last year'),
    body: heatmap(calendarData.days, calendarData.peak),
    table: table(
      [t('Day'), t('Reviews'), t('New'), t('Minutes')],
      calendarData.days.filter((day) => day.reviews).slice(-60).map((day) => [day.day, day.reviews, day.new, day.minutes]),
    ),
  });
}

function weekdayChart(activity) {
  const points = activity.weekdays.map((row) => ({
    value: row.reviews,
    axis: weekdayName(row.weekday, 'narrow'),
    label: `${weekdayName(row.weekday, 'long')}: ${row.reviews}`,
    tip: tipRows(weekdayName(row.weekday, 'long'), [
      [t('Reviews'), row.reviews],
      [t('Minutes'), row.minutes],
    ]),
  }));
  const best = activity.weekdays.reduce((a, b) => (b.reviews > a.reviews ? b : a), activity.weekdays[0]);
  return chart('weekday', {
    title: t('By day of the week'),
    note: best?.reviews ? t('busiest: {day}', { day: weekdayName(best.weekday, 'long') }) : '',
    span: 6,
    aria: t('reviews by day of the week'),
    body: bars(points, { height: 160, current: best ? activity.weekdays.indexOf(best) : -1 }),
    table: table(
      [t('Day'), t('Reviews'), t('Minutes')],
      activity.weekdays.map((row) => [weekdayName(row.weekday, 'long'), row.reviews, row.minutes]),
    ),
  });
}

function hourChart(activity) {
  const points = activity.hours.map((row) => ({
    value: row.reviews,
    axis: row.hour % 6 === 0 ? String(row.hour) : '',
    label: `${row.hour}:00 — ${row.reviews}`,
    tip: tipRows(`${String(row.hour).padStart(2, '0')}:00`, [[t('Reviews'), row.reviews]]),
  }));
  return chart('hours', {
    title: t('By hour of the day'),
    span: 6,
    aria: t('reviews by hour of the day'),
    body: bars(points, { height: 160, labelEvery: 1, dots: false }),
    table: table(
      [t('Hour'), t('Reviews')],
      activity.hours.filter((row) => row.reviews).map((row) => [`${row.hour}:00`, row.reviews]),
    ),
  });
}

function wildChart(activity) {
  const rows = (activity.wild || []).slice(-30);
  const total = rows.reduce((sum, row) => sum + row.reviews, 0);
  if (!total) return '';
  const points = rows.map((row) => ({
    value: row.reviews,
    axis: '',
    label: `${shortDay(row.day)}: ${row.reviews}`,
    tip: tipRows(shortDay(row.day), [[t('Used at work'), row.reviews]]),
  }));
  return chart('wild', {
    title: t('Words you actually used'),
    note: t('{n} in the last thirty days', { n: total }),
    span: 6,
    aria: t('deck words used in real prompts, by day'),
    body: bars(points, { height: 160, dots: false }),
    table: table([t('Day'), t('Used at work')], rows.map((row) => [shortDay(row.day), row.reviews])),
  });
}

function gradesChart(grades) {
  const days = grades.days.slice(-45);
  const total = Object.values(grades.totals).reduce((sum, value) => sum + value, 0);
  return chart('grades', {
    title: t('How the answers went'),
    note: total ? t('{n} graded', { n: total }) : '',
    span: 6,
    aria: t('grade distribution by day'),
    body: days.length
      ? stackedBars(days, GRADE_SERIES, { height: 150 }) +
        `<div class="legend">${GRADE_SERIES.map(
          (series) =>
            `<button tabindex="-1" aria-pressed="false"><span class="swatch" style="--swatch:${series.color}"></span>${esc(
              t(series.label),
            )}<span class="n">${grades.totals[series.key] || 0}</span></button>`,
        ).join('')}</div>`
      : `<p class="session-empty">${esc(t('Nothing graded in this slice yet.'))}</p>`,
    table: table(
      [t('Day'), t('Again'), t('Hard'), t('Good'), t('Easy')],
      days.map((day) => [day.day, day[1], day[2], day[3], day[4]]),
    ),
  });
}

function forecastChart(forecast) {
  return chart('forecast', {
    title: t('What is coming'),
    note: forecast.overdue
      ? t('{n} overdue, and this is what follows', { n: forecast.overdue })
      : t('next 30 days'),
    span: 6,
    aria: t('cards due over the next 30 days'),
    body:
      area(forecast.days, {
        height: 160,
        limit: forecast.limit,
        keys: [
          { key: 'reviews', label: 'Reviews', color: 'var(--accent)', opacity: 0.75 },
          { key: 'new', label: 'New', color: 'var(--c-connectors)', opacity: 0.6 },
        ],
      }) +
      `<div class="legend">
        <button tabindex="-1" aria-pressed="false"><span class="swatch" style="--swatch:var(--accent)"></span>${esc(t('Reviews'))}</button>
        <button tabindex="-1" aria-pressed="false"><span class="swatch" style="--swatch:var(--c-connectors)"></span>${esc(t('New'))}</button>
        <button tabindex="-1" aria-pressed="false"><span class="swatch" style="--swatch:var(--danger)"></span>${esc(t('Daily limit'))}</button>
      </div>`,
    table: table(
      [t('Day'), t('Reviews'), t('New'), t('Total')],
      forecast.days.map((day) => [day.day, day.reviews, day.new, day.total]),
    ),
  });
}

const BAND_SPAN = 6;

function levelChart(level) {
  const points = (level?.points || []).map((point) => ({
    ...point,
    tip: tipRows(point.day, [
      [t('Level'), point.band || '—'],
      [t('Answers'), point.n],
    ]),
  }));

  return chart('level', {
    title: t('Your level over time'),
    note: level?.current?.confident
      ? t('estimated from {n} answers', { n: level.current.n })
      : t('{n} of {min} answers to estimate', { n: level?.current?.n || 0, min: level?.current?.min || MIN_ANSWERS }),
    span: 6,
    aria: t('the estimated level after every graded answer'),
    body: line(points, {
      xOf: (point) => point.n,
      yOf: (point) => Math.min(1, Math.max(0, (point.theta + 3) / BAND_SPAN)),
      height: 160,
      xLabel: t('answers'),
      yTicks: LEVELS.map((band, index) => ({ at: (index + 0.5) / LEVELS.length, label: band })),
    }),
    table: table(
      [t('Day'), t('Level'), t('Answers')],
      points.slice(-12).map((point) => [point.day, point.band || '—', String(point.n)]),
    ),
  });
}

function retentionChart(retention) {
  const curve = retention.curve.map((point) => ({
    ...point,
    label: `${point.days}d: ${pct(point.retrievability)}`,
    tip: tipRows(t('{n} days since review', { n: point.days }), [
      [t('Recall probability'), pct(point.retrievability)],
      [t('Cards'), point.cards],
    ]),
  }));

  const histogram = retention.histogram.map((bucket) => ({
    value: bucket.cards,
    axis: `${Math.round(bucket.top * 100)}`,
    label: `${pct(bucket.top)}: ${bucket.cards}`,
    color: bucket.top >= 0.9 ? 'var(--g3)' : bucket.top >= 0.7 ? 'var(--g2)' : 'var(--g1)',
    tip: tipRows(t('up to {n} recall', { n: pct(bucket.top) }), [[t('Cards'), bucket.cards]]),
  }));

  return chart('retention', {
    title: t('How well it is holding'),
    note: t('{n} scheduled cards', { n: retention.scheduled }),
    span: 6,
    aria: t('recall probability against days since the last review'),
    body: curve.length
      ? line(curve, {
          xOf: (point) => Math.log(point.days + 1),
          yOf: (point) => point.retrievability,
          height: 160,
          xLabel: t('days since the last review'),
          xTicks: curve
            .filter((point, index) => index % Math.max(1, Math.ceil(curve.length / 5)) === 0)
            .map((point) => ({ at: Math.log(point.days + 1), label: `${point.days}d` })),
        }) +
        `<p class="lede" style="margin:14px 0 6px;font-size:.75rem">${esc(t('Where the deck sits on that curve'))}</p>` +
        bars(histogram, { height: 110, dots: false })
      : `<p class="session-empty">${esc(t('Not enough history yet — a few sessions and this fills in.'))}</p>`,
    table: table(
      [t('Days'), t('Recall probability'), t('Cards')],
      retention.curve.map((point) => [point.days, pct(point.retrievability), point.cards]),
    ),
  });
}

function hardestChart(rows) {
  return chart('hardest', {
    title: t('The ones that keep slipping'),
    span: 6,
    aria: t('{n} hardest cards', { n: rows.length }),
    body: rows.length
      ? `<ul class="mini-rows">${rows
          .map(
            (row) => `<li class="mini-row" style="${`--tint:var(--${meta(row.category).tint});--tint-ink:var(--${meta(row.category).tint}-ink)`}">
              <span class="who">
                <button class="star" data-act="favorite" data-value="${row.id}" aria-pressed="${!!row.starred}"
                  aria-label="${esc(t('Add to favourites'))}">${icon('star', 'icon-sm icon')}</button>
                <button class="star danger" data-act="discard" data-value="${row.id}"
                  aria-label="${esc(t('Delete {word} for good', { word: row.front }))}">${icon('trash', 'icon-sm icon')}</button>
              </span>
              <span class="front">${esc(row.front)}</span>
              <span class="back">${esc(row.back)}</span>
              ${row.cefr ? `<span class="level">${esc(row.cefr)}</span>` : '<span></span>'}
              ${gradeDots(row.recent || [])}
              <span class="n">${esc(tn(row.lapses, 'lapse', 'lapses'))}</span>
            </li>`,
          )
          .join('')}</ul>`
      : `<p class="session-empty">${esc(t('Nothing has tripped you up yet.'))}</p>`,
    table: table(
      [t('Word'), t('Meaning'), t('Lapses'), t('Reviews')],
      rows.map((row) => [row.front, row.back, row.lapses, row.reviews]),
    ),
  });
}

function sessionsChart(rows) {
  return chart('sessions', {
    title: t('Recent sessions'),
    span: 6,
    aria: t('{n} recent sessions', { n: rows.length }),
    body: rows.length
      ? `<ul class="mini-rows">${rows
          .map(
            (row) => `<li class="mini-row session-row">
              <span class="front">${esc(shortDay(row.day))}</span>
              <span class="back">${esc(tn(row.reviewed, 'card', 'cards'))}</span>
              <span class="n">${esc(t('{n} min', { n: Math.max(1, Math.round(row.duration_ms / 60000)) }))}</span>
              ${meter(row.accuracy, { color: row.accuracy >= 0.8 ? 'var(--g3)' : 'var(--g2)', size: 'sm' })}
              <span class="n">${esc(pct(row.accuracy))}</span>
            </li>`,
          )
          .join('')}</ul>`
      : `<p class="session-empty">${esc(t('No finished sessions yet.'))}</p>`,
    table: table(
      [t('Day'), t('Minutes'), t('Cards'), t('Accuracy')],
      rows.map((row) => [row.day, Math.round(row.duration_ms / 60000), row.reviewed, pct(row.accuracy)]),
    ),
  });
}

function markdownSummary(data) {
  const rows = [
    `# Loanword — ${app.config.native} → ${app.config.target}`,
    '',
    '| Metric | Value |',
    '| --- | --- |',
    `| Cards | ${data.summary.total} |`,
    `| In long-term memory | ${data.summary.learned} |`,
    `| Due now | ${data.summary.due_now} |`,
    `| Retention (7d) | ${pct(data.summary.retention_7)} |`,
    `| Retention (30d) | ${pct(data.summary.retention_30)} |`,
    `| Days this week | ${data.summary.streak.days}/${data.summary.streak.goal} |`,
    `| Average session | ${data.summary.avg_session_minutes} min |`,
    '',
    '| Domain | Cards | Learned | Due | Retention |',
    '| --- | --- | --- | --- | --- |',
    ...data.categories.rows.map(
      (row) => `| ${meta(row.key).label} | ${row.total} | ${row.learned} | ${row.due} | ${pct(row.retention)} |`,
    ),
  ];
  return rows.join('\n');
}

function renderAnalytics() {
  const page = $('#page-analytics');
  const demo = isDemo();
  const data = demo ? demoData() : app.analytics.data;

  if (!data) {
    page.innerHTML = `${filterBar()}
      <div class="kpis">${Array.from({ length: 6 }, () => skeleton(168)).join('')}</div>
      <div class="charts">
        ${[12, 6, 6, 6, 6, 12, 6, 6]
          .map((span) => `<section class="chart" data-span="${span}">${skeleton(span === 12 ? 220 : 260)}</section>`)
          .join('')}
      </div>`;
    if (!app.analytics.loading) loadAnalytics().then(render);
    return;
  }

  const { range } = app.analytics;
  page.innerHTML = `
    <div class="page-head">
      <div>
        <h1>${t('How it is going')}</h1>
        <p class="lede">${esc(t('Every number here comes from your own review log.'))}</p>
      </div>
      <div class="segmented" role="group" aria-label="${esc(t('Period'))}">
        ${RANGES.map(
          ([key, label]) => `<button data-act="an-range" data-value="${key}" aria-pressed="${range === key}">
            ${esc(t(label))}</button>`,
        ).join('')}
      </div>
    </div>
    ${
      demo
        ? `<div class="demo-note">${icon('warning-circle', 'icon-sm icon')} <span>${esc(
            t('Demo data — your first session replaces it.'),
          )}</span></div>`
        : ''
    }
    ${filterBar()}
    ${kpiRow(data)}
    <div class="charts">
      ${progressChart(data.calendar)}
      ${domainDonut(data.categories.rows)}
      ${memoryGauge(data.memory)}
      ${cefrChart(data.cefr.rows)}
      ${forecastChart(data.forecast)}
      ${calendarChart(data.calendar)}
      ${retentionChart(data.retention)}
      ${gradesChart(data.grades)}
      ${weekdayChart(data.activity)}
      ${hourChart(data.activity)}
      ${wildChart(data.activity)}
      ${hardestChart(data.hardest.rows)}
      ${sessionsChart(data.sessions.rows)}
      ${levelChart(data.level)}
    </div>`;
}

const toggle = (list, value) =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

Object.assign(ACTIONS, {
  'an-range': async (value) => {
    app.analytics.range = value;
    app.analytics.data = null;
    go('analytics');
    await loadAnalytics();
    render();
  },
  'an-category': async (value) => {
    app.analytics.category = toggle(app.analytics.category, value);
    go('analytics');
    await loadAnalytics();
    render();
  },
  'an-cefr': async (value) => {
    app.analytics.cefr = toggle(app.analytics.cefr, value);
    go('analytics');
    await loadAnalytics();
    render();
  },
  'an-reset': async () => {
    app.analytics.range = '30d';
    app.analytics.category = [];
    app.analytics.cefr = [];
    go('analytics');
    await loadAnalytics();
    render();
  },
  'chart-table': (value) => {
    if (CHART_TABLES.has(value)) CHART_TABLES.delete(value);
    else CHART_TABLES.add(value);
    render();
  },
  'an-csv': () => {
    const suffix = query();
    location.href = `/api/analytics/export.csv${suffix ? `?${suffix}` : ''}`;
  },
  'an-copy': async () => {
    const data = isDemo() ? demoData() : app.analytics.data;
    if (!data) return;
    const text = markdownSummary(data);
    try {
      await navigator.clipboard.writeText(text);
      toast(t('Copied'));
    } catch {
      const box = document.createElement('textarea');
      box.value = text;
      box.setAttribute('readonly', '');
      box.style.cssText = 'position:fixed;inset-inline-start:-9999px';
      document.body.append(box);
      box.select();
      toast(t('Select and copy — the browser would not do it for us'), 'error');
      setTimeout(() => box.remove(), 20_000);
    }
  },
});

registerScreen('analytics', renderAnalytics);

