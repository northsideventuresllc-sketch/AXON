'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { JarvisOrb } from './jarvis-orb';
import { AxonOrbStatus } from './axon-orb-status';
import { BriefingPanel } from './briefing-panel';
import { TodoPanel } from './todo-panel';
import { AxonLabFloor } from './axon-lab-floor';
import { NotificationsPanel } from './notifications-panel';
import { NotificationDetailModal } from './notification-detail-modal';
import { NotificationOrganizeModal } from './notification-organize-modal';
import { PanelFocusView, type FocusPanelId } from './panel-focus-view';
import { PreviousChatsFlip } from './previous-chats-flip';
import {
  AXON_VOICES,
  type AxonNotification,
  type AxonPreferences,
  type AxonWorkspace,
  type ChatMessage,
  type HomeWidgetId,
  type InputMode,
} from '@/lib/axon-types';
import {
  createSessionId,
  getLatestSessionId,
  getMessagesForSession,
  groupMessagesIntoSessions,
  mergeMessages,
  tagMessageWithSession,
} from '@/lib/axon-chat-sessions';
import { useAxonVoice } from '@/lib/use-axon-voice';
import { useNotificationActions } from '@/lib/use-notification-actions';
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
  const [allMessages, setAllMessages] = useState<ChatMessage[]>(initialMessages);
  const [activeSessionId, setActiveSessionId] = useState(
    () => getLatestSessionId(initialMessages) || createSessionId()
  );
  const [chatsFlipped, setChatsFlipped] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const messages = useMemo(
    () => getMessagesForSession(allMessages, activeSessionId),
    [allMessages, activeSessionId]
  );
  const sessions = useMemo(() => groupMessagesIntoSessions(allMessages), [allMessages]);
  const latestSessionId = useMemo(() => getLatestSessionId(allMessages), [allMessages]);
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
  const [selectedNotification, setSelectedNotification] = useState<AxonNotification | null>(null);
  const [notifArchivedView, setNotifArchivedView] = useState(false);
  const [showOrganizeModal, setShowOrganizeModal] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const voice = useAxonVoice(inputMode, voiceId, readAloud);
  const notifActions = useNotificationActions(setPreferences);

  const toggleVoiceListening = useCallback(() => {
    if (inputMode !== 'voice') return;
    if (voice.listening) voice.stopListening();
    else voice.startListening();
  }, [inputMode, voice]);

  const layout = preferences.homeLayout;
  const isVisible = (id: HomeWidgetId) => !layout.hidden.includes(id);

  const sideLeft = layout.left.filter((id) => id !== 'test_buttons' && isVisible(id));
  const centerWidgets = layout.center.filter(isVisible);
  const rightWidgets = layout.right.filter(isVisible);

  const rightTopWidgets = rightWidgets.filter((id) => id === 'todo');
  const rightLowerWidgets = rightWidgets.filter((id) => id !== 'todo');

  const refreshWorkspace = useCallback(async () => {
    const res = await fetch(apiUrl('/api/axon/workspace'));
    if (res.ok) {
      const data = await res.json();
      setWorkspace(data.workspace);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingSessions(true);
    fetch(apiUrl('/api/axon/chat?limit=200'))
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data.messages?.length) return;
        setAllMessages((prev) => {
          const merged = mergeMessages(prev, data.messages as ChatMessage[]);
          const latest = getLatestSessionId(merged);
          setActiveSessionId((current) => {
            if (getMessagesForSession(merged, current).length > 0) return current;
            return latest || current;
          });
          return merged;
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingSessions(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openPreviousChats = useCallback(() => {
    setChatsFlipped(true);
  }, []);

  const backToCurrentChat = useCallback(() => {
    if (latestSessionId) setActiveSessionId(latestSessionId);
    setChatsFlipped(false);
  }, [latestSessionId]);

  const selectChatSession = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
    setChatsFlipped(false);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading, chatsFlipped]);

  useEffect(() => {
    if (voice.transcript && !loading) setInput(voice.transcript);
  }, [voice.transcript, loading]);

  useEffect(() => {
    function onTestNotification(e: Event) {
      const detail = (e as CustomEvent<{ notification: AxonNotification }>).detail;
      if (!detail?.notification) return;
      setNotifTrigger({ notification: detail.notification, key: Date.now() });
      fetch(apiUrl('/api/axon/preferences'))
        .then((r) => r.json())
        .then((d) => d.preferences && setPreferences(d.preferences));
    }
    window.addEventListener('axon:test-notification', onTestNotification);
    return () => window.removeEventListener('axon:test-notification', onTestNotification);
  }, []);

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

    const optimistic: ChatMessage = tagMessageWithSession(
      {
        id: `temp-${Date.now()}`,
        operator_id: 'default',
        role: 'user',
        content: text.trim(),
        channel: inputMode,
        metadata: {},
        created_at: new Date().toISOString(),
      },
      activeSessionId
    );
    setAllMessages((m) => [...m, optimistic]);

    try {
      const res = await fetch(apiUrl('/api/axon/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          channel: inputMode,
          sessionId: activeSessionId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setAllMessages((m) => [
        ...m.filter((x) => x.id !== optimistic.id),
        tagMessageWithSession(data.userMsg, activeSessionId),
        tagMessageWithSession(data.assistantMsg, activeSessionId),
      ]);

      if (data.workspace) setWorkspace(data.workspace);
      else refreshWorkspace();

      if (readAloud && data.reply) {
        setSpeaking(true);
        voice.speak(data.reply);
        setTimeout(() => setSpeaking(false), Math.min(data.reply.length * 55, 15000));
      }
    } catch (err) {
      setAllMessages((m) => [
        ...m.filter((x) => x.id !== optimistic.id),
        optimistic,
        tagMessageWithSession(
          {
            id: `sys-${Date.now()}`,
            operator_id: 'default',
            role: 'assistant',
            content: err instanceof Error ? err.message : 'Something went wrong.',
            channel: inputMode,
            metadata: {},
            created_at: new Date().toISOString(),
          },
          activeSessionId
        ),
      ]);
    } finally {
      setLoading(false);
      voice.setTranscript('');
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

  const chatFlipProps = {
    flipped: chatsFlipped,
    sessions,
    activeSessionId,
    loadingSessions,
    onOpenPrevious: openPreviousChats,
    onBack: backToCurrentChat,
    onSelectSession: selectChatSession,
  };

  const desktopChatShell = (
    <PreviousChatsFlip {...chatFlipProps} className="axon-holo-chat-shell relative h-full min-h-0">
      {urgentChatOverlay && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-red-950/90 animate-pulse">
          <p className="text-lg font-bold uppercase tracking-[0.3em] text-red-400">Urgent notification</p>
        </div>
      )}
      <div className="relative shrink-0 border-b border-axon-border/50 px-4 py-2.5">
        <p className="text-[10px] uppercase tracking-[0.25em] text-axon-blue-glow">Command Interface</p>
      </div>
      <div ref={scrollRef} className="axon-holo-messages min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
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
        className="axon-holo-input-region shrink-0 border-t border-axon-border/60 p-4"
      >
        {inputMode === 'voice' ? (
          <VoiceInputControls
            input={input}
            loading={loading}
            listening={voice.listening}
            onToggleListening={toggleVoiceListening}
            onSend={() => sendMessage(input)}
            voiceSupported={voice.voiceSupported}
            capabilitiesReady={voice.capabilitiesReady}
          />
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
    </PreviousChatsFlip>
  );

  const chatPanel = (
    <PreviousChatsFlip {...chatFlipProps} className="w-full">
      {urgentChatOverlay && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-red-950/90 animate-pulse">
          <p className="text-lg font-bold uppercase tracking-[0.3em] text-red-400">Urgent notification</p>
        </div>
      )}
      <div className="relative shrink-0 border-b border-axon-border/50 px-4 py-2.5">
        <p className="text-[10px] uppercase tracking-[0.25em] text-axon-blue-glow">Command Interface</p>
      </div>
      <div ref={scrollRef} className="axon-holo-messages min-h-[280px] flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
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
        className="axon-holo-input-region shrink-0 border-t border-axon-border/60 p-4"
      >
        {inputMode === 'voice' ? (
          <VoiceInputControls
            input={input}
            loading={loading}
            listening={voice.listening}
            onToggleListening={toggleVoiceListening}
            onSend={() => sendMessage(input)}
            voiceSupported={voice.voiceSupported}
            capabilitiesReady={voice.capabilitiesReady}
          />
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
    </PreviousChatsFlip>
  );

  const chatGhost = (
    <div className="rounded-2xl border border-axon-border/30 bg-axon-surface/50 p-4">
      <p className="text-[10px] uppercase text-axon-muted">Command Interface</p>
      <div className="mt-4 h-40 rounded-lg bg-axon-elevated/30" />
    </div>
  );

  function renderWidget(
    id: HomeWidgetId,
    zone?: 'holo-left' | 'holo-right-top' | 'holo-right-lower' | 'holo-left-lower' | 'orb-deck' | 'stack'
  ) {
    if (!isVisible(id)) return null;

    const wrap = (node: ReactNode, className = '') => (
      <div key={id} className={className}>
        {node}
      </div>
    );

    switch (id) {
      case 'test_buttons':
        return null;
      case 'briefing':
        return wrap(
          briefingPanel,
          zone === 'holo-left' ? 'axon-holo-panel axon-holo-side-panel min-h-0 overflow-hidden' : 'min-h-[360px]'
        );
      case 'chat':
        return wrap(chatPanel, zone === 'stack' ? 'w-full' : 'w-full');
      case 'todo':
        return wrap(
          todoPanel,
          zone === 'holo-right-top' ? 'axon-holo-panel axon-holo-side-panel min-h-0 overflow-hidden' : 'min-h-[360px]'
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
              if (!n.interactive) {
                void notifActions.markRead(n.id);
              }
            }}
            onSelectNotification={(n) => {
              setNotifArchivedView(Boolean(n.archived));
              setSelectedNotification(n);
            }}
            onOrganize={() => setShowOrganizeModal(true)}
          />,
          zone === 'holo-right-lower' ? 'axon-holo-panel axon-notif-widget-slot w-full' : 'w-full'
        );
      case 'orb':
        return wrap(
          <JarvisOrb
            active={!loading}
            listening={voice.listening}
            speaking={speaking}
            processing={loading}
            size="large"
            interactive={inputMode === 'voice'}
            onActivate={inputMode === 'voice' ? toggleVoiceListening : undefined}
          />,
          zone === 'orb-deck'
            ? `axon-holo-orb-zone w-full ${inputMode === 'voice' ? 'axon-holo-orb-zone--voice' : ''}`
            : 'flex justify-center py-6'
        );
      case 'controls':
        return wrap(
          <div className="axon-holo-controls relative z-40 flex w-full flex-col items-center gap-3 overflow-visible">
            <div className="flex w-full flex-wrap items-center justify-center gap-2.5">
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
                />
              </div>
              <AxonOrbStatus
                active={!loading}
                listening={voice.listening}
                speaking={speaking}
                processing={loading}
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
            {inputMode === 'voice' && (
              <VoiceInputControls
                input={input}
                loading={loading}
                listening={voice.listening}
                onToggleListening={toggleVoiceListening}
                onSend={() => sendMessage(input)}
                voiceSupported={voice.voiceSupported}
                capabilitiesReady={voice.capabilitiesReady}
                compact
              />
            )}
          </div>,
          zone === 'orb-deck' ? 'axon-holo-orb-deck-controls w-full' : 'relative z-40 pb-4'
        );
      default:
        return null;
    }
  }

  const centerChat = centerWidgets.filter((id) => id === 'chat');
  const orbDeckWidgets = centerWidgets.filter((id) => id === 'controls' || id === 'orb');
  const centerOther = centerWidgets.filter((id) => id !== 'chat' && id !== 'orb' && id !== 'controls');

  const gridModifiers = [
    sideLeft.length === 0 ? 'axon-holo-grid-no-left' : '',
    rightWidgets.length === 0 ? 'axon-holo-grid-no-right' : '',
    sideLeft.length === 0 && rightWidgets.length === 0 ? 'axon-holo-grid-single' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const mobileStack: HomeWidgetId[] = [
    ...sideLeft,
    ...centerChat,
    ...centerOther,
    ...rightTopWidgets,
    ...rightLowerWidgets,
    ...orbDeckWidgets.filter((id) => id === 'controls'),
    ...orbDeckWidgets.filter((id) => id === 'orb'),
  ];

  return (
    <>
      <div className="axon-holo-stage axon-lab-stage relative min-h-0 overflow-visible pb-8">
        <AxonLabFloor />

        {/* Desktop: aligned holo grid */}
        <div className="axon-holo-rig relative z-20 mx-auto hidden max-w-[1720px] px-1 lg:block">
          <div className={`axon-holo-grid ${gridModifiers}`}>
            {sideLeft.length > 0 && (
              <div className="axon-holo-cell axon-holo-cell-left">
                {sideLeft.map((id) => renderWidget(id, 'holo-left'))}
              </div>
            )}

            {centerChat.length > 0 && (
              <div className="axon-holo-cell axon-holo-cell-center">{desktopChatShell}</div>
            )}

            {centerOther.length > 0 && (
              <div className="axon-holo-cell axon-holo-cell-left-lower flex flex-col gap-4">
                {centerOther.map((id) => renderWidget(id, 'holo-left-lower'))}
              </div>
            )}

            {rightTopWidgets.length > 0 && (
              <div className="axon-holo-cell axon-holo-cell-right-top">
                {rightTopWidgets.map((id) => renderWidget(id, 'holo-right-top'))}
              </div>
            )}

            {rightLowerWidgets.length > 0 && (
              <div className="axon-holo-cell axon-holo-cell-right-lower flex flex-col gap-4">
                {rightLowerWidgets.map((id) => renderWidget(id, 'holo-right-lower'))}
              </div>
            )}

            <div className="axon-holo-cell axon-holo-cell-orb">
              <div className="axon-holo-orb-deck">
                {orbDeckWidgets
                  .filter((id) => id === 'controls')
                  .map((id) => renderWidget(id, 'orb-deck'))}
                {orbDeckWidgets
                  .filter((id) => id === 'orb')
                  .map((id) => renderWidget(id, 'orb-deck'))}
              </div>
            </div>
          </div>
        </div>

        {/* Mobile / tablet stack */}
        <div className="relative z-20 mx-auto flex max-w-[1720px] flex-col gap-5 px-1 lg:hidden">
          {mobileStack.map((id) => renderWidget(id, 'stack'))}
        </div>

        <p className="relative z-10 mx-auto mt-6 max-w-lg px-2 text-center text-[10px] leading-relaxed text-axon-muted/80">
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

      {selectedNotification && (
        <NotificationDetailModal
          notification={selectedNotification}
          archivedView={notifArchivedView}
          onClose={() => setSelectedNotification(null)}
          onMarkRead={async (id) => { await notifActions.markRead(id); }}
          onResolve={async (id) => { await notifActions.resolve(id); }}
          onDecline={async (id) => { await notifActions.decline(id); }}
          onDelete={async (id) => {
            await notifActions.remove(id);
            setSelectedNotification(null);
          }}
          onRevive={async (id) => {
            await notifActions.revive(id);
            setSelectedNotification(null);
          }}
        />
      )}

      {showOrganizeModal && (
        <NotificationOrganizeModal
          notifications={preferences.notificationsInbox}
          onClose={() => setShowOrganizeModal(false)}
          onArchive={async (ids) => {
            await notifActions.archive(ids);
            setShowOrganizeModal(false);
          }}
        />
      )}
    </>
  );
}

function VoiceInputControls({
  input,
  loading,
  listening,
  onToggleListening,
  onSend,
  voiceSupported = true,
  capabilitiesReady = false,
  compact = false,
}: {
  input: string;
  loading: boolean;
  listening: boolean;
  onToggleListening: () => void;
  onSend: () => void;
  voiceSupported?: boolean;
  capabilitiesReady?: boolean;
  compact?: boolean;
}) {
  const micUnavailable = capabilitiesReady && !voiceSupported;

  return (
    <div className={`flex w-full flex-col gap-3 ${compact ? 'max-w-md' : ''}`}>
      <button
        type="button"
        onClick={onToggleListening}
        disabled={micUnavailable}
        title={micUnavailable ? 'Speech recognition is not supported in this browser' : undefined}
        className={`rounded-xl border px-4 py-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
          listening
            ? 'border-axon-cyan bg-axon-cyan/10 text-axon-cyan'
            : 'border-axon-border hover:border-axon-blue-glow/40'
        }`}
      >
        {listening ? 'Stop listening' : 'Tap to speak'}
      </button>
      {micUnavailable && (
        <p className="text-center text-xs text-axon-muted">
          Voice capture needs Chrome, Edge, or Safari on a secure connection.
        </p>
      )}
      {input && <p className="text-center text-sm text-axon-muted">&ldquo;{input}&rdquo;</p>}
      <button
        type="button"
        onClick={onSend}
        disabled={!input.trim() || loading}
        className="rounded-lg axon-gradient-btn px-4 py-2 text-sm text-white disabled:opacity-40"
      >
        Send voice message
      </button>
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
    <label
      className="flex cursor-pointer items-center gap-2 text-xs text-axon-muted"
      onClick={(e) => {
        if (disabled) return;
        if ((e.target as HTMLElement).closest('button[role="switch"]')) return;
        onChange(!checked);
      }}
    >
      {label}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onChange(!checked);
        }}
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? 'bg-axon-blue' : 'bg-axon-border'} disabled:opacity-40`}
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
