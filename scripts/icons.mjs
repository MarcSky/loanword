#!/usr/bin/env node
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT } from './store-paths.mjs';

export const UI = join(PLUGIN_ROOT, 'ui');
export const SPRITE = join(UI, 'icons.svg');
const ASSETS = join(PLUGIN_ROOT, 'node_modules', '@phosphor-icons', 'core', 'assets');

export const MAP = {
  house: ['house', 'regular'],
  'house-fill': ['house', 'fill'],
  'cards-three': ['cards-three', 'regular'],
  'cards-three-fill': ['cards-three', 'fill'],
  'cards-three-duotone': ['cards-three', 'duotone'],
  'graduation-cap': ['graduation-cap', 'regular'],
  'graduation-cap-fill': ['graduation-cap', 'fill'],
  'graduation-cap-duotone': ['graduation-cap', 'duotone'],
  'chart-bar': ['chart-bar', 'regular'],
  'chart-bar-fill': ['chart-bar', 'fill'],
  'gear-six': ['gear-six', 'regular'],
  'gear-six-fill': ['gear-six', 'fill'],
  'sidebar-simple': ['sidebar-simple', 'regular'],
  list: ['list', 'regular'],
  'terminal-window': ['terminal-window', 'regular'],
  'terminal-window-duotone': ['terminal-window', 'duotone'],
  'git-branch': ['git-branch', 'regular'],
  'users-three': ['users-three', 'regular'],
  quotes: ['quotes', 'regular'],
  'flow-arrow': ['flow-arrow', 'regular'],
  coffee: ['coffee', 'regular'],
  'bell-ringing': ['bell-ringing', 'regular'],
  'bell-ringing-duotone': ['bell-ringing', 'duotone'],
  'check-circle': ['check-circle', 'regular'],
  'check-circle-duotone': ['check-circle', 'duotone'],
  brain: ['brain', 'regular'],
  'brain-duotone': ['brain', 'duotone'],
  'calendar-dots': ['calendar-dots', 'regular'],
  'calendar-dots-duotone': ['calendar-dots', 'duotone'],
  target: ['target', 'regular'],
  'target-duotone': ['target', 'duotone'],
  clock: ['clock', 'regular'],
  'clock-duotone': ['clock', 'duotone'],
  lightning: ['lightning', 'regular'],
  'lightning-fill': ['lightning', 'fill'],
  shuffle: ['shuffle', 'regular'],
  'arrows-clockwise': ['arrows-clockwise', 'regular'],
  'airplane-tilt': ['airplane-tilt', 'regular'],
  'barbell': ['barbell', 'regular'],
  'books': ['books', 'regular'],
  'briefcase': ['briefcase', 'regular'],
  'bug': ['bug', 'regular'],
  'camera': ['camera', 'regular'],
  'car': ['car', 'regular'],
  'chart-line': ['chart-line', 'regular'],
  'church': ['church', 'regular'],
  'clock-counter-clockwise': ['clock-counter-clockwise', 'regular'],
  'cloud-sun': ['cloud-sun', 'regular'],
  'code': ['code', 'regular'],
  'cooking-pot': ['cooking-pot', 'regular'],
  'currency-dollar': ['currency-dollar', 'regular'],
  'database': ['database', 'regular'],
  'dog': ['dog', 'regular'],
  'film-slate': ['film-slate', 'regular'],
  'first-aid-kit': ['first-aid-kit', 'regular'],
  'flask': ['flask', 'regular'],
  'fork-knife': ['fork-knife', 'regular'],
  'game-controller': ['game-controller', 'regular'],
  'gavel': ['gavel', 'regular'],
  'globe': ['globe', 'regular'],
  'handshake': ['handshake', 'regular'],
  'heartbeat': ['heartbeat', 'regular'],
  'house-line': ['house-line', 'regular'],
  'leaf': ['leaf', 'regular'],
  'magnifying-glass-plus': ['magnifying-glass-plus', 'regular'],
  'math-operations': ['math-operations', 'regular'],
  'megaphone': ['megaphone', 'regular'],
  'microphone-stage': ['microphone-stage', 'regular'],
  'music-notes': ['music-notes', 'regular'],
  'newspaper': ['newspaper', 'regular'],
  'package': ['package', 'regular'],
  'paint-brush': ['paint-brush', 'regular'],
  'palette': ['palette', 'regular'],
  'person-simple-run': ['person-simple-run', 'regular'],
  'presentation-chart': ['presentation-chart', 'regular'],
  'rocket-launch': ['rocket-launch', 'regular'],
  'scales': ['scales', 'regular'],
  'shield-check': ['shield-check', 'regular'],
  'shopping-cart': ['shopping-cart', 'regular'],
  't-shirt': ['t-shirt', 'regular'],
  'test-tube': ['test-tube', 'regular'],
  'text-aa': ['text-aa', 'regular'],
  'tree': ['tree', 'regular'],
  'users': ['users', 'regular'],
  'users-four': ['users-four', 'regular'],
  'video-camera': ['video-camera', 'regular'],
  'arrow-u-up-left': ['arrow-u-up-left', 'bold'],
  exam: ['exam', 'regular'],
  'caret-right': ['caret-right', 'regular'],
  'caret-down': ['caret-down', 'regular'],
  'caret-up-down': ['caret-up-down', 'regular'],
  'magnifying-glass': ['magnifying-glass', 'regular'],
  fire: ['fire', 'regular'],
  check: ['check', 'bold'],
  x: ['x', 'bold'],
  trash: ['trash', 'regular'],
  sparkle: ['sparkle', 'regular'],
  keyboard: ['keyboard', 'regular'],
  'download-simple': ['download-simple', 'regular'],
  'arrow-right': ['arrow-right', 'bold'],
  'arrow-left': ['arrow-left', 'bold'],
  'arrow-up-right': ['arrow-up-right', 'bold'],
  'arrow-down-right': ['arrow-down-right', 'bold'],
  play: ['play', 'fill'],
  'arrow-counter-clockwise': ['arrow-counter-clockwise', 'bold'],
  'speaker-high': ['speaker-high', 'regular'],
  sun: ['sun', 'regular'],
  'moon-stars': ['moon-stars', 'regular'],
  monitor: ['monitor', 'regular'],
  translate: ['translate', 'regular'],
  'book-open': ['book-open', 'regular'],
  funnel: ['funnel', 'regular'],
  table: ['table', 'regular'],
  copy: ['copy', 'regular'],
  'arrows-left-right': ['arrows-left-right', 'regular'],
  'pencil-simple': ['pencil-simple', 'regular'],
  'warning-circle': ['warning-circle', 'regular'],
  plus: ['plus', 'bold'],
  minus: ['minus', 'bold'],
  star: ['star', 'regular'],
  'star-fill': ['star', 'fill'],
  eye: ['eye', 'regular'],
  'eye-slash': ['eye-slash', 'regular'],
  key: ['key', 'regular'],
  'squares-four': ['squares-four', 'regular'],
  'stack-duotone': ['stack', 'duotone'],
};

