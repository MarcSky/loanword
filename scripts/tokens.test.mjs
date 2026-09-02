import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT } from './store-paths.mjs';
import { CSS_FILE, build, readTokens, stored } from './tokens.mjs';

const tokens = readTokens();
const css = readFileSync(CSS_FILE, 'utf8');

const CATEGORY_TINTS = ['sky', 'peach', 'rose', 'lavender', 'butter', 'mint'];

function srgb(channel) {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const clean = hex.trim().replace('#', '');
  const full = clean.length === 3 ? [...clean].map((c) => c + c).join('') : clean;
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16));
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
}

function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const at = (theme, name) => tokens[theme][name];

test('the contrast helper agrees with the known extremes', () => {
  assert.equal(Math.round(contrast('#ffffff', '#000000')), 21);
  assert.equal(Math.round(contrast('#ffffff', '#ffffff')), 1);
});

test('both themes are declared and carry the same core tokens', () => {
  assert.ok(Object.keys(tokens.light).length > 60);
  const core = ['canvas', 'panel', 'sunk', 'ink', 'ink-2', 'ink-3', 'line', 'accent', 'accent-text', 'accent-tint', 'accent-soft', 'selected', 'selected-ink', 'selected-ink-2'];
  for (const name of core) {
    assert.ok(at('light', name), `light is missing --${name}`);
    assert.ok(at('dark', name), `dark is missing --${name}`);
  }
});

test('body text clears 4.5:1 on its own surface, in both themes', () => {
  for (const theme of ['light', 'dark']) {
    for (const ink of ['ink', 'ink-2', 'ink-3']) {
      const ratio = contrast(at(theme, ink), at(theme, 'panel'));
      assert.ok(ratio >= 4.5, `${theme} --${ink} on --panel is ${ratio.toFixed(2)}:1`);
    }
  }
});

test('every domain tint reads with its own ink at 4.5:1', () => {
  for (const theme of ['light', 'dark']) {
    for (const tint of CATEGORY_TINTS) {
      const ratio = contrast(at(theme, `${tint}-ink`), at(theme, tint));
      assert.ok(ratio >= 4.5, `${theme} --${tint}-ink on --${tint} is ${ratio.toFixed(2)}:1`);
    }
  }
});

test('every grade surface reads with its own ink at 4.5:1', () => {
  for (const theme of ['light', 'dark']) {
    for (const grade of ['again', 'hard', 'good', 'easy']) {
      const ratio = contrast(at(theme, `grade-${grade}-ink`), at(theme, `grade-${grade}`));
      assert.ok(ratio >= 4.5, `${theme} grade-${grade} is ${ratio.toFixed(2)}:1`);
    }
  }
});

test('the selected state reads at 4.5:1 in both themes', () => {
  for (const theme of ['light', 'dark']) {
    const ratio = contrast(at(theme, 'selected-ink'), at(theme, 'selected'));
    assert.ok(ratio >= 4.5, `${theme} selected is ${ratio.toFixed(2)}:1`);
  }
});

test('the accent clears 3:1 as a UI edge and 4.5:1 under its own ink, in both themes', () => {
  for (const theme of ['light', 'dark']) {
    const edge = contrast(at(theme, 'accent'), at(theme, 'panel'));
    assert.ok(edge >= 3, `${theme} accent against panel is ${edge.toFixed(2)}:1`);
    for (const fill of ['accent', 'accent-strong']) {
      const onFill = contrast(at(theme, 'accent-ink'), at(theme, fill));
      assert.ok(onFill >= 4.5, `${theme} accent-ink on ${fill} is ${onFill.toFixed(2)}:1`);
    }
    const asText = contrast(at(theme, 'accent-text'), at(theme, 'panel'));
    assert.ok(asText >= 4.5, `${theme} accent-text on panel is ${asText.toFixed(2)}:1`);
    const onSoft = contrast(at(theme, 'accent-text'), at(theme, 'accent-soft'));
    assert.ok(onSoft >= 4.5, `${theme} accent-text on accent-soft is ${onSoft.toFixed(2)}:1`);
    const secondary = contrast(at(theme, 'selected-ink-2'), at(theme, 'selected'));
    assert.ok(secondary >= 4.5, `${theme} selected-ink-2 on selected is ${secondary.toFixed(2)}:1`);
  }
});

