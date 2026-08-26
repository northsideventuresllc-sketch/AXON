'use client';

// Browser voice (free, day one). Premium TTS providers come in a later build.
export function speak(text: string) {
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.96;
    utter.pitch = 0.9;
    window.speechSynthesis.speak(utter);
  } catch {
    /* voice is best-effort */
  }
}

export function stopSpeaking() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* noop */
  }
}

export function startDictation(onResult: (text: string) => void, onEnd?: () => void): (() => void) | null {
  try {
    const w = window as any;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return null;
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      const text = Array.from(e.results)
        .map((r: any) => r[0]?.transcript || '')
        .join(' ')
        .trim();
      if (text) onResult(text);
    };
    rec.onend = () => onEnd?.();
    rec.onerror = () => onEnd?.();
    rec.start();
    return () => rec.stop();
  } catch {
    return null;
  }
}
