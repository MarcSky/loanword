import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DATA = mkdtempSync(join(tmpdir(), 'loanword-speech-'));
process.env.CLAUDE_PLUGIN_DATA = DATA;

const speech = await import('./speech.mjs');

const BIN = join(DATA, 'bin');
mkdirSync(BIN, { recursive: true });

const fakeBinary = (name, body = '#!/bin/sh\ntouch "$3"\n') => {
  const path = join(BIN, name);
  writeFileSync(path, body);
  chmodSync(path, 0o755);
  return path;
};

const withPath = (value) => {
  process.env.PATH = value;
  speech.forgetProviders();
};

const NO_PATH = join(DATA, 'nothing-here');

test('a Piper voice is named for the languages Piper ships one for', () => {
  assert.equal(speech.PIPER_VOICES.ka, 'ka_GE-natia-medium');
  assert.equal(speech.PIPER_VOICES.ru, 'ru_RU-irina-medium');
  assert.equal(speech.PIPER_VOICES.zz, undefined);
});

test('the command to fetch a voice is printed, never run', () => {
  const command = speech.piperCommand('ka');
  assert.match(command, /curl -L -o/);
  assert.match(command, /ka_GE-natia-medium\.onnx/);
  assert.match(command, /^mkdir -p /, 'it makes its own directory first');
  assert.ok(command.includes('huggingface.co/rhasspy/piper-voices'));
  assert.equal(speech.piperCommand('zz'), '', 'no packaged voice, no command to print');
});

test('with nothing on PATH there is no provider and nothing is rendered', async () => {
  withPath(NO_PATH);
  assert.equal(speech.providerFor('ka'), null);
  assert.equal(await speech.render('გამარჯობა', 'ka'), null);
  const status = speech.status(['ka', 'en']);
  assert.equal(status.ka.provider, null);
  assert.equal(status.ka.piperVoice, 'ka_GE-natia-medium');
  assert.equal(status.ka.piperReady, false);
});

test('Piper is preferred, but only once its voice has been downloaded', () => {
  fakeBinary('piper');
  withPath(`${BIN}:${NO_PATH}`);
  assert.equal(speech.providerFor('ka'), null, 'the binary alone is not a voice');

  mkdirSync(speech.piperDir(), { recursive: true });
  writeFileSync(speech.piperModel('ka'), 'not really a model');
  speech.forgetProviders();
  assert.equal(speech.providerFor('ka'), 'piper');
  assert.equal(speech.status(['ka']).ka.piperReady, true);
});

test('eSpeak NG is the last resort, and it answers for anything', () => {
  rmSync(speech.piperModel('ka'), { force: true });
  rmSync(join(BIN, 'piper'), { force: true });
  fakeBinary('espeak-ng');
  withPath(`${BIN}:${NO_PATH}`);
  assert.equal(speech.providerFor('ka'), 'espeak-ng');
  assert.equal(speech.providerFor('hy'), 'espeak-ng', 'even where Piper has no voice at all');
});

test('a rendered phrase is cached, and a changed phrase is a different file', async () => {
  fakeBinary('espeak-ng', '#!/bin/sh\nwhile [ $# -gt 0 ]; do if [ "$1" = "-w" ]; then printf wav > "$2"; fi; shift; done\n');
  withPath(`${BIN}:${NO_PATH}`);

  const first = await speech.render('roll back', 'en');
  assert.ok(first, 'a provider on PATH renders');
  assert.equal(first.cached, false);
  assert.equal(first.provider, 'espeak-ng');

  const second = await speech.render('roll back', 'en');
  assert.equal(second.file, first.file);
  assert.equal(second.cached, true, 'the second request is served from disk');

  const edited = await speech.render('roll back the migration', 'en');
  assert.notEqual(edited.file, first.file, 'editing the card invalidates the audio');
});

test('empty text is never spoken', async () => {
  assert.equal(await speech.render('   ', 'en'), null);
  assert.equal(await speech.render(null, 'en'), null);
});

test('the cache key is per language, so two decks never share a file', () => {
  assert.notEqual(speech.audioFile('mama', 'en'), speech.audioFile('mama', 'ka'));
  assert.equal(speech.audioFile('mama', 'en'), speech.audioFile('mama', 'en-GB'));
});

test('the providers are looked up once, at start-up, never inside a request', () => {
  withPath(NO_PATH);
  assert.equal(speech.warm(['en', 'ka']), true);
  const started = Date.now();
  speech.status(['en', 'ka']);
  speech.status(['en', 'ka']);
  assert.ok(Date.now() - started < 200, 'a warmed lookup never shells out again');
});

test.after(() => {
  rmSync(DATA, { recursive: true, force: true });
});
