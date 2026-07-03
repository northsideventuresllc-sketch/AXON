'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AxonNotification, NotificationSettings } from '@/lib/axon-types';

type ScreenPhase = 'idle' | 'new' | 'from' | 'click' | 'urgent_flash';

interface NotificationsPanelProps {
  settings: NotificationSettings;
  notifications: AxonNotification[];
  onOpen?: (notification: AxonNotification) => void;
  /** External trigger for demo / integration */
  trigger?: { notification: AxonNotification; key: number } | null;
  /** When urgent fires, parent can overlay chat */
  onUrgentStart?: () => void;
  onUrgentEnd?: () => void;
}

export function NotificationsPanel({
  settings,
  notifications,
  onOpen,
  trigger,
  onUrgentStart,
  onUrgentEnd,
}: NotificationsPanelProps) {
  const [phase, setPhase] = useState<ScreenPhase>('idle');
  const [active, setActive] = useState<AxonNotification | null>(null);
  const [hoverIdle, setHoverIdle] = useState(false);
  const [urgentRed, setUrgentRed] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const unread = notifications.filter((n) => !n.read);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const playUrgentAlarm = useCallback(() => {
    if (!settings.urgencySound || typeof window === 'undefined') return;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 880;
      gain.gain.value = settings.urgencyVolume * 0.15;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.stop(ctx.currentTime + 0.45);
      setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'square';
        osc2.frequency.value = 660;
        gain2.gain.value = settings.urgencyVolume * 0.12;
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start();
        gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc2.stop(ctx.currentTime + 0.4);
      }, 500);
    } catch {
      /* audio optional */
    }
  }, [settings.urgencySound, settings.urgencyVolume]);

  const runChain = useCallback(
    (notification: AxonNotification, skipUrgentFlash = false) => {
      if (!settings.enabled) return;
      clearTimers();
      setActive(notification);

      const isUrgent = notification.urgent && settings.urgencyEnabled;

      if (isUrgent && !skipUrgentFlash) {
        setPhase('urgent_flash');
        setUrgentRed(true);
        onUrgentStart?.();
        playUrgentAlarm();

        const flashMs = settings.urgencyFlashSeconds * 1000;
        const t1 = setTimeout(() => {
          setUrgentRed(false);
          onUrgentEnd?.();
          setPhase('new');
          const t2 = setTimeout(() => setPhase('from'), 1400);
          const t3 = setTimeout(() => setPhase('click'), 2800);
          const t4 = setTimeout(() => {
            setPhase('idle');
            setActive(null);
          }, 4200);
          timers.current.push(t2, t3, t4);
        }, flashMs);
        timers.current.push(t1);
        return;
      }

      setPhase('new');
      const t2 = setTimeout(() => setPhase('from'), 1400);
      const t3 = setTimeout(() => setPhase('click'), 2800);
      const t4 = setTimeout(() => {
        setPhase('idle');
        setActive(null);
      }, 4200);
      timers.current.push(t2, t3, t4);
    },
    [
      clearTimers,
      onUrgentEnd,
      onUrgentStart,
      playUrgentAlarm,
      settings.enabled,
      settings.urgencyEnabled,
      settings.urgencyFlashSeconds,
    ]
  );

  useEffect(() => {
    if (trigger?.notification) {
      runChain(trigger.notification);
    }
  }, [trigger?.key, trigger?.notification, runChain]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  function handlePanelClick() {
    if (phase === 'click' && active) {
      onOpen?.(active);
      setPhase('idle');
      setActive(null);
    } else if (phase === 'idle' && unread[0]) {
      runChain(unread[0], true);
    }
  }

  const urgentText = active?.urgent && settings.urgencyEnabled;

  return (
    <section
      className={`relative axon-card-3d axon-glass flex min-h-[120px] flex-col overflow-hidden rounded-2xl transition-colors duration-300 ${
        urgentRed ? 'axon-notif-urgent-flash border-red-500/60' : 'border border-axon-border/50'
      }`}
    >
      {unread.length > 0 && phase === 'idle' && (
        <span className="absolute right-2 top-2 z-10 h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
      )}

      <header className="border-b border-axon-border/60 px-4 py-2">
        <h2 className="text-xs uppercase tracking-[0.2em] text-axon-blue-glow">Notifications</h2>
      </header>

      <button
        type="button"
        onClick={handlePanelClick}
        onMouseEnter={() => setHoverIdle(true)}
        onMouseLeave={() => setHoverIdle(false)}
        className="relative flex flex-1 min-h-[100px] cursor-pointer items-center justify-center p-4 text-center"
      >
        {phase === 'idle' && (
          <div className="relative w-full">
            <HeartbeatMonitor />
            {hoverIdle && unread.length > 0 && (
              <p className="absolute inset-0 flex items-center justify-center bg-axon-bg/60 text-xs uppercase tracking-[0.2em] text-axon-cyan animate-pulse">
                Click to open
              </p>
            )}
            {hoverIdle && unread.length === 0 && (
              <p className="absolute inset-0 flex items-center justify-center bg-axon-bg/40 text-[10px] uppercase tracking-wider text-axon-muted">
                Click to open
              </p>
            )}
          </div>
        )}

        {phase === 'urgent_flash' && (
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-red-400 animate-pulse">
            Urgent notification
          </p>
        )}

        {phase === 'new' && (
          <p
            className={`text-sm font-semibold uppercase tracking-[0.3em] animate-notif-slide ${
              urgentText ? 'text-red-400' : 'text-axon-cyan'
            }`}
          >
            New notification
          </p>
        )}

        {phase === 'from' && active && (
          <p
            className={`max-w-full truncate text-sm font-medium animate-notif-slide ${
              urgentText ? 'text-red-300' : 'text-axon-blue-glow'
            }`}
          >
            {active.source} — {active.title}
          </p>
        )}

        {phase === 'click' && (
          <p
            className={`text-xs uppercase tracking-[0.35em] animate-notif-slide ${
              urgentText ? 'text-red-400' : 'text-axon-text'
            }`}
          >
            Click to open
          </p>
        )}
      </button>
    </section>
  );
}

function HeartbeatMonitor() {
  return (
    <div className="axon-heartbeat-wrap mx-auto w-full max-w-[280px]">
      <svg viewBox="0 0 300 60" className="h-14 w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="hbGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.2" />
            <stop offset="50%" stopColor="#22d3ee" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#818cf8" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        <path
          className="axon-heartbeat-line"
          d="M0,30 L40,30 L55,12 L70,48 L85,30 L300,30"
          fill="none"
          stroke="url(#hbGrad)"
          strokeWidth="2"
        />
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[9px] text-axon-muted/60">
        <span>SYS</span>
        <span className="animate-pulse text-axon-cyan/70">MONITORING</span>
        <span>OK</span>
      </div>
    </div>
  );
}

/** Play urgent alarm externally (e.g. when chat is replaced) */
export function playUrgentAlarmSound(volume = 0.35) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = volume * 0.15;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    /* optional */
  }
}
