'use client';

import { useEffect, useRef, useState } from 'react';
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

export function useAxonVoice(inputMode: 'chat' | 'voice', voiceId: string, readAloud: boolean) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
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

  function startListening() {
    if (!recognitionRef.current) return;
    setTranscript('');
    setListening(true);
    recognitionRef.current.start();
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  function speak(text: string) {
    if (!readAloud || typeof window === 'undefined' || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    const hint = VOICE_HINTS[voiceId] || VOICE_HINTS.default;
    utter.pitch = hint.pitch ?? 1;
    utter.rate = hint.rate ?? 0.95;
    utter.lang = hint.lang || 'en-US';

    const voices = window.speechSynthesis.getVoices();
    const match = voices.find((v) => v.lang.startsWith(hint.lang || 'en'));
    if (match) utter.voice = match;

    synthRef.current = utter;
    window.speechSynthesis.speak(utter);
  }

  function stopSpeaking() {
    window.speechSynthesis?.cancel();
  }

  return {
    listening,
    transcript,
    setTranscript,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    voiceSupported: typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition),
    ttsSupported: typeof window !== 'undefined' && !!window.speechSynthesis,
  };
}

export function getAvailableVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !window.speechSynthesis) return [];
  return window.speechSynthesis.getVoices();
}
