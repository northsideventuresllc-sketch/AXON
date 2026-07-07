'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { VOICE_HINTS } from '@/lib/axon-types';

interface SpeechRecognitionEventLike {
  results: { [index: number]: { [index: number]: { transcript: string } } };
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

function pickVoice(voiceId: string): SpeechSynthesisVoice | undefined {
  if (typeof window === 'undefined' || !window.speechSynthesis) return undefined;
  const hint = VOICE_HINTS[voiceId] || VOICE_HINTS.default;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.name.toLowerCase().includes(voiceId === 'uk' ? 'uk' : '') && v.lang.startsWith(hint.lang || 'en')) ||
    voices.find((v) => v.lang.startsWith(hint.lang || 'en')) ||
    voices.find((v) => v.lang.startsWith('en'))
  );
}

export function useAxonVoice(inputMode: 'chat' | 'voice', voiceId: string, readAloud: boolean) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setVoiceSupported(!!SR);
    setTtsSupported(!!window.speechSynthesis);

    if (!SR) return;

    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = VOICE_HINTS[voiceId]?.lang || 'en-US';
    rec.onresult = (ev) => {
      const text = ev.results[0]?.[0]?.transcript || '';
      setTranscript(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
  }, [voiceId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const prime = () => {
      window.speechSynthesis.getVoices();
    };
    prime();
    window.speechSynthesis.addEventListener('voiceschanged', prime);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', prime);
  }, []);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) return;
    setTranscript('');
    setListening(true);
    try {
      recognitionRef.current.start();
    } catch {
      setListening(false);
    }
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!readAloud || typeof window === 'undefined' || !window.speechSynthesis) return;

      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      const hint = VOICE_HINTS[voiceId] || VOICE_HINTS.default;
      utter.pitch = hint.pitch ?? 1;
      utter.rate = hint.rate ?? 0.95;
      utter.lang = hint.lang || 'en-US';

      const voice = pickVoice(voiceId);
      if (voice) utter.voice = voice;

      utter.onend = () => {
        synthRef.current = null;
      };

      synthRef.current = utter;
      window.speechSynthesis.speak(utter);
    },
    [readAloud, voiceId]
  );

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    synthRef.current = null;
  }, []);

  return {
    listening,
    transcript,
    setTranscript,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    voiceSupported,
    ttsSupported,
  };
}

export function getAvailableVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !window.speechSynthesis) return [];
  return window.speechSynthesis.getVoices();
}
