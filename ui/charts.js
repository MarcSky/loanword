import { $, esc, icon, reducedMotion, t, tn, shortDay, pct } from './core.js';

export const CHART_TABLES = new Set();

let tipNode;

function tip() {
  if (!tipNode) {
    tipNode = document.createElement('div');
    tipNode.className = 'tip';
    tipNode.id = 'chart-tip';
    tipNode.setAttribute('role', 'tooltip');
    document.body.append(tipNode);
  }
  return tipNode;
}

export function showTip(target) {
  const body = target.dataset.tip;
  if (!body) return;
  const node = tip();
  node.innerHTML = body;
  const box = target.getBoundingClientRect();
  const x = Math.min(Math.max(box.left + box.width / 2, 130), innerWidth - 130);
  node.style.left = `${x}px`;
  node.style.top = `${Math.max(box.top, 60)}px`;
  node.dataset.show = '1';
  target.setAttribute('aria-describedby', 'chart-tip');
}

export function hideTip() {
  if (!tipNode) return;
  delete tipNode.dataset.show;
  document.querySelectorAll('[aria-describedby="chart-tip"]').forEach((node) =>
    node.removeAttribute('aria-describedby'),
  );
}

export function bindTips(root = document) {
  root.addEventListener('mouseover', (event) => {
    const target = event.target.closest('[data-tip]');
    if (target) showTip(target);
  });
  root.addEventListener('mouseout', (event) => {
    if (event.target.closest('[data-tip]')) hideTip();
  });
  root.addEventListener('focusin', (event) => {
    const target = event.target.closest('[data-tip]');
    if (target) showTip(target);
    else hideTip();
  });
  root.addEventListener('focusout', hideTip);
  addEventListener('scroll', hideTip, true);
}

export const tipRows = (title, rows) =>
  esc(
    `<b>${title}</b>` +
      rows
        .filter(Boolean)
        .map(
          ([label, value, ico]) =>
            `<span class="row">${ico ? `<span class="tip-ico">${icon(ico, 'icon-sm icon')}</span>` : ''}<span class="tip-l">${label}</span><span class="tip-v">${value}</span></span>`,
        )
        .join(''),
  );

export function chart(id, { title, note = '', span = 6, aria, body, table, actions = '' }) {
  const showing = CHART_TABLES.has(id);
  return `<section class="chart" data-span="${span}" data-chart="${id}">
    <header class="chart-head">
      <h3>${esc(title)}</h3>
      ${note ? `<p class="lede">${esc(note)}</p>` : ''}
      <span class="spacer"></span>
      ${actions}
      ${
        table
          ? `<button class="table-toggle" data-act="chart-table" data-value="${id}" aria-pressed="${showing}">
              ${icon(showing ? 'chart-bar' : 'table', 'icon-sm icon')}
              ${esc(showing ? t('Chart') : t('Table'))}
            </button>`
          : ''
      }
    </header>
    <div class="chart-body" role="img" aria-label="${esc(aria || title)}">
      ${showing && table ? `<div class="chart-scroll">${table}</div>` : body}
    </div>
  </section>`;
}

