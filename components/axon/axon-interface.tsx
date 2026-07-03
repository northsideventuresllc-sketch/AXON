'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { JarvisOrb } from './jarvis-orb';
import { BriefingPanel } from './briefing-panel';
import { TodoPanel } from './todo-panel';
import { AxonLabFloor } from './axon-lab-floor';
import {
  AXON_VOICES,
  type AxonWorkspace,
  type ChatMessage,
  type InputMode,
} from '@/lib/axon-types';
import { useAxonVoice } from '@/lib/use-axon-voice';
import { apiUrl } from '@/lib/api-base';

interface AxonInterfaceProps {
  initialMessages: ChatMessage[];
  initialWorkspace: AxonWorkspace;
  initialProfile: {
    input_mode: InputMode;
    read_aloud: boolean;
    voice_id: string;
    tone_preset: { summary?: string };
  };
}

export function AxonInterface({
  initialMessages,
  initialWorkspace,
  initialProfile,
}: AxonInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [workspace, setWorkspace] = useState<AxonWorkspace>(initialWorkspace);
  const [input, setInput] = useState('');
  const [inputMode, setInputMode] = useState<InputMode>(initialProfile.input_mode);
  const [readAloud, setReadAloud] = useState(initialProfile.read_aloud);
  const [voiceId, setVoiceId] = useState(initialProfile.voice_id);
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const voice = useAxonVoice(inputMode, voiceId, readAloud);

  const refreshWorkspace = useCallback(async () => {
    const res = await fetch(apiUrl('/api/axon/workspace'));
    if (res.ok) {
      const data = await res.json();
      setWorkspace(data.workspace);
    }
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (voice.transcript && !loading) {
      setInput(voice.transcript);
    }
  }, [voice.transcript, loading]);

  const savePrefs = useCallback(
    async (patch: Partial<{ input_mode: InputMode; read_aloud: boolean; voice_id: string }>) => {
      await fetch(apiUrl('/api/axon/profile'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
    },
    []
  );

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;
    setLoading(true);
    setInput('');

    const optimistic: ChatMessage = {
      id: `temp-${Date.now()}`,
      operator_id: 'default',
      role: 'user',
      content: text.trim(),
      channel: inputMode,
      metadata: {},
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);

    try {
      const res = await fetch(apiUrl('/api/axon/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim(), channel: inputMode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setMessages((m) => [
        ...m.filter((x) => x.id !== optimistic.id),
        data.userMsg,
        data.assistantMsg,
      ]);

      if (data.workspace) {
        setWorkspace(data.workspace);
      } else {
        refreshWorkspace();
      }

      if (readAloud && data.reply) {
        setSpeaking(true);
        voice.speak(data.reply);
        setTimeout(() => setSpeaking(false), Math.min(data.reply.length * 55, 15000));
      }
    } catch (err) {
      setMessages((m) => [
        ...m.filter((x) => x.id !== optimistic.id),
        optimistic,
        {
          id: `sys-${Date.now()}`,
          operator_id: 'default',
          role: 'assistant',
          content: err instanceof Error ? err.message : 'Something went wrong.',
          channel: inputMode,
          metadata: {},
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
      voice.setTranscript('');
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  function toggleInputMode(mode: InputMode) {
    setInputMode(mode);
    savePrefs({ input_mode: mode });
    if (mode === 'chat') voice.stopListening();
  }

  return (
    <div className="axon-lab-stage relative min-h-[820px] pb-6">
      <AxonLabFloor />

      {/* Core intelligence — center of the arc */}
      <div className="relative z-30 flex flex-col items-center pt-2">
        <JarvisOrb active={!loading} listening={voice.listening} speaking={speaking} />

        <div className="axon-lab-controls mt-6 flex flex-wrap items-center justify-center gap-3">
          <div className="flex rounded-full border border-axon-blue/30 bg-axon-elevated/80 p-1 axon-glass">
            <ModeButton
              active={inputMode === 'chat'}
              onClick={() => toggleInputMode('chat')}
              label="Chat"
            />
            <ModeButton
              active={inputMode === 'voice'}
              onClick={() => toggleInputMode('voice')}
              label="Voice"
              disabled={!voice.voiceSupported}
            />
          </div>

          <div className="axon-card-3d flex flex-wrap items-center gap-4 rounded-2xl border border-axon-border/50 px-4 py-2.5 axon-glass">
            <Toggle
              label="Read aloud"
              checked={readAloud}
              onChange={(v) => {
                setReadAloud(v);
                savePrefs({ read_aloud: v });
                if (!v) voice.stopSpeaking();
              }}
              disabled={!voice.ttsSupported}
            />
            <label className="flex items-center gap-2 text-xs text-axon-muted">
              Voice
              <select
                value={voiceId}
                onChange={(e) => {
                  setVoiceId(e.target.value);
                  savePrefs({ voice_id: e.target.value });
                }}
                className="rounded-lg border border-axon-border bg-axon-elevated px-2 py-1.5 text-xs outline-none focus:border-axon-blue-glow/50"
              >
                {AXON_VOICES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>

      {/* Semicircle arc — panels curve around the core with depth */}
      <div className="axon-lab-arc relative z-20 mx-auto mt-4 flex max-w-[1340px] flex-col items-stretch gap-4 px-2 lg:mt-2 lg:flex-row lg:items-end lg:justify-center lg:gap-5">
        <div className="axon-lab-wing-left axon-card-3d w-full lg:mb-12 lg:w-[min(300px,28%)]">
          <BriefingPanel
            items={workspace.briefing}
            autonomous={workspace.briefing_autonomous}
            onRefresh={refreshWorkspace}
          />
        </div>

        <div className="axon-lab-center axon-card-3d flex min-h-[460px] w-full flex-col rounded-2xl border border-axon-border/50 axon-glass lg:mb-4 lg:w-[min(560px,44%)]">
          <div className="border-b border-axon-border/50 px-4 py-2.5">
            <p className="text-[10px] uppercase tracking-[0.25em] text-axon-blue-glow">Command Interface</p>
          </div>
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center text-center text-sm text-axon-muted">
                <p>Good to see you. I&apos;m AXON — your personalized agentic assistant.</p>
                <p className="mt-2 text-xs">
                  Ask about outreach, set up your briefing, or add tasks to your to-do list.
                </p>
              </div>
            )}
            {messages.map((m) => (
              <MessageBubble key={m.id} role={m.role} content={m.content} channel={m.channel} />
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-xs text-axon-muted">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-axon-cyan" />
                AXON is thinking…
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="border-t border-axon-border/60 p-4">
            {inputMode === 'voice' ? (
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={voice.listening ? voice.stopListening : voice.startListening}
                  className={`rounded-xl border px-4 py-4 text-sm font-medium transition ${
                    voice.listening
                      ? 'border-axon-cyan bg-axon-cyan/10 text-axon-cyan'
                      : 'border-axon-border hover:border-axon-blue-glow/40'
                  }`}
                >
                  {voice.listening ? 'Stop listening' : 'Hold to speak — tap to start'}
                </button>
                {input && <p className="text-sm text-axon-muted">&ldquo;{input}&rdquo;</p>}
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="rounded-lg axon-gradient-btn px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  Send voice message
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Talk to AXON…"
                  className="flex-1 rounded-lg border border-axon-border bg-axon-elevated/80 px-4 py-3 text-sm outline-none focus:border-axon-blue-glow/50"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="rounded-lg axon-gradient-btn px-5 py-3 text-sm font-medium text-white disabled:opacity-40"
                >
                  Send
                </button>
              </div>
            )}
          </form>
        </div>

        <div className="axon-lab-wing-right axon-card-3d w-full lg:mb-12 lg:w-[min(300px,28%)]">
          <TodoPanel
            items={workspace.todos}
            autonomous={workspace.todos_autonomous}
            onRefresh={refreshWorkspace}
          />
        </div>
      </div>

      <p className="relative z-10 mx-auto mt-4 max-w-lg text-center text-[10px] leading-relaxed text-axon-muted/80">
        {initialProfile.tone_preset.summary ||
          'Default tone — AXON adapts from every message you send.'}
      </p>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  label,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
        active
          ? 'axon-gradient-btn text-white'
          : 'text-axon-muted hover:text-axon-text disabled:opacity-40'
      }`}
    >
      {label}
    </button>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-axon-muted">
      {label}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition ${checked ? 'bg-axon-blue' : 'bg-axon-border'} disabled:opacity-40`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${checked ? 'left-4' : 'left-0.5'}`}
        />
      </button>
    </label>
  );
}

function MessageBubble({
  role,
  content,
  channel,
}: {
  role: string;
  content: string;
  channel: string;
}) {
  const isUser = role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'border border-axon-blue/35 bg-axon-blue/15 text-axon-text'
            : 'border border-axon-border/60 bg-axon-elevated/80 text-axon-text/90'
        }`}
      >
        {!isUser && (
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-axon-cyan">
            AXON {channel === 'voice' ? '· voice' : ''}
          </span>
        )}
        {content}
      </div>
    </div>
  );
}
