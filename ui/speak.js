import { app } from './core.js';

let cached = null;

export function localVoices() {
  if (cached) return cached;
  if (typeof speechSynthesis === 'undefined') return [];
  const voices = speechSynthesis.getVoices().filter((voice) => voice.localService);
  if (voices.length) cached = voices;
  return voices;
}

export const forgetVoices = () => {
  cached = null;
};

export function voiceFor(language) {
  const code = String(language || '').toLowerCase().slice(0, 2);
  return localVoices().find((voice) => String(voice.lang || '').toLowerCase().startsWith(code)) || null;
}

export const serverVoice = (language) =>
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
