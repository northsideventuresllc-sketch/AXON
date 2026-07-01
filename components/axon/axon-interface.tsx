'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { JarvisOrb } from './jarvis-orb';
import { BriefingPanel } from './briefing-panel';
import { TodoPanel } from './todo-panel';
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
    <div className="grid gap-6 xl:grid-cols-[minmax(240px,280px)_1fr_minmax(260px,320px)]">
      {/* Jarvis core */}
      <div className="flex shrink-0 flex-col items-center gap-4">
        <JarvisOrb active={!loading} listening={voice.listening} speaking={speaking} />

        <div className="flex rounded-full border border-axon-border/60 bg-axon-elevated/80 p-1 axon-glass">
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

        <div className="axon-card-3d w-full space-y-3 rounded-2xl border border-axon-border/50 bg-axon-surface/80 p-4 axon-glass">
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

          <label className="block text-xs text-axon-muted">
            Voice
            <select
              value={voiceId}
              onChange={(e) => {
                setVoiceId(e.target.value);
                savePrefs({ voice_id: e.target.value });
              }}
              className="mt-1 w-full rounded-lg border border-axon-border bg-axon-elevated px-3 py-2 text-sm outline-none focus:border-axon-purple-glow/50"
            >
              {AXON_VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>

          <p className="text-[10px] leading-relaxed text-axon-muted">
            {initialProfile.tone_preset.summary ||
              'Default tone — AXON adapts from every message you send.'}
          </p>
        </div>
      </div>

      {/* Chat panel */}
      <div className="axon-card-3d flex min-h-[480px] flex-col rounded-2xl border border-axon-border/50 bg-axon-surface/70 axon-glass backdrop-blur-md">
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
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-axon-purple-glow" />
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
                    ? 'border-axon-teal bg-axon-teal/10 text-axon-teal'
                    : 'border-axon-border hover:border-axon-purple-glow/40'
                }`}
              >
                {voice.listening ? 'Stop listening' : 'Hold to speak — tap to start'}
              </button>
              {input && <p className="text-sm text-axon-muted">&ldquo;{input}&rdquo;</p>}
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="rounded-lg bg-gradient-to-r from-axon-purple to-axon-violet px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
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
                className="flex-1 rounded-lg border border-axon-border bg-axon-elevated/80 px-4 py-3 text-sm outline-none focus:border-axon-purple-glow/50"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="rounded-lg bg-gradient-to-r from-axon-purple to-axon-violet px-5 py-3 text-sm font-medium text-white disabled:opacity-40"
              >
                Send
              </button>
            </div>
          )}
        </form>
      </div>

      {/* Briefing + To-Do */}
      <div className="flex flex-col gap-4">
        <BriefingPanel
          items={workspace.briefing}
          autonomous={workspace.briefing_autonomous}
          onRefresh={refreshWorkspace}
        />
        <TodoPanel
          items={workspace.todos}
          autonomous={workspace.todos_autonomous}
          onRefresh={refreshWorkspace}
        />
      </div>
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
          ? 'bg-gradient-to-r from-axon-purple to-axon-violet text-white'
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
    <label className="flex cursor-pointer items-center justify-between text-xs text-axon-muted">
      {label}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition ${checked ? 'bg-axon-purple' : 'bg-axon-border'} disabled:opacity-40`}
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
            ? 'bg-axon-purple/20 text-axon-text border border-axon-purple/30'
            : 'border border-axon-border/60 bg-axon-elevated/80 text-axon-text/90'
        }`}
      >
        {!isUser && (
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-axon-purple-glow">
            AXON {channel === 'voice' ? '· voice' : ''}
          </span>
        )}
        {content}
      </div>
    </div>
  );
}
