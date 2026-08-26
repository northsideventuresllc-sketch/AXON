'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl } from '@/lib/api-base';
import { JarvisOrb } from '@/components/axon/jarvis-orb';
import { speak, startDictation, stopSpeaking } from './voice';
import { toSentenceCase } from '@/lib/axon-v0/view-prefs';

interface ChatMsg {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
}

export function OrbHome() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [autoVoice, setAutoVoice] = useState(false);
  const [activity, setActivity] = useState<string[]>(['Standing by.']);
  const stopDictationRef = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  const log = useCallback(
    (line: string) => setActivity((prev) => [...prev.slice(-5), toSentenceCase(line)]),
    []
  );

  // Chat closes on Esc or Backspace (Backspace only when the input is empty,
  // so it never eats a real edit while typing).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const emptyInput = input.trim().length === 0;
      if (e.key === 'Escape' || (e.key === 'Backspace' && emptyInput)) {
        e.preventDefault();
        stopSpeaking();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, input]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      setBusy(true);
      setInput('');
      setMessages((m) => [...m, { role: 'user', content: trimmed }]);
      log('Reading your message…');
      log('Routing through the AXON tier chain…');
      try {
        const r = await fetch(apiUrl('/api/axon/chat'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: trimmed, channel: 'chat' }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'chat failed');
        setMessages((m) => [...m, { role: 'assistant', content: data.reply }]);
        log('Reply delivered.');
        if (autoVoice) speak(data.reply);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'chat failed';
        setMessages((m) => [...m, { role: 'assistant', content: `⚠ ${msg}` }]);
        log(`Route failed: ${msg}`);
      } finally {
        setBusy(false);
      }
    },
    [autoVoice, busy, log]
  );

  const toggleDictation = useCallback(() => {
    if (listening) {
      stopDictationRef.current?.();
      setListening(false);
      return;
    }
    const stop = startDictation(
      (text) => setInput((prev) => (prev ? `${prev} ${text}` : text)),
      () => setListening(false)
    );
    if (stop) {
      stopDictationRef.current = stop;
      setListening(true);
    } else {
      log('Voice input not supported in this browser.');
    }
  }, [listening, log]);

  return (
    <div className="relative">
      {/* Orb — click to raise the chat; orb tucks under while chatting */}
      <div
        className={`mx-auto transition-all duration-700 ${open ? 'max-w-[170px] opacity-80' : 'max-w-[360px]'}`}
      >
        <JarvisOrb
          active
          processing={busy}
          listening={listening}
          speaking={false}
          interactive
          onActivate={() => setOpen(true)}
        />
      </div>
      {!open && (
        <p className="mt-2 text-center text-xs uppercase tracking-[0.3em] text-cyan-300/60">
          Tap the orb to speak with AXON
        </p>
      )}

      {open && (
        <div className="v0-rise mt-4 grid gap-4 lg:grid-cols-[1fr_260px]">
          <section className="v0-panel flex h-[420px] flex-col">
            <header className="flex items-center justify-between border-b border-cyan-400/10 px-4 py-2.5">
              <span className="text-xs uppercase tracking-[0.25em] text-cyan-200">AXON · Direct Line</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAutoVoice((v) => !v)}
                  className={`v0-chip ${autoVoice ? 'bg-cyan-400/15 text-cyan-100' : 'text-slate-400'}`}
                >
                  Voice {autoVoice ? 'on' : 'off'}
                </button>
                <button onClick={() => { stopSpeaking(); setOpen(false); }} className="v0-chip text-slate-400">
                  Close
                </button>
              </div>
            </header>
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {messages.length === 0 && (
                <p className="text-sm text-slate-500">What do you need done, JB?</p>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
                      m.role === 'user'
                        ? 'bg-cyan-400/15 text-cyan-50'
                        : 'border border-cyan-400/10 bg-black/40 text-slate-200'
                    }`}
                  >
                    {m.content}
                    {m.role === 'assistant' && !m.content.startsWith('⚠') && (
                      <button
                        onClick={() => speak(m.content)}
                        className="ml-2 align-middle text-[10px] uppercase tracking-widest text-cyan-300/70 hover:text-cyan-200"
                        title="Read aloud"
                      >
                        ▶ read
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {busy && <p className="v0-dot text-xs text-cyan-300/70">AXON is thinking…</p>}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="flex items-center gap-2 border-t border-cyan-400/10 p-3"
            >
              <button
                type="button"
                onClick={toggleDictation}
                className={`v0-chip ${listening ? 'bg-cyan-400/20 text-cyan-100' : 'text-slate-400'}`}
                title="Talk to type"
              >
                {listening ? '● rec' : '🎙'}
              </button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type or talk…"
                className="flex-1 rounded-lg border border-cyan-400/15 bg-black/40 px-3 py-2 text-sm outline-none focus:border-cyan-400/50"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100 transition hover:bg-cyan-400/20 disabled:opacity-40"
              >
                Send
              </button>
            </form>
            <div className="flex items-center gap-2 px-3 pb-2.5 text-[10px] uppercase tracking-[0.25em] text-slate-500">
              <span
                className={`v0-status ${
                  busy ? 'v0-status-think' : listening ? 'v0-status-live' : 'v0-status-idle'
                }`}
                aria-hidden
              />
              {busy ? 'Working…' : listening ? 'Listening…' : 'Ready'}
            </div>
          </section>

          {/* Side visuals — what AXON is doing to complete the request */}
          <aside className="v0-panel hidden h-[420px] flex-col p-4 lg:flex">
            <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/70">Live Process</p>
            <div className="mt-3 flex-1 space-y-2 overflow-y-auto">
              {activity.map((line, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-slate-300">
                  <span className={`mt-1 h-1.5 w-1.5 rounded-full bg-cyan-300 ${i === activity.length - 1 ? 'v0-dot' : 'opacity-30'}`} />
                  {line}
                </div>
              ))}
            </div>
            <div className="v0-ring mx-auto mt-3 h-16 w-16 rounded-full border border-dashed border-cyan-400/30" />
          </aside>
        </div>
      )}
    </div>
  );
}
