#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { DATA, paths } from './store-paths.mjs';
import { MAX_CHARS } from './limits.mjs';
import { codeOf } from './languages.mjs';

export const PIPER_VOICES = {
  en: 'en_US-lessac-medium',
  es: 'es_ES-davefx-medium',
  pt: 'pt_BR-faber-medium',
  fr: 'fr_FR-siwis-medium',
  de: 'de_DE-thorsten-medium',
  it: 'it_IT-riccardo-x_low',
  nl: 'nl_NL-mls-medium',
  pl: 'pl_PL-darkman-medium',
  ru: 'ru_RU-irina-medium',
  uk: 'uk_UA-ukrainian_tts-medium',
  cs: 'cs_CZ-jirka-medium',
  sv: 'sv_SE-nst-medium',
  no: 'no_NO-talesyntese-medium',
  da: 'da_DK-talesyntese-medium',
  fi: 'fi_FI-harri-medium',
  tr: 'tr_TR-dfki-medium',
  el: 'el_GR-rapunzelina-low',
  ar: 'ar_JO-kareem-medium',
  fa: 'fa_IR-amir-medium',
  hi: 'hi_IN-pratham-medium',
  ka: 'ka_GE-natia-medium',
  ro: 'ro_RO-mihai-medium',
  hu: 'hu_HU-anna-medium',
  vi: 'vi_VN-vais1000-medium',
  zh: 'zh_CN-huayan-medium',
};

const PIPER_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main';

export const piperDir = () => join(DATA, 'piper');

export const piperModel = (lang) => {
  const voice = PIPER_VOICES[codeOf(lang)];
  return voice ? join(piperDir(), `${voice}.onnx`) : '';
};

export function piperCommand(lang) {
  const voice = PIPER_VOICES[codeOf(lang)];
  if (!voice) return '';
  const [locale] = voice.split('-');
  const [language] = locale.split('_');
  const path = `${language}/${locale}/${voice.split('-').slice(1, 2)}/${voice.split('-').slice(2).join('-')}`;
  const url = `${PIPER_BASE}/${path}/${voice}.onnx`;
  return [
    `mkdir -p ${piperDir()}`,
    `curl -L -o ${join(piperDir(), `${voice}.onnx`)} ${url}`,
    `curl -L -o ${join(piperDir(), `${voice}.onnx.json`)} ${url}.json`,
  ].join(' && ');
}

let pathCache = null;
function onPath(binary, env = process.env) {
  if (!pathCache) pathCache = new Map();
  const key = `${binary}`;
  if (pathCache.has(key)) return pathCache.get(key);
  const dirs = String(env.PATH || '').split(delimiter).filter(Boolean);
  let found = '';
  for (const dir of dirs) {
    const candidate = join(dir, binary);
    try {
      if (statSync(candidate).isFile()) {
        found = candidate;
        break;
      }
    } catch {
    }
  }
  pathCache.set(key, found);
  return found;
}

export const forgetProviders = () => {
  pathCache = null;
  voiceCache = null;
};

let voiceCache = null;
function macVoices() {
  if (voiceCache) return voiceCache;
  voiceCache = [];
  if (process.platform !== 'darwin' || !onPath('say')) return voiceCache;
  const listed = spawnSync('say', ['-v', '?'], { encoding: 'utf8', timeout: 5000 });
  for (const line of String(listed.stdout || '').split('\n')) {
    const match = line.match(/^(.+?)\s{2,}([a-z]{2})[-_]([A-Za-z]{2,})/);
    if (match) voiceCache.push({ name: match[1].trim(), lang: match[2].toLowerCase() });
  }
  return voiceCache;
}

const sayVoiceFor = (lang) => macVoices().find((voice) => voice.lang === codeOf(lang))?.name || '';

export function providerFor(lang) {
  const code = codeOf(lang);
  if (onPath('piper') && existsSync(piperModel(code))) return 'piper';
  if (sayVoiceFor(code)) return 'say';
  if (onPath('espeak-ng')) return 'espeak-ng';
  return null;
}

export const ipaAvailable = () => !!onPath('espeak-ng');

const IPA_TIMEOUT_MS = 5_000;

function readProvider(command, args, input, timeout = IPA_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'ignore'] });
    let out = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve('');
    }, timeout);
    child.stdout.on('data', (chunk) => (out += chunk));
    child.on('error', () => {
      clearTimeout(timer);
      resolve('');
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? out : '');
    });
    child.stdin.end(input);
  });
}

export async function ipaOf(text, lang) {
  const clean = String(text || '').trim().slice(0, MAX_TEXT);
  if (!clean || !ipaAvailable()) return '';
  const out = await readProvider('espeak-ng', ['-q', '--ipa', '-v', codeOf(lang), '--stdin'], clean);
  return out.replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS.ipa);
}

export function warm(targets = []) {
  onPath('piper');
  onPath('espeak-ng');
  macVoices();
  for (const target of targets) providerFor(target);
  return true;
}

export function status(targets) {
  const out = {};
  for (const target of targets) {
    const provider = providerFor(target);
    out[target] = {
      provider,
      piperVoice: PIPER_VOICES[codeOf(target)] || '',
      piperReady: !!piperModel(target) && existsSync(piperModel(target)),
    };
  }
  return out;
}

export const audioFile = (text, lang) =>
  join(paths.audio, `${codeOf(lang)}-${createHash('sha1').update(String(text)).digest('hex').slice(0, 16)}.wav`);

const MAX_TEXT = 400;
const RENDER_TIMEOUT_MS = 20_000;

function runProvider(command, args, input, timeout = RENDER_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['pipe', 'ignore', 'pipe'] });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve(false);
    }, timeout);
    child.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
    if (input === null) child.stdin.end();
    else child.stdin.end(input);
  });
}

export async function render(text, lang) {
  const clean = String(text || '').trim().slice(0, MAX_TEXT);
  if (!clean) return null;
  const provider = providerFor(lang);
  if (!provider) return null;

  const out = audioFile(clean, lang);
  if (existsSync(out) && statSync(out).size > 0) return { file: out, provider, cached: true };
  mkdirSync(paths.audio, { recursive: true });

  let ok = false;
  if (provider === 'piper') {
    ok = await runProvider('piper', ['--model', piperModel(lang), '--output_file', out], clean);
  } else if (provider === 'say') {
    ok = await runProvider(
      'say',
      ['-v', sayVoiceFor(lang), '--file-format=WAVE', '--data-format=LEI16@22050', '-o', out, clean],
      null,
    );
  } else {
    ok = await runProvider('espeak-ng', ['-v', codeOf(lang), '-w', out, '--stdin'], clean);
  }

  if (!ok || !existsSync(out) || !statSync(out).size) return null;
  return { file: out, provider, cached: false };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const lang = (argv.find((arg) => arg.startsWith('--lang=')) || '').split('=')[1] || '';
  if (!lang) {
    console.log('Usage: node scripts/speech.mjs --lang=ka');
  } else {
    const command = piperCommand(lang);
    console.log(`provider now: ${providerFor(lang) || 'none'}`);
    console.log(
      command
        ? `Piper has a voice for ${lang}. Run this once, by hand:\n\n${command}\n`
        : `Piper has no packaged voice for ${lang}; install eSpeak NG for a robotic but working one.`,
    );
  }
}
