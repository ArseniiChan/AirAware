// Web Speech API wrapper for the voice-guided route mode (Plan §1
// NICE-TO-HAVE). Speech synthesis is browser-native, so this ships zero
// new dependencies and zero bundle weight.
//
// Demo-day rules per Plan §8.8:
//   - Feature-detect window.speechSynthesis. If absent, hide the toggle
//     entirely and fall back to the visual turn-by-turn list.
//   - Never auto-play. The user must tap the button to start narration.
//   - Always provide a stop() that immediately cancels the queue (some
//     browsers leave utterances queued for seconds after pause()).
//
// Locale: we map next-intl locales to BCP-47 voice languages and prefer the
// best-quality local voice. Safari ships great en-US / es-ES; Chrome falls
// back to a default voice when the user hasn't installed any.

export interface SpokenStep {
  instruction: string;
  durationS?: number;
}

const LOCALE_TO_BCP47: Record<string, string> = {
  en: 'en-US',
  es: 'es-ES',
  zh: 'zh-CN',
  ar: 'ar-SA',
  ru: 'ru-RU',
};

/** Returns true iff the browser exposes the Web Speech API and at least
 *  one voice. Some browsers populate voices async — if `voices.length` is
 *  zero on first call, the caller can listen for `voiceschanged`. */
export function isSpeechAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  return 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

function bestVoice(lang: string): SpeechSynthesisVoice | null {
  if (!isSpeechAvailable()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  // Prefer exact language match, then language-only match (en-* matches en).
  const exact = voices.find((v) => v.lang.toLowerCase() === lang.toLowerCase());
  if (exact) return exact;
  const prefix = lang.slice(0, 2).toLowerCase();
  const partial = voices.find((v) => v.lang.toLowerCase().startsWith(prefix));
  return partial ?? null;
}

/** Speak a single phrase. Resolves when the utterance ends, naturally or via
 *  cancel(). Always uses a fresh utterance so chained speak() calls form a
 *  proper queue without timing races. */
export function speak(text: string, locale: string): Promise<void> {
  if (!isSpeechAvailable()) return Promise.resolve();
  return new Promise((resolve) => {
    const lang = LOCALE_TO_BCP47[locale] ?? locale;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    const v = bestVoice(lang);
    if (v) u.voice = v;
    u.rate = 1.0;
    u.pitch = 1.0;
    // Both 'end' and 'error' (e.g. user navigates away) resolve to keep the
    // queue moving. We don't reject — there's no recovery path.
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}

/** Cancel ALL queued utterances immediately. Safari has a bug where
 *  `cancel()` after `pause()` doesn't always flush — calling resume() first
 *  is the documented workaround. */
export function cancelSpeech(): void {
  if (!isSpeechAvailable()) return;
  try {
    window.speechSynthesis.resume();
  } catch {
    /* noop — pause was never called */
  }
  window.speechSynthesis.cancel();
}

/** Wait for `voiceschanged` once. Some browsers populate the voice list
 *  asynchronously after page load. */
export function waitForVoices(timeoutMs = 1500): Promise<void> {
  if (!isSpeechAvailable()) return Promise.resolve();
  if (window.speechSynthesis.getVoices().length > 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    const onChange = () => {
      clearTimeout(timer);
      window.speechSynthesis.removeEventListener('voiceschanged', onChange);
      resolve();
    };
    window.speechSynthesis.addEventListener('voiceschanged', onChange);
  });
}
