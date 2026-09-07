'use client';

/**
 * THE FACE — push-to-talk microphone, level meter and spoken reply (Build Plan B, step 3).
 *
 * Three browser APIs, every one of them feature-detected, none of them a dependency:
 *  - **SpeechRecognition / webkitSpeechRecognition** for the words. Not everywhere (Firefox
 *    has none), which is why the panel keeps a typed input that runs the identical parser.
 *  - **getUserMedia + AnalyserNode** for the level meter, so the bars move to the actual
 *    microphone rather than to a decorative timer that would lie when the mic is muted.
 *  - **speechSynthesis** for the one-line reply. Silent under reduced motion or Mute.
 *
 * **Push-to-talk, never always-on.** The microphone opens while the button is held and
 * closes the moment it is let go. On release, on a hidden tab, on the window losing focus,
 * and on unmount every media track is stopped and the audio context is closed, so the
 * browser's recording indicator goes out — a screen that sits on a wall must never be
 * quietly listening. The tab-switch path matters on its own: the button is still held, so
 * no pointer event is ever coming to close it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** How many bars the level meter draws. */
export const METER_BARS = 7;

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

/**
 * Only the bits of `window` this file touches. Deliberately NOT declared as extending
 * `Window`: lib/use-axon-voice.ts already declares its own `SpeechRecognition` shape on the
 * global, and two different local shapes on the same global name do not merge.
 */
interface SpeechWindow {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  webkitAudioContext?: typeof AudioContext;
  AudioContext?: typeof AudioContext;
}

export interface FaceVoiceOptions {
  /** Called once with the final heard sentence when the button is let go. */
  onHeard: (text: string) => void;
  /** True when spoken replies are switched off (the Mute toggle, or reduced motion). */
  muted: boolean;
}