export function table(head, rows) {
  return `<table class="chart-table">
    <thead><tr>${head.map((cell) => `<th>${esc(cell)}</th>`).join('')}</tr></thead>
    <tbody>${rows
      .map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`)
      .join('')}</tbody>
  </table>`;
}

export function sparkline(values, { width = 120, height = 26 } = {}) {
  if (!values.length) return '';
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const point = (value, index) => [index * step, height - (value / max) * (height - 3) - 1.5];
  const path = values.map((value, index) => point(value, index).join(',')).join(' L ');
  const area = `M 0,${height} L ${path} L ${(values.length - 1) * step},${height} Z`;
  return `<svg class="kpi-spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
    <path class="area" d="${area}"></path>
    <path d="M ${path}"></path>
  </svg>`;
}

export function donut(segments, { size = 190, thickness = 26, id = '', center } = {}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  const arcs = segments
    .filter((segment) => segment.value > 0)
    .map((segment) => {
      const length = (segment.value / total) * circumference;
      const arc = `<circle class="hit" r="${radius}" cx="${size / 2}" cy="${size / 2}"
        fill="none" stroke="${segment.color}" stroke-width="${thickness}"
        stroke-dasharray="${length - 1.5} ${circumference - length + 1.5}"
        stroke-dashoffset="${-offset}"
        transform="rotate(-90 ${size / 2} ${size / 2})"
        tabindex="0" role="button"
        data-act="${segment.action || ''}" data-value="${esc(segment.key)}"
        data-tip="${segment.tip}"
        aria-label="${esc(segment.label)}"></circle>`;
      offset += length;
      return arc;
    })
    .join('');

  return `<svg viewBox="0 0 ${size} ${size}" style="max-width:${size}px;margin-inline:auto" data-donut="${id}">
    <circle r="${radius}" cx="${size / 2}" cy="${size / 2}" fill="none"
      stroke="var(--chart-grid)" stroke-width="${thickness}"></circle>
    ${arcs}
    ${
      center
        ? `<text x="${size / 2}" y="${size / 2 - 2}" text-anchor="middle" font-size="30" font-weight="600"
             fill="var(--ink)" style="letter-spacing:-0.02em">${esc(center.value)}</text>
           <text x="${size / 2}" y="${size / 2 + 18}" text-anchor="middle" font-size="11"
             fill="var(--ink-3)">${esc(center.label)}</text>`
        : ''
    }
  </svg>`;
}

export function gauge(segments, { size = 190, thickness = 24, center } = {}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  const radius = (size - thickness) / 2;
  const height = size / 2 + thickness / 2 + 24;
  const arcLength = Math.PI * radius;
  let offset = 0;

  const arcs = segments
    .filter((segment) => segment.value > 0)
    .map((segment) => {
      const length = (segment.value / total) * arcLength;
      const arc = `<circle class="hit" r="${radius}" cx="${size / 2}" cy="${size / 2}"
        fill="none" stroke="${segment.color}" stroke-width="${thickness}" stroke-linecap="butt"
        stroke-dasharray="${Math.max(0, length - 1.5)} ${2 * Math.PI * radius}"
        stroke-dashoffset="${-offset}"
        transform="rotate(180 ${size / 2} ${size / 2})"
        tabindex="0" data-tip="${segment.tip}" aria-label="${esc(segment.label)}"></circle>`;
      offset += length;
      return arc;
    })
    .join('');

  return `<svg viewBox="0 0 ${size} ${height}" style="max-width:${size}px;margin-inline:auto">
    <circle r="${radius}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="var(--chart-grid)"
      stroke-width="${thickness}" stroke-dasharray="${arcLength} ${2 * Math.PI * radius}"
      transform="rotate(180 ${size / 2} ${size / 2})"></circle>
    ${arcs}
    ${
      center
        ? `<text x="${size / 2}" y="${size / 2 - 10}" text-anchor="middle" font-size="32" font-weight="600"
             fill="var(--ink)" style="letter-spacing:-0.02em">${esc(center.value)}</text>
           <text x="${size / 2}" y="${size / 2 + 10}" text-anchor="middle" font-size="11"
             fill="var(--ink-3)">${esc(center.label)}</text>`
        : ''
    }
  </svg>`;
}

const W = 600;

export function bars(points, { height = 170, width = W, color = 'var(--accent-tint)', labelEvery = 1, id = '', current = -1, dots = true } = {}) {
  if (!points.length) return '';
  const max = Math.max(1, ...points.map((point) => point.value));
  const slot = width / points.length;
  const barWidth = Math.max(2, slot * 0.6);
  const radius = Math.min(10, barWidth / 2);
  const top = 12;
  const floor = height - 22;
  const animate = reducedMotion() ? '' : ' data-animate';

  const rects = points
    .map((point, index) => {
      const tall = (point.value / max) * (floor - top);
      const x = index * slot + (slot - barWidth) / 2;
      const live = index === current || point.current;
      const fill = live ? 'var(--accent)' : point.color || color;
      const h = Math.max(tall, point.value ? 3 : 0);
      const dot =
        dots && point.value && barWidth >= 8
          ? `<circle cx="${(x + barWidth / 2).toFixed(2)}" cy="${(floor - h - 6).toFixed(2)}" r="3" fill="${fill}" pointer-events="none"></circle>`
          : '';
      return `<g class="bar" style="--i:${index}"><rect class="hit" x="${x.toFixed(2)}" y="${(floor - h).toFixed(2)}" width="${barWidth.toFixed(2)}"
        height="${h.toFixed(2)}" rx="${radius.toFixed(2)}" fill="${fill}" ${live ? 'data-active' : ''}
        tabindex="0" data-tip="${point.tip}" aria-label="${esc(point.label)}"></rect>${dot}</g>`;
    })
    .join('');

  const grid = [0.25, 0.5, 0.75, 1]
    .map((level) => {
      const y = (floor - level * (floor - top)).toFixed(2);
      return `<line class="grid-line" x1="0" x2="${width}" y1="${y}" y2="${y}" stroke-dasharray="4 4"></line>`;
    })
    .join('');

  const labels = points
    .map((point, index) =>
      point.axis && index % labelEvery === 0
        ? `<text class="axis" x="${(index * slot + slot / 2).toFixed(2)}" y="${height - 6}" text-anchor="middle">${esc(point.axis)}</text>`
        : '',
    )
    .join('');

  return `<svg viewBox="0 0 ${width} ${height}" data-bars="${id}"${animate}>
    ${grid}
    ${rects}${labels}
  </svg>`;
}

export function stackedBars(days, series, { height = 180 } = {}) {
  if (!days.length) return '';
  const max = Math.max(1, ...days.map((day) => series.reduce((sum, key) => sum + (day[key.key] || 0), 0)));
  const slot = W / days.length;
  const barWidth = Math.max(2, slot * 0.66);
  const top = 10;
  const floor = height - 22;

  const columns = days
    .map((day, index) => {
      let y = floor;
      const x = index * slot + (slot - barWidth) / 2;
      const total = series.reduce((sum, key) => sum + (day[key.key] || 0), 0);
      const parts = series
        .map((key) => {
          const value = day[key.key] || 0;
          if (!value) return '';
          const tall = (value / max) * (floor - top);
          y -= tall;
          return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}"
            height="${tall.toFixed(2)}" fill="${key.color}"></rect>`;
        })
        .join('');
      return `<g class="hit" tabindex="0" data-tip="${tipRows(shortDay(day.day), [
        ...series.map((key) => [t(key.label), day[key.key] || 0]),
        [t('Total'), total],
      ])}" aria-label="${esc(`${day.day}: ${total}`)}">
        <rect x="${x.toFixed(2)}" y="${top}" width="${barWidth.toFixed(2)}" height="${floor - top}" fill="transparent"></rect>
        ${parts}
      </g>`;
    })
    .join('');

  const step = Math.max(1, Math.ceil(days.length / 8));
  const labels = days
    .map((day, index) =>
      index % step === 0
        ? `<text class="axis" x="${(index * slot + slot / 2).toFixed(2)}" y="${height - 6}" text-anchor="middle">${esc(shortDay(day.day))}</text>`
        : '',
    )
    .join('');

  return `<svg viewBox="0 0 ${W} ${height}">
    <line class="grid-line" x1="0" x2="${W}" y1="${floor}" y2="${floor}"></line>
    ${columns}${labels}
  </svg>`;
}

