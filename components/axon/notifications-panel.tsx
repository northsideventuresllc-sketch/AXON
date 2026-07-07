'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { AxonNotification, NotificationSettings } from '@/lib/axon-types';

type ScreenPhase = 'idle' | 'new' | 'from' | 'click' | 'urgent_flash';

interface NotificationsPanelProps {
  settings: NotificationSettings;
  notifications: AxonNotification[];
  onOpen?: (notification: AxonNotification) => void;
  trigger?: { notification: AxonNotification; key: number } | null;
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
  const running = useRef(false);
  const unread = notifications.filter((n) => !n.read);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timers.current.push(t);
  }, []);

  const playUrgentSiren = useCallback(() => {
    if (!settings.urgencySound || typeof window === 'undefined') return;
    try {
      const ctx = new AudioContext();
      playUrgentAlarm(ctx, settings.urgencyVolume);
    } catch {
      /* audio optional */
    }
  }, [settings.urgencySound, settings.urgencyVolume]);

  const resetToIdle = useCallback(() => {
    setPhase('idle');
    setActive(null);
    setUrgentRed(false);
    running.current = false;
    onUrgentEnd?.();
  }, [onUrgentEnd]);

  const runStandardChain = useCallback(() => {
    setPhase('new');
    schedule(() => setPhase('from'), 1400);
    schedule(() => setPhase('click'), 2800);
    schedule(() => resetToIdle(), 4200);
  }, [resetToIdle, schedule]);

  const runChain = useCallback(
    (notification: AxonNotification, skipUrgentFlash = false) => {
      if (!settings.enabled || running.current) return;

      clearTimers();
      running.current = true;
      setActive(notification);

      const isUrgent = notification.urgent && settings.urgencyEnabled;

      if (isUrgent && !skipUrgentFlash) {
        setPhase('urgent_flash');
        setUrgentRed(true);
        onUrgentStart?.();
        playUrgentSiren();

        const flashMs = Math.max(2800, settings.urgencyFlashSeconds * 1000);
        schedule(() => {
          setUrgentRed(false);
          onUrgentEnd?.();
          runStandardChain();
        }, flashMs);
        return;
      }

      runStandardChain();
    },
    [
      clearTimers,
      onUrgentEnd,
      onUrgentStart,
      playUrgentSiren,
      runStandardChain,
      schedule,
      settings.enabled,
      settings.urgencyEnabled,
      settings.urgencyFlashSeconds,
    ]
  );

  useEffect(() => {
    if (trigger?.key) {
      runChain(trigger.notification);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger?.key]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  function handlePanelClick() {
    if (phase === 'click' && active) {
      clearTimers();
      onOpen?.(active);
      resetToIdle();
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

      <header className="shrink-0 border-b border-axon-border/60 px-4 py-2">
        <h2 className="text-xs uppercase tracking-[0.2em] text-axon-blue-glow">Notifications</h2>
      </header>

      <button
        type="button"
        onClick={handlePanelClick}
        onMouseEnter={() => setHoverIdle(true)}
        onMouseLeave={() => setHoverIdle(false)}
        className="relative flex min-h-[100px] w-full flex-1 cursor-pointer self-stretch overflow-hidden p-0 text-center"
      >
        {phase === 'idle' && (
          <>
            <HeartbeatMonitor />
            {hoverIdle && (
              <p className="absolute inset-0 z-10 flex items-center justify-center bg-axon-bg/50 text-xs uppercase tracking-[0.2em] text-axon-cyan">
                Click to open
              </p>
            )}
          </>
        )}

        {phase === 'urgent_flash' && (
          <p className="flex flex-1 items-center justify-center px-4 text-sm font-bold uppercase tracking-[0.25em] text-red-400 animate-pulse">
            Urgent notification
          </p>
        )}

        {phase === 'new' && (
          <p
            className={`flex flex-1 items-center justify-center px-4 text-sm font-semibold uppercase tracking-[0.3em] animate-notif-slide ${
              urgentText ? 'text-red-400' : 'text-axon-cyan'
            }`}
          >
            New notification
          </p>
        )}

        {phase === 'from' && active && (
          <p
            className={`flex flex-1 items-center justify-center px-4 text-sm font-medium animate-notif-slide ${
              urgentText ? 'text-red-300' : 'text-axon-blue-glow'
            }`}
          >
            {active.source} — {active.title}
          </p>
        )}

        {phase === 'click' && (
          <p
            className={`flex flex-1 items-center justify-center px-4 text-xs uppercase tracking-[0.35em] animate-notif-slide ${
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

function buildHeartbeatPath(width: number, midY = 50): string {
  const beatWidth = 180;
  const segments = Math.max(2, Math.ceil(width / beatWidth) + 1);
  let d = `M0,${midY}`;

  for (let i = 0; i < segments; i++) {
    const x = i * beatWidth;
    if (x > width) break;
    const peak = i % 2 === 0;
    d += peak
      ? ` L${x + 60},${midY} L${x + 78},${midY - 26} L${x + 96},${midY + 26} L${x + 114},${midY} L${Math.min(x + beatWidth, width)},${midY}`
      : ` L${x + 60},${midY} L${x + 78},${midY - 14} L${x + 96},${midY + 18} L${x + 114},${midY} L${Math.min(x + beatWidth, width)},${midY}`;
  }

  d += ` L${width},${midY}`;
  return d;
}

function HeartbeatMonitor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const [width, setWidth] = useState(400);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const update = () => {
      setWidth(Math.max(node.clientWidth, 120));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  const pathD = useMemo(() => buildHeartbeatPath(width), [width]);

  useEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    const len = path.getTotalLength();
    path.style.setProperty('--hb-length', String(len));
  }, [pathD, width]);

  const gradId = useId().replace(/:/g, '');

  return (
    <div ref={containerRef} className="axon-heartbeat-wrap" aria-hidden>
      <svg
        className="axon-heartbeat-svg"
        viewBox={`0 0 ${width} 100`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.15" />
            <stop offset="35%" stopColor="#22d3ee" stopOpacity="0.85" />
            <stop offset="65%" stopColor="#60a5fa" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#818cf8" stopOpacity="0.15" />
          </linearGradient>
        </defs>
        <path
          ref={pathRef}
          className="axon-heartbeat-line"
          d={pathD}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

function playAlarmTone(
  ctx: AudioContext,
  startAt: number,
  duration: number,
  frequency: number,
  volume: number
) {
  const t0 = ctx.currentTime + startAt;
  const t1 = t0 + duration;
  const peakVol = volume * 0.55;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, t0);
  master.gain.exponentialRampToValueAtTime(peakVol, t0 + 0.015);
  master.gain.setValueAtTime(peakVol, t1 - 0.04);
  master.gain.exponentialRampToValueAtTime(0.0001, t1);
  master.connect(ctx.destination);

  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(frequency, t0);
  osc.connect(master);
  osc.start(t0);
  osc.stop(t1 + 0.02);

  const harmonic = ctx.createOscillator();
  const harmonicGain = ctx.createGain();
  harmonic.type = 'sine';
  harmonic.frequency.setValueAtTime(frequency * 2, t0);
  harmonicGain.gain.value = 0.35;
  harmonic.connect(harmonicGain);
  harmonicGain.connect(master);
  harmonic.start(t0);
  harmonic.stop(t1 + 0.02);
}

/** Piercing two-tone alarm — alternating high beeps, clearly audible vs fog-horn hum. */
function playUrgentAlarm(ctx: AudioContext, volume: number, cycles = 5) {
  const toneDuration = 0.28;
  const gap = 0.12;
  const lowHz = 880;
  const highHz = 1100;

  for (let i = 0; i < cycles; i++) {
    const base = i * (toneDuration * 2 + gap * 2);
    playAlarmTone(ctx, base, toneDuration, lowHz, volume);
    playAlarmTone(ctx, base + toneDuration + gap, toneDuration, highHz, volume);
  }
}

export function playUrgentAlarmSound(volume = 0.35) {
  try {
    const ctx = new AudioContext();
    playUrgentAlarm(ctx, volume);
  } catch {
    /* optional */
  }
}
