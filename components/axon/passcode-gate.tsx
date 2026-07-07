'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { TurnstileWidget } from '@/components/axon/turnstile-widget';

export type PasscodeGateState = 'idle' | 'processing' | 'success' | 'error' | 'locked';

export interface PasscodeLockoutState {
  locked: boolean;
  attemptsRemaining?: number;
  attemptsUsed?: number;
  maxAttempts?: number;
  lockoutUntil?: string | null;
  lockoutSecondsRemaining?: number;
}

interface PasscodeGateProps {
  onSuccess: (passcode: string, turnstileToken?: string | null) => Promise<void> | void;
  displayName?: string;
  lockoutState?: PasscodeLockoutState;
  onRequestRecovery?: (turnstileToken?: string | null) => Promise<void> | void;
  onPasskey?: () => Promise<void> | void;
  maxLength?: number;
}

const ALPHA_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
];

function speakWelcome(name: string) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(`Welcome ${name}`);
  utterance.rate = 0.92;
  utterance.pitch = 0.95;
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(
    (v) => v.name.includes('Daniel') || v.name.includes('Google UK English Male') || v.lang.startsWith('en'),
  );
  if (preferred) utterance.voice = preferred;
  window.speechSynthesis.speak(utterance);
}

function ArcReactorOrb({ state }: { state: PasscodeGateState }) {
  const ringClass =
    state === 'success'
      ? 'axon-passcode-arc--success'
      : state === 'error'
        ? 'axon-passcode-arc--error'
        : state === 'locked'
          ? 'axon-passcode-arc--locked'
          : state === 'processing'
            ? 'axon-passcode-arc--processing'
            : '';

  return (
    <div className={`axon-passcode-arc-reactor ${ringClass}`} aria-hidden>
      <div className="axon-passcode-arc-ring axon-passcode-arc-ring--outer" />
      <div className="axon-passcode-arc-ring axon-passcode-arc-ring--mid" />
      <div className="axon-passcode-arc-ring axon-passcode-arc-ring--inner" />
      <div className="axon-passcode-arc-core">
        <div className="axon-passcode-arc-core-inner" />
      </div>
      {state === 'processing' && <div className="axon-passcode-arc-spinner" />}
    </div>
  );
}

function CornerTelemetry({ position }: { position: 'tl' | 'tr' | 'bl' | 'br' }) {
  const labels: Record<string, string[]> = {
    tl: ['SYS.AUTH', 'NODE.01', 'SEC.LEVEL.5'],
    tr: ['HUD.v3.2', 'LINK.OK', 'ENC.AES'],
    bl: ['BIOMETRIC', 'STANDBY', 'JARVIS'],
    br: ['NORTHSiDE', 'AXON.CORE', 'ONLINE'],
  };

  return (
    <div className={`axon-passcode-corner axon-passcode-corner--${position}`} aria-hidden>
      <div className="axon-passcode-corner-bracket" />
      {labels[position].map((line) => (
        <span key={line} className="axon-passcode-telemetry-line">
          {line}
        </span>
      ))}
    </div>
  );
}