export const SHARED = new Set(['lightning', 'stack-duotone', 'cards-three-duotone', 'brain-duotone', 'terminal-window-duotone', 'caret-down', 'moon-stars']);

const assetPath = (name, weight) =>
  join(ASSETS, weight, weight === 'regular' ? `${name}.svg` : `${name}-${weight}.svg`);

export function symbol(id, [name, weight]) {
  const svg = readFileSync(assetPath(name, weight), 'utf8');
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return `<symbol id="i-${id}" viewBox="0 0 256 256">${inner}</symbol>`;
}

export function render(map = MAP) {
  const ids = Object.keys(map).sort();
  return `<svg xmlns="http://www.w3.org/2000/svg">\n${ids.map((id) => symbol(id, map[id])).join('\n')}\n</svg>\n`;
}

function calls(source) {
  const out = [];
  const open = /\bicon\(/g;
  let match;
  while ((match = open.exec(source))) {
    let depth = 1;
    let index = match.index + match[0].length;
    while (index < source.length && depth) {
      if (source[index] === '(') depth += 1;
      else if (source[index] === ')') depth -= 1;
      index += 1;
    }
    out.push(source.slice(match.index + match[0].length, index - 1));
  }
  return out;
}

export function used(dir = UI) {
  const out = new Set();
  const files = readdirSync(dir).filter((name) => /\.(js|html)$/.test(name));
  for (const name of files) {
    const source = readFileSync(join(dir, name), 'utf8');
    for (const [, id] of source.matchAll(/icons\.svg#i-([\w-]+)/g)) out.add(id);
    for (const [, id] of source.matchAll(/\bicon:\s*'([\w-]+)'/g)) out.add(id);
    for (const call of calls(source)) {
      for (const [, id] of call.matchAll(/(?:^|[(?:])\s*'([\w-]+)'/g)) out.add(id);
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(SPRITE, render());
  console.log(`${Object.keys(MAP).length} symbols → ui/icons.svg`);
}
