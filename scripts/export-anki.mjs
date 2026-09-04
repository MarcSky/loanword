#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { config, loadCards, paths } from './store.mjs';
import { close } from './db.mjs';
import { ensureMigrated } from './migrate.mjs';

const SEP = ';';

function csvField(value) {
  const text = String(value ?? '').replace(/\r?\n/g, ' ').trim();
  return /["\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function tags(card, cfg) {
  const project = (card.project || '').split('/').filter(Boolean).pop();
  return [
    'loanword',

    `lang:${card.target || cfg.target}`,
    card.native ? `from:${card.native}` : null,
    card.cefr ? `cefr:${card.cefr}` : null,
    card.category ? `cat:${card.category}` : null,
    card.type ? `type:${card.type}` : null,
    card.topic ? `topic:${String(card.topic).replace(/\s+/g, '_')}` : null,
    project ? `project:${project.replace(/\s+/g, '_')}` : null,
  ]
    .filter(Boolean)
    .join(' ');
}

export function toCsv(cards, cfg = config()) {
  const rows = [['front', 'back', 'reading', 'example', 'tags'].join(SEP)];
  for (const card of cards) {
    rows.push(
      [
        csvField(card.front),
        csvField(card.back),
        csvField(card.reading),
        csvField(card.example),
        csvField(tags(card, cfg)),
      ].join(SEP),
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
  ensureMigrated();
  const csv = toCsv(loadCards());
  const file = writeCsv(csv);
  console.log(`${csv.split('\n').filter(Boolean).length - 1} cards → ${file}`);
  console.log(`Anki: File → Import, field separator "${SEP}", map front/back/reading/example/tags.`);
  close();
}
