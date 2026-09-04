#!/usr/bin/env node


import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT, readJson } from './store.mjs';
import { CATEGORY, FIELDS } from './categories.mjs';

const UI = join(PLUGIN_ROOT, 'ui');
const I18N_DIR = join(UI, 'i18n');

const CATEGORY_LABELS = Object.values(CATEGORY).map((entry) => entry.label);
const FIELD_LABELS = FIELDS.map(([, label]) => label);

const INDIRECT = [
  ...CATEGORY_LABELS,
  ...FIELD_LABELS,
  'Engineering', 'Process', 'Collaboration', 'Phrasing', 'Connectors', 'Everyday',
  'list', 'grid', 'List', 'Cards', 'Chapters',
  'Code, systems, debugging, review', 'Plans, estimates, releases, specs',
  'Meetings, feedback, asking, disagreeing', 'Set phrases and idioms that resist translation',
  'However, in terms of, that said, provided that', 'General vocabulary and everything unplaced',
  'Breakthrough', 'Waystage', 'Threshold', 'Vantage', 'Advanced', 'Mastery',
  'Overview', 'Deck', 'Study', 'Settings', 'Flashcards', 'Learn', 'Practice', 'Test', 'Learn mode',
  'True or false', 'Multiple choice', 'Matching', 'Written', 'Term', 'Definition', 'Both',
  'Again', 'Hard', 'Good', 'Easy', 'no idea', 'barely', 'got it', 'instant',
  'Everything', 'Favourites', 'Due now', 'Never seen', 'Learned',
  'active', 'passive', 'both', 'light', 'dark', 'system',
  'leave', 'next card', 'pick an answer', 'again', 'hard', 'good', 'easy', 'junk',
  'show the answer', 'check your answer',
  'Analytics', 'Cloze', 'Type it', 'Reverse',
  '7 days', '30 days', '90 days', 'All time',
  'Recall on your own and grade yourself against FSRS.',
  'Four candidates from the same domain; the click is graded for you.',
  'The example sentence with the word taken out.',
  'Write the word from the meaning — one typo forgiven in a long word.',
  'From your language to the one you are learning.',
  'Reviews', 'New', 'Learned', 'In review', 'Learning', 'Relearning', 'Not started',
  'Not worth learning', 'I already know it', 'Too rare to bother', 'The translation is wrong',
  'Off', 'One line', 'Weave my weakest words in',
  'Haiku · fast', 'Sonnet · careful', 'Opus · slowest',
  'On reveal', 'Also at the start of Type it',
  'The ones slipping away', 'My starred words', 'Starred first, then slipping',
  'got it', 'say it',
  'Starred', 'Slipping away', 'Fought back', 'Never seen',
  'Good morning', 'Good afternoon', 'Good evening',
];

const PLACEHOLDER = /\{(\w+)\}/g;

const uiSources = () =>
  readdirSync(UI)
    .filter((name) => name.endsWith('.js'))
    .sort()
    .map((name) => readFileSync(join(UI, name), 'utf8'))
    .join('\n');

export function keys(source = uiSources()) {
  const found = new Set(INDIRECT);
  for (const [, text] of source.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) {
    found.add(text.replace(/\\'/g, "'").replace(/\\u2019/g, '’'));
  }

  for (const [, one, many] of source.matchAll(/\btn\([^,]+,\s*'([^']+)',\s*'([^']+)'\s*\)/g)) {
    found.add(`${one}|${many}`);
  }
  return [...found].sort();
}

export const languages = () =>
  existsSync(I18N_DIR)
    ? readdirSync(I18N_DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()
    : [];

export function audit(lang, all = keys()) {
  const dict = readJson(join(I18N_DIR, `${lang}.json`), null);
  if (!dict || typeof dict !== 'object' || Array.isArray(dict)) return { lang, readable: false };

  const wanted = new Set(all);
  const broken = [];
  for (const [key, value] of Object.entries(dict)) {
    if (!wanted.has(key)) continue;
    if (key.includes('|')) {
      if (!value || typeof value !== 'object') broken.push(key);
      continue;
    }
    if (typeof value !== 'string') {
      broken.push(key);
      continue;
    }

    const want = (key.match(PLACEHOLDER) || []).sort().join();
    const got = (value.match(PLACEHOLDER) || []).sort().join();
    if (want !== got) broken.push(key);
  }

  return {
    lang,
    readable: true,
    missing: all.filter((key) => !(key in dict)),
    unused: Object.keys(dict).filter((key) => !wanted.has(key)).sort(),
    broken,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [command, lang] = process.argv.slice(2);

  if (command === 'keys') {
    console.log(JSON.stringify(keys(), null, 2));
  } else if (command === 'audit') {
    const all = keys();
    const targets = lang ? [lang] : languages();
    if (!targets.length) console.log('no dictionaries in ui/i18n/');
    let bad = 0;
    for (const code of targets) {
      const report = audit(code, all);
      if (!report.readable) {
        console.log(`${code}: unreadable`);
        bad++;
        continue;
      }
      const problems = report.missing.length + report.unused.length + report.broken.length;
      if (problems) bad++;
      console.log(
        `${code}: ${all.length - report.missing.length}/${all.length} translated` +
          (report.missing.length ? `, ${report.missing.length} missing` : '') +
          (report.unused.length ? `, ${report.unused.length} unused` : '') +
          (report.broken.length ? `, ${report.broken.length} broken` : ''),
      );
      for (const key of report.missing) console.log(`  missing  ${key}`);
      for (const key of report.unused) console.log(`  unused   ${key}`);
      for (const key of report.broken) console.log(`  broken   ${key}`);
    }
    process.exit(bad ? 1 : 0);
  } else {
    console.log(`usage:
  node scripts/i18n.mjs keys           every string the interface can render
  node scripts/i18n.mjs audit [lang]   what a dictionary is missing or has broken

Dictionaries live in ui/i18n/<code>.json, keyed by the English sentence.
Present: ${languages().join(', ') || '(none)'}`);
  }
}