export function area(points, { height = 190, limit = null, keys = [] } = {}) {
  if (points.length < 2) return '';
  const max = Math.max(1, limit || 0, ...points.map((point) => keys.reduce((sum, key) => sum + (point[key.key] || 0), 0)));
  const step = W / (points.length - 1);
  const top = 10;
  const floor = height - 22;
  const x = (index) => index * step;
  const y = (value) => floor - (value / max) * (floor - top);

  let base = points.map(() => 0);
  const layers = keys
    .map((key) => {
      const upper = points.map((point, index) => base[index] + (point[key.key] || 0));
      const top_edge = upper.map((value, index) => `${x(index).toFixed(2)},${y(value).toFixed(2)}`);
      const bottom_edge = base
        .map((value, index) => `${x(index).toFixed(2)},${y(value).toFixed(2)}`)
        .reverse();
      base = upper;
      return `<path d="M ${top_edge.join(' L ')} L ${bottom_edge.join(' L ')} Z"
        fill="${key.color}" fill-opacity="${key.opacity ?? 0.85}"></path>`;
    })
    .join('');

  const hotspots = points
    .map((point, index) => {
      const total = keys.reduce((sum, key) => sum + (point[key.key] || 0), 0);
      return `<rect class="hit" x="${Math.max(0, x(index) - step / 2).toFixed(2)}" y="${top}"
        width="${step.toFixed(2)}" height="${floor - top}" fill="transparent" tabindex="0"
        data-tip="${tipRows(shortDay(point.day), [
          ...keys.map((key) => [t(key.label), point[key.key] || 0]),
          [t('Total'), total],
        ])}" aria-label="${esc(`${point.day}: ${total}`)}"></rect>`;
    })
    .join('');

  const step_label = Math.max(1, Math.ceil(points.length / 6));
  const labels = points
    .map((point, index) =>
      index % step_label === 0
        ? `<text class="axis" x="${x(index).toFixed(2)}" y="${height - 6}" text-anchor="middle">${esc(shortDay(point.day))}</text>`
        : '',
    )
    .join('');

  return `<svg viewBox="0 0 ${W} ${height}">
    <line class="grid-line" x1="0" x2="${W}" y1="${floor}" y2="${floor}"></line>
    ${layers}
    ${
      limit
        ? `<line x1="0" x2="${W}" y1="${y(limit).toFixed(2)}" y2="${y(limit).toFixed(2)}" stroke="var(--danger)"
             stroke-width="1.5" stroke-dasharray="6 5"></line>`
        : ''
    }
    ${hotspots}${labels}
  </svg>`;
}