test('blue text on the panel goes through --accent-text, never the fill colour', () => {
  assert.ok(!/(?<![-\w])color:\s*var\(--accent\)\s*;/.test(css), 'use --accent-text for text; --accent is a fill');
});

test('every Web Awesome property is mapped to a token, never to a literal', () => {
  const literals = [...css.matchAll(/--wa-[\w-]+:\s*([^;]+);/g)].filter(([, value]) => !/^var\(--/.test(value.trim()));
  assert.deepEqual(literals.map(([line]) => line), []);
});

test('status colours read on their own soft backgrounds and on the panel', () => {
  for (const theme of ['light', 'dark']) {
    for (const status of ['ok', 'warn', 'danger']) {
      const onSoft = contrast(at(theme, status), at(theme, `${status}-soft`));
      assert.ok(onSoft >= 4.5, `${theme} --${status} on --${status}-soft is ${onSoft.toFixed(2)}:1`);
      const onPanel = contrast(at(theme, status), at(theme, 'panel'));
      assert.ok(onPanel >= 4.5, `${theme} --${status} on --panel is ${onPanel.toFixed(2)}:1`);
    }
  }
});

test('the sequential scale really is a scale', () => {
  for (const theme of ['light', 'dark']) {
    const steps = [0, 1, 2, 3, 4, 5].map((index) => luminance(at(theme, `seq-${index}`)));
    const ordered = theme === 'light' ? [...steps].sort((a, b) => b - a) : [...steps].sort((a, b) => a - b);
    assert.deepEqual(steps, ordered, `${theme} --seq-* does not run in one direction`);
  }
});

test('the four grade hues are identical in both themes', () => {
  for (const name of ['g1', 'g2', 'g3', 'g4']) {
    assert.equal(at('dark', name), undefined, `--${name} must not be re-declared in dark`);
    assert.ok(at('light', name), `--${name} is missing`);
  }
});

test('the grade hues are distinguishable from each other', () => {
  const hues = ['g1', 'g2', 'g3', 'g4'].map((name) => at('light', name));
  for (let i = 0; i < hues.length; i++) {
    for (let j = i + 1; j < hues.length; j++) {
      assert.notEqual(hues[i], hues[j]);
    }
  }
});

test('every domain has a chart hue', () => {
  for (const domain of ['engineering', 'process', 'collaboration', 'phrasing', 'connectors', 'everyday']) {
    assert.ok(at('light', `c-${domain}`), `--c-${domain} is missing`);
  }
});

test('the motion scale is four durations and one curve', () => {
  assert.equal(at('light', 't-fast'), '120ms');
  assert.equal(at('light', 't-base'), '200ms');
  assert.equal(at('light', 't-slow'), '360ms');
  assert.equal(at('light', 't-count'), '600ms');
  assert.match(at('light', 'ease'), /^cubic-bezier/);
});

test('reduced motion is honoured in the stylesheet', () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('the stylesheet fetches nothing from the network', () => {
  const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((match) => match[1].replace(/['"]/g, ''));
  for (const url of urls) {
    assert.ok(!/^https?:|^\/\//.test(url), `app.css reaches out to ${url}`);
  }
});

test('the interface markup fetches nothing from the network', () => {
  for (const name of ['index.html', 'app.js', 'core.js', 'charts.js', 'study.js', 'analytics.js', 'deck.js', 'overview.js', 'settings.js']) {
    const source = readFileSync(join(PLUGIN_ROOT, 'ui', name), 'utf8');
    const external = [...source.matchAll(/(?:src|href)=["'](https?:\/\/[^"']+)/g)].map((match) => match[1]);
    for (const url of external) {
      assert.ok(
        url.startsWith('https://x.com') || url.startsWith('https://github.com'),
        `${name} loads ${url}`,
      );
    }
    assert.ok(!/\bfetch\(\s*['"`]https?:/.test(source), `${name} fetches an absolute URL`);
  }
});

test('the published tokens file is in step with the stylesheet', () => {
  const before = stored();
  assert.ok(before, 'docs/design/tokens.json has not been generated');
  assert.deepEqual(before.themes, tokens, 'run `node scripts/tokens.mjs` after changing app.css');
  const rebuilt = build();
  assert.deepEqual(rebuilt.themes, tokens);
});
