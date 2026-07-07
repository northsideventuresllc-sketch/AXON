'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiUrl } from '@/lib/api-base';
import { appPath } from '@/lib/paths';

const INACTIVITY_MS = 5 * 60 * 1000;
const WARNING_MS = 3 * 60 * 1000;
const REFRESH_INTERVAL_MS = 60 * 1000;

export function InactivityGuard({ basePath }: { basePath?: string }) {
  const router = useRouter();
  const lastActivity = useRef(Date.now());
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(120);

  const logout = useCallback(async () => {
    await fetch(apiUrl('/api/auth/logout'), { method: 'POST' });
    const login = basePath ? appPath('/login?reason=inactivity', basePath) : '/login?reason=inactivity';
    router.push(login);
    router.refresh();
  }, [basePath, router]);

  const refreshSession = useCallback(async () => {
    try {
      await fetch(apiUrl('/api/auth/session/refresh'), { method: 'POST' });
    } catch {
      /* non-blocking */
    }
  }, []);

  const bumpActivity = useCallback(() => {
    lastActivity.current = Date.now();
    setShowWarning(false);
  }, []);

  useEffect(() => {
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'mousemove'] as const;
    const onActivity = () => bumpActivity();
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    const tick = window.setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      if (idle >= INACTIVITY_MS) {
        void logout();
        return;
      }
      if (idle >= WARNING_MS) {
        setShowWarning(true);
        setSecondsLeft(Math.ceil((INACTIVITY_MS - idle) / 1000));
      } else {
        setShowWarning(false);
      }
    }, 1000);

    const refresh = window.setInterval(() => {
      if (Date.now() - lastActivity.current < REFRESH_INTERVAL_MS) {
        void refreshSession();
      }
    }, REFRESH_INTERVAL_MS);

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [bumpActivity, logout, refreshSession]);

  if (!showWarning) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      role="alertdialog"
      aria-live="assertive"
      aria-label="Session timeout warning"
    >
      <div className="axon-glass mx-4 max-w-md rounded-2xl border border-axon-gold/40 p-8 axon-glow">
        <p className="font-mono text-xs uppercase tracking-[0.28em] text-axon-gold">Session Timeout</p>
        <h2 className="mt-3 text-lg font-semibold">Inactivity detected</h2>
        <p className="mt-2 text-sm text-axon-muted">
          Your AXON session will end in{' '}
          <span className="font-mono text-axon-cyan">{secondsLeft}s</span> due to inactivity.
        </p>
        <button
          type="button"
          onClick={bumpActivity}
          className="axon-gradient-btn mt-6 w-full rounded-lg px-4 py-3 text-sm font-medium text-white"
        >
          Extend session
        </button>
      </div>
    </div>
  );
}
