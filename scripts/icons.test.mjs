import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATEGORY } from './categories.mjs';
import { MAP, SHARED, SPRITE, render, used } from './icons.mjs';

const sprite = readFileSync(SPRITE, 'utf8');

test('every icon the interface names is in the map', () => {
  const missing = [...used()].filter((id) => !MAP[id]).sort();
  assert.deepEqual(missing, [], 'add the icon to MAP in scripts/icons.mjs and run npm run icons');
});

test('the map holds nothing the interface or the landing page does not use', () => {
  const dynamic = new Set([
    'house-fill',
    'cards-three-fill',
    'graduation-cap-fill',
    'chart-bar-fill',
    'gear-six-fill',
    ...Object.values(CATEGORY).map((entry) => entry.icon),
  ]);
  const live = used();
  const dead = Object.keys(MAP).filter(
    (id) => !live.has(id) && !dynamic.has(id) && !SHARED.has(id) && !live.has(id.replace(/-(fill|duotone)$/, '')),
  );
  assert.deepEqual(dead, [], 'remove unused icons from MAP');
});

test('the sprite on disk is exactly what the generator renders', () => {
  assert.equal(sprite, render(), 'run npm run icons');
});

test('every symbol is on the Phosphor 256 grid and fetches nothing', () => {
  const symbols = [...sprite.matchAll(/<symbol id="i-([\w-]+)" viewBox="([^"]+)">/g)];
  assert.equal(symbols.length, Object.keys(MAP).length);
  for (const [, , box] of symbols) assert.equal(box, '0 0 256 256');
  assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(sprite));
});

test('duotone symbols carry their translucent layer', () => {
  for (const [id, [, weight]] of Object.entries(MAP)) {
    if (weight !== 'duotone') continue;
    const start = sprite.indexOf(`id="i-${id}"`);
    const end = sprite.indexOf('</symbol>', start);
    assert.match(sprite.slice(start, end), /opacity="0\.2"/, `${id} lost its duotone layer`);
  }
});