export function line(points, { height = 190, xOf, yOf, color = 'var(--accent)', xLabel, xTicks = [] } = {}) {
  if (points.length < 2) return '';
  const top = 10;
  const floor = height - 26;
  const xs = points.map(xOf);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const px = (value) => ((value - minX) / Math.max(1e-6, maxX - minX)) * W;
  const py = (value) => floor - value * (floor - top);

  const path = points.map((point) => `${px(xOf(point)).toFixed(2)},${py(yOf(point)).toFixed(2)}`).join(' L ');
  const dots = points
    .map(
      (point) => `<circle class="hit" cx="${px(xOf(point)).toFixed(2)}" cy="${py(yOf(point)).toFixed(2)}" r="4"
        fill="${color}" tabindex="0" data-tip="${point.tip}" aria-label="${esc(point.label)}"></circle>`,
    )
    .join('');

  const ticks = xTicks
    .map(
      (tick) => `<text class="axis" x="${px(tick.at).toFixed(2)}" y="${floor + 14}" text-anchor="middle">${esc(tick.label)}</text>`,
    )
    .join('');

  return `<svg viewBox="0 0 ${W} ${height}">
    ${[0.25, 0.5, 0.75, 1]
      .map((level) => `<line class="grid-line" x1="0" x2="${W}" y1="${py(level).toFixed(2)}" y2="${py(level).toFixed(2)}"></line>`)
      .join('')}
    ${[0.5, 1]
      .map((level) => `<text class="axis" x="2" y="${(py(level) - 3).toFixed(2)}">${Math.round(level * 100)}%</text>`)
      .join('')}
    <path d="M ${path}" fill="none" stroke="${color}" stroke-width="2.5"
      stroke-linecap="round" stroke-linejoin="round"></path>
    ${dots}${ticks}
    ${xLabel ? `<text class="axis" x="${W / 2}" y="${height - 2}" text-anchor="middle">${esc(xLabel)}</text>` : ''}
  </svg>`;
}

const HEAT_LEVELS = 5;

export function heatmap(days, peak) {
  if (!days.length) return '';
  const cell = 13;
  const gap = 3;
  const weeks = Math.ceil((days.length + new Date(`${days[0].day}T12:00:00`).getDay()) / 7);
  const width = weeks * (cell + gap);
  const height = 7 * (cell + gap) + 16;
  const level = (value) => (value <= 0 ? 0 : Math.min(HEAT_LEVELS, Math.ceil((value / Math.max(1, peak)) * HEAT_LEVELS)));

  let column = 0;
  let row = new Date(`${days[0].day}T12:00:00`).getDay();
  const cells = days
    .map((day) => {
      const x = column * (cell + gap);
      const y = row * (cell + gap) + 14;
      const rect = `<rect class="hit lvl-${level(day.reviews)}" x="${x}" y="${y}" width="${cell}" height="${cell}"
        tabindex="0" data-tip="${tipRows(shortDay(day.day), [
          [t('Reviews'), day.reviews],
          day.new ? [t('New'), day.new] : null,
          day.minutes ? [t('Minutes'), day.minutes] : null,
        ])}" aria-label="${esc(`${day.day}: ${day.reviews}`)}"></rect>`;
      row += 1;
      if (row > 6) {
        row = 0;
        column += 1;
      }
      return rect;
    })
    .join('');

  return `<div class="chart-scroll"><svg class="heat" viewBox="0 0 ${width} ${height}"
    style="min-width:${Math.min(width, 760)}px;height:${height}px">${cells}</svg></div>
    <div class="heat-scale">
      <span>${esc(t('Less'))}</span>
      ${Array.from({ length: HEAT_LEVELS + 1 }, (_, index) => `<i style="--c:var(--seq-${index})"></i>`).join('')}
      <span>${esc(t('More'))}</span>
    </div>`;
}

export function meter(value, { color = 'var(--accent)', size = 'sm', label = '' } = {}) {
  const inside = size === 'lg' ? `<span class="meter-label">${esc(label || pct(value))}</span>` : '';
  return `<span class="meter meter-${size}" style="--meter-fill:${color}" role="progressbar"
    aria-valuenow="${Math.round((value || 0) * 100)}" aria-valuemin="0" aria-valuemax="100"
    aria-label="${esc(label || pct(value))}"><i style="width:${pct(value)}">${inside}</i></span>`;
}

export function gradeDots(recent) {
  const color = { 1: 'var(--g1)', 2: 'var(--g2)', 3: 'var(--g3)', 4: 'var(--g4)' };
  return `<span class="week-dots">${recent
    .map((entry) => `<i style="background:${color[entry.rating] || 'var(--line-strong)'}"></i>`)
    .join('')}</span>`;
}

export const skeleton = (height = 180) => `<div class="skeleton" style="height:${height}px"></div>`;

export { reducedMotion, tn };
