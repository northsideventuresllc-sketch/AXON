'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { JarvisOrb } from './jarvis-orb';
import { BriefingPanel } from './briefing-panel';
import { TodoPanel } from './todo-panel';
import { AxonLabFloor } from './axon-lab-floor';
import { NotificationsPanel } from './notifications-panel';
import { PanelFocusView, type FocusPanelId } from './panel-focus-view';
import {
  AXON_VOICES,
  type AxonNotification,
  type AxonPreferences,
  type AxonWorkspace,
  type ChatMessage,
  type HomeWidgetId,
  type InputMode,
} from '@/lib/axon-types';
import { classifyUrgency } from '@/lib/axon-preferences';
import { useAxonVoice } from '@/lib/use-axon-voice';
import { apiUrl } from '@/lib/api-base';

interface AxonInterfaceProps {
  initialMessages: ChatMessage[];
  initialWorkspace: AxonWorkspace;
  initialPreferences: AxonPreferences;
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
  initialPreferences,
  initialProfile,
}: AxonInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [workspace, setWorkspace] = useState<AxonWorkspace>(initialWorkspace);
  const [preferences, setPreferences] = useState<AxonPreferences>(initialPreferences);
  const [input, setInput] = useState('');
  const [inputMode, setInputMode] = useState<InputMode>(initialProfile.input_mode);
  const [readAloud, setReadAloud] = useState(initialProfile.read_aloud);
  const [voiceId, setVoiceId] = useState(initialProfile.voice_id);
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [focusPanel, setFocusPanel] = useState<FocusPanelId | null>(null);
  const [urgentChatOverlay, setUrgentChatOverlay] = useState(false);
  const [notifTrigger, setNotifTrigger] = useState<{ notification: AxonNotification; key: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const voice = useAxonVoice(inputMode, voiceId, readAloud);

  const layout = preferences.homeLayout;
  const isVisible = (id: HomeWidgetId) => !layout.hidden.includes(id);

  const narrowLeft = layout.left.filter((id) => id === 'test_buttons' && isVisible(id));
  const sideLeft = layout.left.filter((id) => id !== 'test_buttons' && isVisible(id));
  const centerWidgets = layout.center.filter(isVisible);
  const rightWidgets = layout.right.filter(isVisible);

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
    if (voice.transcript && !loading) setInput(voice.transcript);
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

      if (data.workspace) setWorkspace(data.workspace);
      else refreshWorkspace();

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

  async function fireTestNotification(urgent: boolean) {
    const source = urgent ? 'Pipeline Alert' : 'NI Outreach';
    const title = urgent ? 'Lead approval required NOW' : 'New draft ready for review';
    const notification: AxonNotification = {
      id: `test-${Date.now()}`,
      source,
      title,
      body: urgent ? 'High-priority lead waiting in queue.' : 'A new outreach draft was generated.',
      urgent:
        urgent &&
        preferences.notifications.urgencyEnabled &&
        (classifyUrgency(source, title, preferences.notifications) || urgent),
      read: false,
      created_at: new Date().toISOString(),
    };

    const res = await fetch(apiUrl('/api/axon/preferences'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addNotification: notification }),
    });
    if (res.ok) {
      const data = await res.json();
      setPreferences(data.preferences);
      setNotifTrigger({ notification: data.preferences.notificationsInbox[0], key: Date.now() });
    } else {
      setNotifTrigger({ notification, key: Date.now() });
    }
  }

  const briefingPanel = (
    <BriefingPanel
      items={workspace.briefing}
      autonomous={workspace.briefing_autonomous}
      onRefresh={refreshWorkspace}
      onTitleClick={() => setFocusPanel('briefing')}
    />
  );

  const todoPanel = (
    <TodoPanel
      items={workspace.todos}
      autonomous={workspace.todos_autonomous}
      onRefresh={refreshWorkspace}
      onTitleClick={() => setFocusPanel('todo')}
    />
  );

  const chatPanel = (
    <div className="axon-card-3d relative flex min-h-[300px] flex-col rounded-2xl border border-axon-border/50 axon-glass">
      {urgentChatOverlay && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-red-950/90 animate-pulse">
          <p className="text-lg font-bold uppercase tracking-[0.3em] text-red-400">Urgent notification</p>
        </div>
      )}
      <div className="border-b border-axon-border/50 px-4 py-2.5">
        <p className="text-[10px] uppercase tracking-[0.25em] text-axon-blue-glow">Command Interface</p>
      </div>
      <div ref={scrollRef} className="min-h-[200px] flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && !loading && (
          <div className="flex h-full flex-col items-center justify-center text-center text-sm text-axon-muted">
            <p>Good to see you. I&apos;m AXON — your personalized agentic assistant.</p>
            <p className="mt-2 text-xs">Ask about outreach, briefing, or to-dos.</p>
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
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(input);
        }}
        className="border-t border-axon-border/60 p-4"
      >
        {inputMode === 'voice' ? (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={voice.listening ? voice.stopListening : voice.startListening}
              className={`rounded-xl border px-4 py-3 text-sm font-medium ${
                voice.listening
                  ? 'border-axon-cyan bg-axon-cyan/10 text-axon-cyan'
                  : 'border-axon-border hover:border-axon-blue-glow/40'
              }`}
            >
              {voice.listening ? 'Stop listening' : 'Tap to speak'}
            </button>
            {input && <p className="text-sm text-axon-muted">&ldquo;{input}&rdquo;</p>}
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="rounded-lg axon-gradient-btn px-4 py-2 text-sm text-white disabled:opacity-40"
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
              className="rounded-lg axon-gradient-btn px-5 py-3 text-sm text-white disabled:opacity-40"
            >
              Send
            </button>
          </div>
        )}
      </form>
    </div>
  );

  const chatGhost = (
    <div className="rounded-2xl border border-axon-border/30 bg-axon-surface/50 p-4">
      <p className="text-[10px] uppercase text-axon-muted">Command Interface</p>
      <div className="mt-4 h-40 rounded-lg bg-axon-elevated/30" />
    </div>
  );

  function renderWidget(id: HomeWidgetId, arc?: 'left-wing' | 'right-wing' | 'center-chat' | 'orb-zone' | 'controls' | 'none') {
    if (!isVisible(id)) return null;

    const wrap = (node: ReactNode, className = '') => (
      <div key={id} className={className}>
        {node}
      </div>
    );

    switch (id) {
      case 'test_buttons':
        return wrap(
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => fireTestNotification(false)}
              className="rounded-lg border border-axon-border/60 bg-axon-elevated/80 px-2 py-2.5 text-[10px] leading-snug text-axon-muted transition hover:border-axon-blue/40 hover:text-axon-cyan"
            >
              Test Normal Notification
            </button>
            <button
              type="button"
              onClick={() => fireTestNotification(true)}
              className="rounded-lg border border-red-500/30 bg-red-950/20 px-2 py-2.5 text-[10px] leading-snug text-red-300 transition hover:border-red-400/50"
            >
              Test Urgent Notification
            </button>
          </div>
        );
      case 'briefing':
        return wrap(
          briefingPanel,
          arc === 'left-wing' ? 'axon-lab-wing-left axon-card-3d min-h-[400px]' : 'min-h-[400px]'
        );
      case 'chat':
        return wrap(
          chatPanel,
          arc === 'center-chat' ? 'axon-lab-center axon-center-chat w-full' : ''
        );
      case 'todo':
        return wrap(
          todoPanel,
          arc === 'right-wing' ? 'axon-lab-wing-right axon-card-3d min-h-[400px]' : 'min-h-[400px]'
        );
      case 'notifications':
        return wrap(
          <NotificationsPanel
            settings={preferences.notifications}
            notifications={preferences.notificationsInbox}
            trigger={notifTrigger}
            onUrgentStart={() => setUrgentChatOverlay(true)}
            onUrgentEnd={() => setUrgentChatOverlay(false)}
            onOpen={(n) => {
              fetch(apiUrl('/api/axon/preferences'), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ markReadId: n.id }),
              })
                .then((r) => r.json())
                .then((d) => d.preferences && setPreferences(d.preferences));
            }}
          />,
          arc === 'right-wing' ? 'axon-lab-wing-right w-full' : 'w-full'
        );
      case 'orb':
        return wrap(
          <JarvisOrb
            active={!loading}
            listening={voice.listening}
            speaking={speaking}
            processing={loading}
            size="large"
          />,
          arc === 'orb-zone' ? 'axon-orb-zone w-full' : 'flex justify-center py-6'
        );
      case 'controls':
        return wrap(
          <div className="relative z-40 flex flex-col items-center gap-3 overflow-visible pb-2">
            <div className="flex rounded-full border border-axon-blue/30 bg-axon-elevated/90 p-1 axon-glass shadow-lg">
              <ModeButton
                active={inputMode === 'chat'}
                onClick={() => {
                  setInputMode('chat');
                  savePrefs({ input_mode: 'chat' });
                  voice.stopListening();
                }}
                label="Chat"
              />
              <ModeButton
                active={inputMode === 'voice'}
                onClick={() => {
                  setInputMode('voice');
                  savePrefs({ input_mode: 'voice' });
                }}
                label="Voice"
                disabled={!voice.voiceSupported}
              />
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-axon-border/50 px-4 py-3 axon-glass">
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
          </div>,
          arc === 'controls' ? 'axon-lab-controls w-full pt-2' : 'relative z-40 pb-4'
        );
      default:
        return null;
    }
  }

  function arcWrapForCenter(id: HomeWidgetId): 'center-chat' | 'orb-zone' | 'controls' | 'none' {
    if (id === 'chat') return 'center-chat';
    if (id === 'orb') return 'orb-zone';
    if (id === 'controls') return 'controls';
    return 'none';
  }

  function arcWrapForRight(id: HomeWidgetId): 'right-wing' | 'none' {
    return id === 'todo' || id === 'notifications' ? 'right-wing' : 'none';
  }

  return (
    <>
      <div className="axon-lab-stage relative min-h-[920px] overflow-visible pb-8">
        <AxonLabFloor />

        {narrowLeft.length > 0 && (
          <div className="relative z-30 mx-auto max-w-[1520px] px-2 md:absolute md:left-3 md:top-3 md:mx-0 md:max-w-[110px] lg:left-5 lg:top-5">
            <div className="flex flex-row flex-wrap gap-2 md:flex-col">
              {narrowLeft.map((id) => renderWidget(id))}
            </div>
          </div>
        )}

        {/* Curved semicircle arc — wings low, chat + orb + controls at center peak */}
        <div className="axon-lab-arc relative z-20 mx-auto mt-2 flex max-w-[1520px] flex-col gap-5 px-2 md:mt-4 md:flex-row md:items-end md:justify-center md:gap-5 lg:gap-6">
          {sideLeft.length > 0 && (
            <div className="flex w-full flex-col gap-4 md:mb-14 md:w-[min(300px,28%)] md:shrink-0 lg:mb-20">
              {sideLeft.map((id) => renderWidget(id, 'left-wing'))}
            </div>
          )}

          {centerWidgets.length > 0 && (
            <div className="axon-lab-spine flex w-full flex-col items-stretch md:mb-5 md:w-[min(560px,44%)] md:shrink-0 lg:mb-8">
              {centerWidgets.map((id) => renderWidget(id, arcWrapForCenter(id)))}
            </div>
          )}

          {rightWidgets.length > 0 && (
            <div className="flex w-full flex-col gap-4 md:mb-14 md:w-[min(300px,28%)] md:shrink-0 lg:mb-20">
              {rightWidgets.map((id) => renderWidget(id, arcWrapForRight(id)))}
            </div>
          )}
        </div>

        <p className="relative z-10 mx-auto mt-6 max-w-lg text-center text-[10px] leading-relaxed text-axon-muted/80">
          {initialProfile.tone_preset.summary ||
            'Default tone — AXON adapts from every message you send.'}
        </p>
      </div>

      <PanelFocusView
        active={focusPanel}
        onClose={() => setFocusPanel(null)}
        briefing={
          <BriefingPanel
            items={workspace.briefing}
            autonomous={workspace.briefing_autonomous}
            onRefresh={refreshWorkspace}
          />
        }
        todo={
          <TodoPanel
            items={workspace.todos}
            autonomous={workspace.todos_autonomous}
            onRefresh={refreshWorkspace}
          />
        }
        chatGhost={chatGhost}
      />
    </>
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
        active ? 'axon-gradient-btn text-white' : 'text-axon-muted hover:text-axon-text disabled:opacity-40'
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
