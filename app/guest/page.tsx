'use client';

import { useRef, useState } from 'react';
import { apiUrl } from '@/lib/api-base';
import { JarvisOrb } from '@/components/axon/jarvis-orb';
import { speak } from '@/components/axon-v0/voice';

interface Msg {
  role: 'user' | 'axon';
  text: string;
}

export default function GuestPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [autoVoice, setAutoVoice] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setError('');
    setInput('');
    setMessages((m) => [...m, { role: 'user', text }]);
    try {
      const res = await fetch(apiUrl('/api/axon/guest-chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'The demo did not answer.');
      setMessages((m) => [...m, { role: 'axon', text: d.reply }]);
      if (autoVoice && d.reply) speak(d.reply);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The demo did not answer.');
    } finally {
      setSending(false);
      requestAnimationFrame(() =>
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
      );
    }
  }

  function login() {
    const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
    window.location.assign(`${base}/login`);
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#07080C] text-slate-100">
      <div className="v0-wave-layer" />
      <div className="v0-wave-layer v0-wave-2" />

      <header className="relative z-10 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="v0-logomark" />
          <span className="text-[10px] tracking-[0.28em] text-cyan-300/80">AXON · GUEST</span>
        </div>
        <button onClick={login} className="v0-chip bg-cyan-400/15 text-cyan-100">
          Sign in for full access →
        </button>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-6">
        <div className="mt-2 flex flex-col items-center text-center">
          <JarvisOrb active size="large" speaking={sending} processing={sending} />
          <h1 className="v0-neon mt-3 text-2xl">AXON</h1>
          <p className="mt-1 text-xs text-slate-400">
            Guest demo — a general assistant. No ventures, brain, or private data. Sign in to unlock the full harness.
          </p>
        </div>

        <div ref={scrollRef} className="v0-scroll mt-5 flex-1 space-y-3 overflow-y-auto pr-1">
          {messages.length === 0 && (
            <p className="text-center text-xs text-slate-500">Ask AXON anything to try it out.</p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-xl border px-3 py-2 text-sm ${
                  m.role === 'user'
                    ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-50'
                    : 'border-white/10 bg-black/40 text-slate-200'
                }`}
              >
                <p className="whitespace-pre-wrap">{m.text}</p>
                {m.role === 'axon' && (
                  <button onClick={() => speak(m.text)} className="mt-1 text-[10px] text-slate-500 hover:text-cyan-300">
                    ▶ read
                  </button>
                )}
              </div>
            </div>
          ))}
          {sending && <p className="v0-dot font-mono text-[11px] text-cyan-300/70">▸ thinking…</p>}
        </div>

        {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}

        <div className="mt-3 flex items-end gap-2 rounded-xl border border-cyan-400/20 bg-black/40 px-3 py-2">
          <button
            onClick={() => setAutoVoice((v) => !v)}
            className={`v0-chip ${autoVoice ? 'bg-cyan-400/15 text-cyan-100' : 'text-slate-500'}`}
          >
            🔊
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Message AXON…"
            className="max-h-32 w-full resize-none bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            className="v0-chip mb-0.5 bg-cyan-400/15 text-cyan-100 disabled:opacity-40"
          >
            {sending ? '…' : 'Send ➤'}
          </button>
        </div>
      </main>
    </div>
  );
}
