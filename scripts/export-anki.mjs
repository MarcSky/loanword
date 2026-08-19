#!/usr/bin/env node
// Anki export. ponytail: .apkg is SQLite+zip and needs a schema clone — v0.2.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { config, loadCards, paths, readJson } from './store.mjs';

const SEP = ';';

function csvField(value) {
  const text = String(value ?? '').replace(/\r?\n/g, ' ').trim();
  return /["\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function tags(card, cfg) {
  const project = (card.project || '').split('/').filter(Boolean).pop();
  return [
    'loanword',
    // The card's own pair, not the one currently open — an export spans decks.
    `lang:${card.target || cfg.target}`,
    card.native ? `from:${card.native}` : null,
    card.cefr ? `cefr:${card.cefr}` : null,
    card.category ? `cat:${card.category}` : null,
    card.type ? `type:${card.type}` : null,
    project ? `project:${project.replace(/\s+/g, '_')}` : null,
  ]
    .filter(Boolean)
    .join(' ');
}

export function toCsv(cards, state = {}, cfg = config()) {
  const deleted = new Set(state?._meta?.deleted || []);
  const rows = [['front', 'back', 'example', 'tags'].join(SEP)];
  for (const card of cards) {
    if (deleted.has(card.id)) continue;
    rows.push(
      [csvField(card.front), csvField(card.back), csvField(card.example), csvField(tags(card, cfg))].join(SEP),
    );
  }
  return rows.join('\n') + '\n';
}

export function writeCsv(csv, file = paths.exportCsv) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, csv);
  return file;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const csv = toCsv(loadCards(), readJson(paths.state, {}));
  const file = writeCsv(csv);
  console.log(`${csv.split('\n').filter(Boolean).length - 1} cards → ${file}`);
  console.log(`Anki: File → Import, field separator "${SEP}", map front/back/example/tags.`);
}