export interface FaceVoiceState {
  /** True when this browser can transcribe speech. False shows the typed input instead. */
  speechSupported: boolean;
  /** True when this browser can speak. False just means the reply is on screen only. */
  speechOutputSupported: boolean;
  /** True while the microphone is open. */
  listening: boolean;
  /** One value per bar, 0–1, straight off the microphone. All zero when not listening. */
  levels: number[];
  /** What is being heard right now, before it settles. */
  interim: string;
  /** One plain sentence when the microphone could not be opened, or null. */
  micError: string | null;
  start: () => void;
  stop: () => void;
  /** Say one line out loud. Does nothing when muted or unsupported. */
  speak: (line: string) => void;
  /** Stop any reply that is part-way through. */
  cancelSpeech: () => void;
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as SpeechWindow;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useFaceVoice({ onHeard, muted }: FaceVoiceOptions): FaceVoiceState {
  const [speechSupported, setSpeechSupported] = useState(false);
  const [speechOutputSupported, setSpeechOutputSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [levels, setLevels] = useState<number[]>(() => new Array(METER_BARS).fill(0));
  const [interim, setInterim] = useState('');
  const [micError, setMicError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const frameRef = useRef<number | null>(null);
  const finalRef = useRef('');
  const listeningRef = useRef(false);
  const onHeardRef = useRef(onHeard);
  onHeardRef.current = onHeard;

  // Feature detection runs on the client only, so the server render and the first client
  // render match and nothing flashes the wrong control.
  useEffect(() => {
    setSpeechSupported(getRecognitionCtor() !== null);
    setSpeechOutputSupported(typeof window !== 'undefined' && 'speechSynthesis' in window);
  }, []);

  /**
   * Close everything the microphone opened. Called on release, on unmount, and on any
   * failure part-way through opening — never leaves a live track behind.
   */
  const releaseMic = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});
    setLevels(new Array(METER_BARS).fill(0));
  }, []);

  /** Open the mic and drive the meter off a real AnalyserNode. Silent no-op if refused. */
  const openMeter = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
    const Ctx =
      typeof window !== 'undefined'
        ? ((window as unknown as SpeechWindow).AudioContext ??
          (window as unknown as SpeechWindow).webkitAudioContext)
        : undefined;
    if (!Ctx) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.7;
      ctx.createMediaStreamSource(stream).connect(analyser);

      const bins = new Uint8Array(analyser.frequencyBinCount);
      const perBar = Math.max(1, Math.floor(bins.length / METER_BARS));

      const tick = () => {
        if (!audioCtxRef.current) return;
        analyser.getByteFrequencyData(bins);
        const next: number[] = [];
        for (let bar = 0; bar < METER_BARS; bar += 1) {
          let total = 0;
          for (let i = 0; i < perBar; i += 1) total += bins[bar * perBar + i] ?? 0;
          next.push(Math.min(1, total / perBar / 190));
        }
        setLevels(next);
        frameRef.current = requestAnimationFrame(tick);
      };
      frameRef.current = requestAnimationFrame(tick);
    } catch {
      // A refused or unavailable microphone is not an error state for the whole screen —
      // say it in one sentence and leave the typed input working.
      releaseMic();
      setMicError('The microphone is not available, so type instead.');
    }
  }, [releaseMic]);

  const stop = useCallback(() => {
    listeningRef.current = false;
    setListening(false);
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.stop();
      } catch {
        /* already stopped */
      }
    }
    releaseMic();

    const heard = finalRef.current.trim() || interim.trim();
    finalRef.current = '';
    setInterim('');
    if (heard) onHeardRef.current(heard);
  }, [interim, releaseMic]);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor || recognitionRef.current) return;

    setMicError(null);
    finalRef.current = '';
    setInterim('');

    const recognition = new Ctor();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let live = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result?.[0]?.transcript ?? '';
        if (result?.isFinal) finalRef.current = `${finalRef.current} ${text}`.trim();
        else live += text;
      }
      setInterim(live);
    };
    recognition.onerror = () => {
      setMicError('That did not come through. Hold the button and try again, or type it.');
    };
    recognition.onend = () => {
      listeningRef.current = false;
      setListening(false);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      listeningRef.current = true;
      setListening(true);
      void openMeter();
    } catch {
      recognitionRef.current = null;
      setMicError('The microphone could not be opened, so type instead.');
    }
  }, [openMeter]);

  /**
   * Let go of the microphone without running anything.
   *
   * This is the tab-switch path, not the release path: the button is still held, so no
   * pointer or key event is coming, and `stop()` would fire a half-heard sentence at the
   * command runner. Nothing is heard, nothing is run, and the panel goes back to Idle —
   * but every track is stopped and the audio context is closed, which is the point.
   */
  const abandon = useCallback(() => {
    if (!listeningRef.current) return;
    listeningRef.current = false;
    setListening(false);

    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.abort();
      } catch {
        /* already stopped */
      }
    }
    releaseMic();
    finalRef.current = '';
    setInterim('');
  }, [releaseMic]);

  /**
   * A held button plus a switched tab used to leave the microphone open until the pointer
   * came back or the screen closed — the browser's recording indicator stayed lit with
   * nobody looking at the page. Hiding the tab now releases it, and so does the window
   * losing focus, which is what an alt-tab looks like when the tab itself stays visible.
   * Both listeners come off on unmount. Same shape as the orb's own visibility handling in
   * components/axon-v0/face-orb-scene.tsx.
   */
  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    const onVisibility = () => {
      if (document.hidden) abandon();
    };
    const onBlur = () => abandon();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
    };
  }, [abandon]);

  const cancelSpeech = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const speak = useCallback(
    (line: string) => {
      if (muted || !line) return;
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(line);
      utterance.rate = 1.02;
      utterance.pitch = 1;
      window.speechSynthesis.speak(utterance);
    },
    [muted]
  );

  // Everything closes on unmount: the recogniser, the tracks, the audio context and any
  // reply part-way through being spoken.
  useEffect(
    () => () => {
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      if (recognition) {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        try {
          recognition.abort();
        } catch {
          /* already gone */
        }
      }
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      const ctx = audioCtxRef.current;
      audioCtxRef.current = null;
      if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    },
    []
  );

  // Muting mid-sentence stops the sentence rather than letting it finish.
  useEffect(() => {
    if (muted) cancelSpeech();
  }, [muted, cancelSpeech]);

  return {
    speechSupported,
    speechOutputSupported,
    listening,
    levels,
    interim,
    micError,
    start,
    stop,
    speak,
    cancelSpeech,
  };
}