export function PasscodeGate({
  onSuccess,
  displayName = 'OPERATOR',
  lockoutState,
  onRequestRecovery,
  onPasskey,
  maxLength = 16,
}: PasscodeGateProps) {
  const [passcode, setPasscode] = useState('');
  const [gateState, setGateState] = useState<PasscodeGateState>('idle');
  const [message, setMessage] = useState('');
  const [keyboardMode, setKeyboardMode] = useState<'numeric' | 'alpha'>('numeric');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(lockoutState?.lockoutSecondsRemaining ?? 0);
  const [recoveryPending, setRecoveryPending] = useState(false);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isLocked = lockoutState?.locked || gateState === 'locked';
  const attemptsRemaining = lockoutState?.attemptsRemaining;
  const maxAttempts = lockoutState?.maxAttempts ?? 5;

  useEffect(() => {
    if (lockoutState?.locked) {
      setGateState('locked');
      setCountdown(lockoutState.lockoutSecondsRemaining ?? 0);
    }
  }, [lockoutState?.locked, lockoutState?.lockoutSecondsRemaining]);

  useEffect(() => {
    if (!isLocked || countdown <= 0) return;
    const timer = window.setInterval(() => {
      setCountdown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isLocked, countdown]);

  useEffect(() => {
    hiddenInputRef.current?.focus();
  }, []);

  const appendChar = useCallback(
    (char: string) => {
      if (isLocked || gateState === 'processing' || gateState === 'success') return;
      setPasscode((prev) => (prev.length < maxLength ? prev + char : prev));
      setGateState('idle');
      setMessage('');
    },
    [gateState, isLocked, maxLength],
  );

  const backspace = useCallback(() => {
    if (isLocked || gateState === 'processing' || gateState === 'success') return;
    setPasscode((prev) => prev.slice(0, -1));
    setGateState('idle');
    setMessage('');
  }, [gateState, isLocked]);

  const submitPasscode = useCallback(async () => {
    if (isLocked || !passcode || gateState === 'processing' || gateState === 'success') return;

    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (siteKey && !turnstileToken) {
      setGateState('error');
      setMessage('COMPLETE SECURITY CHECK');
      return;
    }

    setGateState('processing');
    setMessage('AUTHENTICATING…');

    try {
      await onSuccess(passcode, turnstileToken);
      setGateState('success');
      setMessage(`WELCOME ${displayName.toUpperCase()}`);
      speakWelcome(displayName);
    } catch {
      setGateState('error');
      setMessage('INCORRECT PASSWORD');
      setPasscode('');
      containerRef.current?.classList.add('axon-passcode-shake');
      window.setTimeout(() => containerRef.current?.classList.remove('axon-passcode-shake'), 520);
    }
  }, [displayName, gateState, isLocked, onSuccess, passcode, turnstileToken]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isLocked) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      void submitPasscode();
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      backspace();
    } else if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
      appendChar(e.key.toLowerCase());
    }
  };

  const handleHiddenInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, maxLength);
    setPasscode(val);
    setGateState('idle');
    setMessage('');
  };

  const handlePasskey = async () => {
    if (!onPasskey || isLocked) return;
    setGateState('processing');
    setMessage('BIOMETRIC SCAN…');
    try {
      await onPasskey();
      setGateState('success');
      setMessage(`WELCOME ${displayName.toUpperCase()}`);
      speakWelcome(displayName);
    } catch {
      setGateState('error');
      setMessage('PASSKEY DENIED');
    }
  };

  const handleRecovery = async () => {
    if (!onRequestRecovery || recoveryPending) return;
    setRecoveryPending(true);
    try {
      await onRequestRecovery(turnstileToken);
      setMessage('RECOVERY EMAIL SENT');
    } catch {
      setMessage('RECOVERY REQUEST FAILED');
    } finally {
      setRecoveryPending(false);
    }
  };

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const displaySlots = Math.max(8, passcode.length + 1, 8);
  const shellStateClass = `axon-passcode-shell--${gateState}`;

  return (
    <div className="axon-passcode-screen hex-grid-bg relative flex min-h-screen items-center justify-center overflow-hidden bg-axon-bg px-4 py-10">
      <div className="axon-passcode-scanlines" aria-hidden />
      <div className="axon-passcode-vignette" aria-hidden />

      <CornerTelemetry position="tl" />
      <CornerTelemetry position="tr" />
      <CornerTelemetry position="bl" />
      <CornerTelemetry position="br" />

      <div
        ref={containerRef}
        className={`axon-passcode-shell relative w-full max-w-md ${shellStateClass}`}
      >
        {gateState === 'success' && <div className="axon-passcode-scan-sweep" aria-hidden />}

        <div className="axon-passcode-panel axon-glass relative overflow-hidden rounded-2xl border border-axon-border/80 p-8">
          <div className="axon-passcode-panel-glow" aria-hidden />

          <header className="flex flex-col items-center text-center">
            <ArcReactorOrb state={gateState} />
            <p className="mt-5 font-mono text-[0.62rem] uppercase tracking-[0.42em] text-axon-cyan/80">
              Northside Intelligence
            </p>
            <h1 className="axon-passcode-title mt-2 text-2xl font-semibold tracking-[0.18em]">
              AXON
            </h1>
            <p className="mt-1 font-mono text-[0.58rem] uppercase tracking-[0.28em] text-axon-muted">
              Secure Access Terminal
            </p>
          </header>

          <div className="mt-8">
            <label className="block text-center font-mono text-[0.58rem] uppercase tracking-[0.32em] text-axon-muted">
              Enter Passcode
            </label>

            <div
              className="axon-passcode-display mt-4 flex justify-center gap-1.5 sm:gap-2"
              onClick={() => hiddenInputRef.current?.focus()}
            >
              {Array.from({ length: displaySlots }).map((_, i) => {
                const filled = i < passcode.length;
                const active = i === passcode.length && !isLocked;
                return (
                  <div
                    key={i}
                    className={`axon-passcode-cell ${filled ? 'axon-passcode-cell--filled' : ''} ${
                      active ? 'axon-passcode-cell--active' : ''
                    }`}
                  >
                    {filled ? '●' : ''}
                  </div>
                );
              })}
            </div>

            <input
              ref={hiddenInputRef}
              type="password"
              value={passcode}
              onChange={handleHiddenInput}
              onKeyDown={handleKeyDown}
              className="sr-only"
              autoComplete="current-password"
              aria-label="Passcode input"
              disabled={isLocked || gateState === 'processing' || gateState === 'success'}
            />

            {message && (
              <p
                className={`axon-passcode-message mt-4 text-center font-mono text-xs uppercase tracking-[0.22em] ${
                  gateState === 'error' ? 'text-axon-danger axon-passcode-glitch' : ''
                } ${gateState === 'success' ? 'text-axon-cyan axon-passcode-welcome' : ''} ${
                  gateState === 'locked' ? 'text-axon-gold' : ''
                } ${gateState === 'processing' ? 'text-axon-blue-glow' : ''}`}
              >
                {message}
              </p>
            )}

            {!isLocked && attemptsRemaining !== undefined && gateState !== 'success' && (
              <p className="mt-3 text-center font-mono text-[0.58rem] uppercase tracking-widest text-axon-muted/80">
                Attempts remaining:{' '}
                <span className="text-axon-cyan">{attemptsRemaining}</span> / {maxAttempts}
              </p>
            )}

            {isLocked && (
              <div className="axon-passcode-lockout mt-5 flex flex-col items-center gap-3">
                <div className="axon-passcode-lockout-ring" aria-hidden />
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-axon-gold">
                  System Locked
                </p>
                <p className="font-mono text-2xl tabular-nums tracking-widest text-axon-cyan">
                  {formatCountdown(countdown)}
                </p>
                <p className="font-mono text-[0.58rem] uppercase tracking-widest text-axon-muted">
                  {lockoutState?.attemptsUsed ?? maxAttempts} failed attempts
                </p>
                {onRequestRecovery && (
                  <button
                    type="button"
                    onClick={() => void handleRecovery()}
                    disabled={recoveryPending}
                    className="axon-passcode-recovery-btn mt-2 rounded border border-axon-gold/40 px-4 py-2 font-mono text-[0.62rem] uppercase tracking-[0.2em] text-axon-gold transition hover:border-axon-gold hover:bg-axon-gold/10 disabled:opacity-50"
                  >
                    {recoveryPending ? 'Sending…' : 'Request Security Questions via Email'}
                  </button>
                )}
              </div>
            )}
          </div>

          {!isLocked && gateState !== 'success' && (
            <>
              <div className="mt-6 flex justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setKeyboardMode('numeric')}
                  className={`axon-passcode-mode-btn rounded px-3 py-1 font-mono text-[0.58rem] uppercase tracking-widest ${
                    keyboardMode === 'numeric' ? 'axon-passcode-mode-btn--active' : ''
                  }`}
                >
                  123
                </button>
                <button
                  type="button"
                  onClick={() => setKeyboardMode('alpha')}
                  className={`axon-passcode-mode-btn rounded px-3 py-1 font-mono text-[0.58rem] uppercase tracking-widest ${
                    keyboardMode === 'alpha' ? 'axon-passcode-mode-btn--active' : ''
                  }`}
                >
                  ABC
                </button>
              </div>

              {keyboardMode === 'numeric' ? (
                <div className="axon-passcode-numpad mt-4 grid grid-cols-3 gap-2">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                    <button
                      key={digit}
                      type="button"
                      onClick={() => appendChar(digit)}
                      disabled={gateState === 'processing'}
                      className="axon-passcode-key"
                    >
                      {digit}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={backspace}
                    disabled={gateState === 'processing'}
                    className="axon-passcode-key axon-passcode-key--utility"
                    aria-label="Backspace"
                  >
                    ⌫
                  </button>
                  <button
                    type="button"
                    onClick={() => appendChar('0')}
                    disabled={gateState === 'processing'}
                    className="axon-passcode-key"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={() => void submitPasscode()}
                    disabled={gateState === 'processing' || !passcode}
                    className="axon-passcode-key axon-passcode-key--enter"
                  >
                    ↵
                  </button>
                </div>
              ) : (
                <div className="axon-passcode-alpha mt-4 space-y-1.5">
                  {ALPHA_ROWS.map((row, ri) => (
                    <div key={ri} className="flex justify-center gap-1">
                      {row.map((letter) => (
                        <button
                          key={letter}
                          type="button"
                          onClick={() => appendChar(letter.toLowerCase())}
                          disabled={gateState === 'processing'}
                          className="axon-passcode-alpha-key"
                        >
                          {letter}
                        </button>
                      ))}
                    </div>
                  ))}
                  <div className="flex justify-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={backspace}
                      disabled={gateState === 'processing'}
                      className="axon-passcode-key axon-passcode-key--utility min-w-[4.5rem]"
                    >
                      ⌫
                    </button>
                    <button
                      type="button"
                      onClick={() => void submitPasscode()}
                      disabled={gateState === 'processing' || !passcode}
                      className="axon-passcode-key axon-passcode-key--enter min-w-[4.5rem]"
                    >
                      AUTH
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-6 flex flex-col items-center gap-4">
                <TurnstileWidget
                  onVerify={setTurnstileToken}
                  onExpire={() => setTurnstileToken(null)}
                  onError={() => setTurnstileToken(null)}
                  className="axon-passcode-turnstile"
                />

                {onPasskey && (
                  <button
                    type="button"
                    onClick={() => void handlePasskey()}
                    disabled={gateState === 'processing'}
                    className="axon-passcode-passkey-btn flex w-full items-center justify-center gap-2 rounded-lg border border-axon-cyan/30 bg-axon-elevated/60 px-4 py-3 font-mono text-[0.62rem] uppercase tracking-[0.22em] text-axon-cyan transition hover:border-axon-cyan/60 hover:bg-axon-cyan/5 disabled:opacity-50"
                  >
                    <span className="axon-passcode-passkey-icon" aria-hidden>◈</span>
                    Use Passkey
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
