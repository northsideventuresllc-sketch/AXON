'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          'error-callback'?: () => void;
          'expired-callback'?: () => void;
          theme?: 'light' | 'dark' | 'auto';
          size?: 'normal' | 'compact';
        },
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

const TURNSTILE_SCRIPT_ID = 'cf-turnstile-script';
const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
  className?: string;
}

function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.getElementById(TURNSTILE_SCRIPT_ID);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Turnstile script failed')), {
        once: true,
      });
      return;
    }

    window.onTurnstileLoad = () => resolve();

    const script = document.createElement('script');
    script.id = TURNSTILE_SCRIPT_ID;
    script.src = `${TURNSTILE_SCRIPT_SRC}&onload=onTurnstileLoad`;
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error('Turnstile script failed'));
    document.head.appendChild(script);
  });
}

export function TurnstileWidget({ onVerify, onExpire, onError, className }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [missingKey, setMissingKey] = useState(false);
  const reactId = useId();

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

  const handleVerify = useCallback(
    (token: string) => {
      onVerify(token);
    },
    [onVerify],
  );

  useEffect(() => {
    if (!siteKey) {
      setMissingKey(true);
      return;
    }

    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled) return;
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) onError?.();
      });

    return () => {
      cancelled = true;
    };
  }, [siteKey, onError]);

  useEffect(() => {
    if (!ready || !siteKey || !containerRef.current || !window.turnstile) return;

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: handleVerify,
      'expired-callback': () => onExpire?.(),
      'error-callback': () => onError?.(),
      theme: 'dark',
      size: 'compact',
    });

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [ready, siteKey, handleVerify, onExpire, onError, reactId]);

  if (missingKey) {
    return (
      <p className="text-center font-mono text-[0.62rem] uppercase tracking-widest text-axon-muted/70">
        Turnstile bypass — dev mode
      </p>
    );
  }

  return (
    <div
      ref={containerRef}
      className={className}
      aria-label="Cloudflare Turnstile verification"
    />
  );
}

export function resetTurnstile(widgetId?: string) {
  if (window.turnstile && widgetId) {
    window.turnstile.reset(widgetId);
  }
}
