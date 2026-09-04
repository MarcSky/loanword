import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { PLUGIN_ROOT } from './store-paths.mjs';

const CYRILLIC = /[Ѐ-ӿ]/;

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'i18n', 'fonts', 'backup', 'freq', 'vendor']);
const SKIP_FILES = new Set(['GeneralSans-FFL.txt', 'PHOSPHOR-LICENSE.txt']);
const TEXT = new Set(['.md', '.txt', '.sql']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (TEXT.has(extname(name)) && !SKIP_FILES.has(name)) out.push(path);
  }
  return out;
}

const files = walk(PLUGIN_ROOT).map((path) => relative(PLUGIN_ROOT, path));

test('the repository actually has documentation to check', () => {
  assert.ok(files.length > 5, `only found ${files.length} text files`);
  for (const wanted of ['README.md', 'CONTRIBUTING.md']) {
    assert.ok(files.includes(wanted), `${wanted} is missing`);
  }
});

test('every document is written in English', () => {
  const offenders = [];
  for (const file of files) {
    const source = readFileSync(join(PLUGIN_ROOT, file), 'utf8');
    const lines = source.split('\n');
    const first = lines.findIndex((line) => CYRILLIC.test(line));
    if (first >= 0) offenders.push(`${file}:${first + 1} ${lines[first].trim().slice(0, 70)}`);
  }
  assert.deepEqual(
    offenders,
    [],
    `documentation is English only; the trainer's own translations live in ui/i18n/, which this check skips`,
  );
});

test('the stop-lists are data, and every picker language has one', async () => {
  const { LANGUAGES } = await import('./languages.mjs');
  const { scriptPattern } = await import('./lang.mjs');
  const offenders = [];
  for (const { code, script } of LANGUAGES) {
    const file = join(PLUGIN_ROOT, 'data', 'freq', `${code}.txt`);
    assert.ok(existsSync(file), `${code} is in the picker with no stop-list`);
    const words = readFileSync(file, 'utf8').split('\n').filter(Boolean);
    assert.ok(words.length >= 300, `${code} has only ${words.length} entries`);
    const pattern = scriptPattern(script);
    const stray = words.filter(
      (word) => /\p{L}/u.test(word) && ![...word].some((letter) => pattern.test(letter)),
    );
    if (stray.length) offenders.push(`${code}: ${stray.slice(0, 5).join(' ')}`);
  }
  assert.deepEqual(offenders, [], 'a stop-list holds only words written in its own script');
  assert.ok(existsSync(join(PLUGIN_ROOT, 'data', 'freq', 'README.md')), 'and says where it came from');
});

test('the interface translations are exempt, and still present', () => {
  const dictionary = join(PLUGIN_ROOT, 'ui', 'i18n', 'ru.json');
  assert.ok(existsSync(dictionary), 'the Russian interface dictionary is a product feature and must stay');
  assert.ok(CYRILLIC.test(readFileSync(dictionary, 'utf8')));
});

test('no source file carries a comment', () => {
  const code = [];
  walkCode(join(PLUGIN_ROOT, 'scripts'), code);
  walkCode(join(PLUGIN_ROOT, 'ui'), code);

  const offenders = [];
  for (const path of code) {
    const source = readFileSync(path, 'utf8');
    const lines = source.split('\n');
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index].trim();
      if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('*/')) {
        if (index === 0 && line.startsWith('#!')) continue;
        offenders.push(`${relative(PLUGIN_ROOT, path)}:${index + 1}`);
        break;
      }
    }
  }
  assert.deepEqual(offenders, [], 'the code carries tests instead of comments');
});

function walkCode(dir, out) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walkCode(path, out);
    else if (/\.(mjs|js)$/.test(name)) out.push(path);
  }
  return out;
}

const EXPORTED = /^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;
const EXPORT_LIST = /^export\s*\{([^}]*)\}/gm;
const IDENTIFIER = /[A-Za-z_$][\w$]*/g;

function exportsOf(source) {
  const names = new Set();
  for (const [, name] of source.matchAll(EXPORTED)) names.add(name);
  for (const [, list] of source.matchAll(EXPORT_LIST)) {
    for (const part of list.split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    }
  }
  return names;
}

test('nothing is exported that nothing else uses', () => {
  const sources = new Map();
  for (const path of [...walkCode(join(PLUGIN_ROOT, 'scripts'), []), ...walkCode(join(PLUGIN_ROOT, 'ui'), [])]) {
    sources.set(relative(PLUGIN_ROOT, path), readFileSync(path, 'utf8'));
  }

  const words = new Map();
  for (const [path, source] of sources) words.set(path, new Set(source.match(IDENTIFIER) || []));

  const dead = [];
  for (const [path, source] of sources) {
    for (const name of exportsOf(source)) {
      const used = [...words].some(([other, tokens]) => other !== path && tokens.has(name));
      if (!used) dead.push(`${path}: ${name}`);
    }
  }
  assert.deepEqual(dead.sort(), [], 'drop the export keyword, or the code with it');
});

test('every module has its test file beside it, and every test a module', () => {
  const modules = readdirSync(join(PLUGIN_ROOT, 'scripts'));
  const orphans = modules
    .filter((name) => name.endsWith('.mjs') && !name.endsWith('.test.mjs'))
    .filter((name) => !modules.includes(name.replace('.mjs', '.test.mjs')));
  assert.deepEqual(orphans, [], 'new behaviour arrives with its test');

  const strays = modules
    .filter((name) => name.endsWith('.test.mjs'))
    .filter((name) => !['api', 'docs', 'perf', 'pipeline', 'screens'].includes(name.replace('.test.mjs', '')))
    .filter((name) => !modules.includes(name.replace('.test.mjs', '.mjs')));
  assert.deepEqual(strays, [], 'a test whose module is gone tests nothing');
});

test('the plugin manifest and the package agree on what this is', () => {
  const pkg = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'package.json'), 'utf8'));
  const manifest = JSON.parse(readFileSync(join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.equal(manifest.version, pkg.version);
  assert.match(pkg.engines.node, /^>=22\./);
  assert.deepEqual(Object.keys(pkg.dependencies), ['ts-fsrs'], 'exactly one dependency');
});

test('the commands the README documents all exist', () => {
  const pkg = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'package.json'), 'utf8'));
  for (const script of ['test', 'test:perf', 'i18n', 'tokens']) {
    assert.ok(pkg.scripts[script], `npm run ${script} is documented but not defined`);
  }
  const readme = readFileSync(join(PLUGIN_ROOT, 'README.md'), 'utf8');
  for (const script of ['npm test', 'npm run test:perf', 'npm run i18n', 'npm run tokens']) {
    assert.ok(readme.includes(script), `${script} is defined but never documented`);
  }
});

test('git is not about to swallow the build output or a deck', () => {
  const ignored = execFileSync('git', ['check-ignore', '.scratch/x', 'loanword.db'], {
    cwd: PLUGIN_ROOT,
    encoding: 'utf8',
  })
    .trim()
    .split('\n');
  assert.equal(ignored.length, 2, 'scratch notes and a deck must both be ignored');
});
