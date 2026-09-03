import { ACTIONS, app, cardById, esc, icon, t, toast } from './core.js';

let cached = null;

function localVoices() {
  if (cached) return cached;
  if (typeof speechSynthesis === 'undefined') return [];
  const voices = speechSynthesis.getVoices().filter((voice) => voice.localService);
  if (voices.length) cached = voices;
  return voices;
}

const forgetVoices = () => {
  cached = null;
};

function voiceFor(language) {
  const code = String(language || '').toLowerCase().slice(0, 2);
  return localVoices().find((voice) => String(voice.lang || '').toLowerCase().startsWith(code)) || null;
}

const serverVoice = (language) =>
  !!app.speech?.[String(language || '').toLowerCase().slice(0, 2)]?.provider;

export const canSpeak = (language) => !!voiceFor(language) || serverVoice(language);

let playing = null;

export async function speak(text, language) {
  const words = String(text || '').trim();
  if (!words) return false;

  const voice = voiceFor(language);
  if (voice) {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(words);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = 0.95;
    speechSynthesis.speak(utterance);
    return true;
  }

  if (!serverVoice(language)) return false;
  try {
    const reply = await fetch(`/speech?lang=${encodeURIComponent(language)}&text=${encodeURIComponent(words)}`);
    if (!reply.ok) return false;
    if (playing) {
      playing.pause();
      URL.revokeObjectURL(playing.src);
    }
    playing = new Audio(URL.createObjectURL(await reply.blob()));
    await playing.play().catch(() => {});
    return true;
  } catch {
    return false;
  }
}

if (typeof speechSynthesis !== 'undefined') {
  speechSynthesis.addEventListener?.('voiceschanged', forgetVoices);
}

export const sayButton = (card) =>
  canSpeak(app.config.target)
    ? `<button class="star" data-act="say-card" data-value="${card.id}"
        aria-label="${esc(t('Say {word} out loud', { word: card.front }))}">
        ${icon('speaker-high', 'icon-sm icon')}
      </button>`
    : '';

Object.assign(ACTIONS, {
  'say-card': async (id) => {
    const card = cardById(id);
    if (!card) return;
    const said = await speak(card.front, app.config.target);
    if (!said) toast(t('No offline voice for that language yet'), 'error');
  },
});
