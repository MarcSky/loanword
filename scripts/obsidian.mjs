#!/usr/bin/env node
// Obsidian export. A vault is a directory of markdown, and the phone is reached
// by the vault's own sync — so there is no Obsidian plugin here, only a writer.
//
// One note per card plus one index. Notes are rewritten only when their content
// actually changes, so a re-export of an untouched deck touches nothing and the
// user's sync stays quiet.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  CATEGORIES,
  CEFR_LEVELS,
  config,
  deckPairs,
  cardsForPair,
  loadCards,
  log,
  paths,
  readJson,
} from './store.mjs';

const FOLDER = 'Loanword';
const LEARNED_STABILITY_DAYS = 21;
const MAX_TITLE = 80;

const CATEGORY_LABEL = {
  engineering: 'Engineering',
  process: 'Process',
  collaboration: 'Collaboration',
  phrasing: 'Phrasing',
  connectors: 'Connectors',
  everyday: 'Everyday',
};

/** Obsidian refuses these in a note name; Windows refuses a few more. */
function noteName(text, fallback) {
  const clean = String(text)
    .replace(/[[\]#^|\\/:*?"<>]/g, ' ')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, MAX_TITLE)
    .trim();
  return clean || fallback;
}

const pairSlug = (pair) => `${pair.native}-${pair.target}`;

const ymd = (value) => (value ? String(new Date(value).toISOString().slice(0, 10)) : '');

/** YAML needs quoting far more often than it looks; quote everything scalar. */
const yaml = (value) => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

function masteryOf(entry) {
  if (!entry) return 0;
  return Math.max(0, Math.min(1, entry.stability / LEARNED_STABILITY_DAYS));
}

function cardNote(card, entry, pair) {
  const mastery = masteryOf(entry);
  const tags = ['loanword', `loanword/${card.category}`];
  if (card.cefr) tags.push(`loanword/${card.cefr.toLowerCase()}`);

  const front = [
    '---',
    `tags: [${tags.join(', ')}]`,
    `pair: ${yaml(`${pair.native} → ${pair.target}`)}`,
    `category: ${yaml(card.category)}`,
    card.cefr ? `cefr: ${yaml(card.cefr)}` : null,
    `type: ${yaml(card.type)}`,
    card.pos ? `pos: ${yaml(card.pos)}` : null,
    `mastery: ${Math.round(mastery * 100)}`,
    `status: ${yaml(!entry ? 'new' : mastery >= 1 ? 'learned' : 'learning')}`,
    entry ? `due: ${ymd(entry.due)}` : null,
    entry ? `reps: ${entry.reps}` : null,
    entry && entry.lapses ? `lapses: ${entry.lapses}` : null,
    card.project ? `project: ${yaml(card.project)}` : null,
    card.ts ? `captured: ${ymd(card.ts)}` : null,
    '---',
    '',
  ].filter((line) => line !== null);

  const body = [
    `# ${card.front}`,
    '',
    `**${card.back}**`,
    '',
    card.example ? `> ${card.example}` : null,
    card.example ? '' : null,
    card.keywords?.length ? `Keywords: ${card.keywords.map((word) => `\`${word}\``).join(' · ')}` : null,
    card.keywords?.length ? '' : null,
    '---',
    '',
    [
      CATEGORY_LABEL[card.category] || card.category,
      card.cefr,
      card.project ? `needed in \`${card.project}\`` : null,
      card.ts ? ymd(card.ts) : null,
    ]
      .filter(Boolean)
      .join(' · '),
    '',
    `[[${FOLDER}/${FOLDER}|← the deck]]`,
    '',
  ].filter((line) => line !== null);

  return front.concat(body).join('\n');
}

function table(header, rows) {
  if (!rows.length) return '';
  return [
    `| ${header.join(' | ')} |`,
    `|${header.map(() => '---').join('|')}|`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
    '',
  ].join('\n');
}

