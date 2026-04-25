// Web Speech API wrapper for one-shot voice input. Pairs with voiceMode.ts
// (TTS half) — together they make the app usable without sight or typing.
//
// Browser support is uneven:
//   - Chrome / Edge: webkitSpeechRecognition (Google's cloud engine).
//   - Safari 17+: SpeechRecognition (Apple on-device).
//   - Firefox / older Safari: not supported. Mic button hides itself.
//
// Privacy note worth surfacing in the README: most browser STT engines stream
// audio to their vendor's cloud. Don't claim "no data leaves the device."

const LOCALE_TO_BCP47: Record<string, string> = {
  en: 'en-US',
  es: 'es-US',
  zh: 'zh-CN',
  ar: 'ar-SA',
  ru: 'ru-RU',
};

interface SRConstructor {
  new (): SpeechRecognitionLike;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<{
    0: { transcript: string };
    isFinal: boolean;
  }>;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

function getRecognition(): SRConstructor | null {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as SRConstructor | null;
}

export function isVoiceInputAvailable(): boolean {
  return getRecognition() !== null;
}

export interface ListenHandle {
  /** Cancel the in-flight recognition immediately. */
  stop: () => void;
}

export interface ListenOptions {
  /** next-intl locale ("en", "es", "zh", "ar", "ru"). Mapped to BCP-47. */
  locale: string;
  /** Final transcript callback. Fires once per session. */
  onResult: (transcript: string) => void;
  /** Recoverable error (e.g. "no-speech", "not-allowed"). */
  onError?: (code: string) => void;
  /** Called when the recognition session ends, regardless of cause. */
  onEnd?: () => void;
}

/** Start a single-shot speech recognition session. Returns a handle so the
 *  caller can abort (e.g. user tapped the mic again to cancel). */
export function listen(opts: ListenOptions): ListenHandle | null {
  const SR = getRecognition();
  if (!SR) {
    opts.onError?.('not-supported');
    return null;
  }

  const rec = new SR();
  rec.lang = LOCALE_TO_BCP47[opts.locale] ?? 'en-US';
  rec.continuous = false;
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  let delivered = false;

  rec.onresult = (e) => {
    const result = e.results[0];
    if (!result) return;
    const transcript = result[0].transcript.trim();
    if (transcript && !delivered) {
      delivered = true;
      opts.onResult(transcript);
    }
  };

  rec.onerror = (e) => {
    opts.onError?.(e.error);
  };

  rec.onend = () => {
    opts.onEnd?.();
  };

  try {
    rec.start();
  } catch {
    // Calling start() twice (or before the previous session fully ended)
    // throws. Treat as a no-op rather than crashing the UI.
    opts.onError?.('busy');
    return null;
  }

  return {
    stop: () => {
      try { rec.abort(); } catch { /* already stopped */ }
    },
  };
}