function indexNote(decks, state) {
  const now = new Date();
  const lines = [
    '---',
    'tags: [loanword]',
    `updated: ${ymd(now)}`,
    '---',
    '',
    '# Loanword',
    '',
    'Words you actually needed at work. Written by `/loanword:build`; grade them',
    'in the trainer on your machine — this vault is the read-only view.',
    '',
  ];

  for (const deck of decks) {
    const { pair, cards } = deck;
    const seen = cards.filter((card) => state[card.id]);
    const learned = seen.filter((card) => masteryOf(state[card.id]) >= 1);
    const due = cards.filter((card) => state[card.id] && new Date(state[card.id].due) <= now);
    const slug = pairSlug(pair);

    lines.push(`## ${pair.native} → ${pair.target}`, '');
    lines.push(
      `${cards.length} cards · ${learned.length} learned · ${seen.length - learned.length} still settling · ` +
        `${cards.length - seen.length} never seen`,
      '',
    );

    const byCategory = CATEGORIES.map((key) => {
      const owned = cards.filter((card) => card.category === key);
      if (!owned.length) return null;
      const share = owned.reduce((sum, card) => sum + masteryOf(state[card.id]), 0) / owned.length;
      return [
        CATEGORY_LABEL[key] || key,
        String(owned.length),
        `${Math.round(share * 100)}%`,
        `#loanword/${key}`,
      ];
    }).filter(Boolean);
    lines.push(table(['Domain', 'Cards', 'Mastery', 'Tag'], byCategory));

    const byLevel = CEFR_LEVELS.map((level) => {
      const owned = cards.filter((card) => card.cefr === level);
      return owned.length ? [level, String(owned.length), `#loanword/${level.toLowerCase()}`] : null;
    }).filter(Boolean);
    if (byLevel.length) lines.push(table(['Level', 'Cards', 'Tag'], byLevel));

    if (due.length) {
      lines.push(`### Due now — ${due.length}`, '');
      for (const card of due.slice(0, 50)) {
        lines.push(`- [[${FOLDER}/${slug}/${noteName(card.front, card.id)}|${card.front}]] — ${card.back}`);
      }
      if (due.length > 50) lines.push(`- …and ${due.length - 50} more`);
      lines.push('');
    }

    const hardest = seen
      .filter((card) => state[card.id].lapses)
      .sort((a, b) => state[b.id].lapses - state[a.id].lapses)
      .slice(0, 5);
    if (hardest.length) {
      lines.push('### Hardest', '');
      for (const card of hardest) {
        lines.push(
          `- [[${FOLDER}/${slug}/${noteName(card.front, card.id)}|${card.front}]] — ` +
            `${card.back} (${state[card.id].lapses} lapses)`,
        );
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

/** Writes only when the bytes differ, so an unchanged deck causes no sync traffic. */
function writeIfChanged(file, content) {
  try {
    if (readFileSync(file, 'utf8') === content) return false;
  } catch {
    // not there yet
  }
  writeFileSync(file, content);
  return true;
}

export function exportToVault(vault = config().vault) {
  if (!vault) throw new Error('no vault configured');

  const root = resolve(vault);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`vault not found: ${root}`);
  }

  const base = join(root, FOLDER);
  mkdirSync(base, { recursive: true });

  const state = readJson(paths.state, {});
  const deleted = new Set(Array.isArray(state?._meta?.deleted) ? state._meta.deleted : []);
  const all = loadCards().filter((card) => !deleted.has(card.id));

  const decks = deckPairs(all)
    .map((pair) => ({ pair, cards: cardsForPair(pair, all) }))
    .filter((deck) => deck.cards.length)
    .sort((a, b) => b.cards.length - a.cards.length);

  let written = 0;
  let removed = 0;

  for (const { pair, cards } of decks) {
    const dir = join(base, pairSlug(pair));
    mkdirSync(dir, { recursive: true });

    const wanted = new Set();
    for (const card of cards) {
      const name = `${noteName(card.front, card.id)}.md`;
      wanted.add(name);
      if (writeIfChanged(join(dir, name), cardNote(card, state[card.id], pair))) written++;
    }

    // A card thrown away in the trainer should not linger on the phone. Scoped
    // to this directory and to .md, so nothing the user put here is at risk.
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith('.md') || wanted.has(entry)) continue;
      rmSync(join(dir, entry));
      removed++;
    }
  }

  if (writeIfChanged(join(base, `${FOLDER}.md`), indexNote(decks, state))) written++;

  const result = { vault: root, folder: base, decks: decks.length, cards: all.length, written, removed };
  log(`obsidian export ${JSON.stringify(result)}`);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const vault = process.argv[2] || config().vault;
  if (!vault) {
    console.error(
      'No vault configured. Set it in the trainer under Settings → Your data,\n' +
        'or pass one: node scripts/obsidian.mjs /path/to/Vault',
    );
    process.exit(1);
  }
  try {
    const out = exportToVault(vault);
    console.log(
      `${out.cards} cards in ${out.decks} deck(s) → ${out.folder}\n` +
        `${out.written} note(s) written, ${out.removed} removed. ` +
        'Open the vault on your phone; your usual sync carries it there.',
    );
  } catch (error) {
    console.error(String(error.message || error));
    process.exit(1);
  }
}
