'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { startAuthentication } from '@simplewebauthn/browser';
import {
  PasscodeGate,
  type PasscodeLockoutState,
} from '@/components/axon/passcode-gate';
import { apiUrl } from '@/lib/api-base';

interface PasscodeStatusResponse {
  locked: boolean;
  lockoutUntil?: string | null;
  attemptsRemaining?: number;
  failedAttempts?: number;
  displayName?: string;
}

interface VerifyErrorResponse {
  ok?: false;
  error?: string;
  lockout?: {
    locked: boolean;
    lockoutUntil?: string | null;
    attemptsRemaining?: number;
    failedAttempts?: number;
  };
  displayName?: string;
}

function secondsUntil(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 1000));
}

function mapLockout(data: {
  locked?: boolean;
  lockoutUntil?: string | null;
  attemptsRemaining?: number;
  failedAttempts?: number;
}): PasscodeLockoutState {
  return {
    locked: Boolean(data.locked),
    lockoutUntil: data.lockoutUntil,
    attemptsRemaining: data.attemptsRemaining,
    attemptsUsed: data.failedAttempts,
    lockoutSecondsRemaining: data.locked ? secondsUntil(data.lockoutUntil) : 0,
  };
}

function LoginPasscode() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/';

  const [lockoutState, setLockoutState] = useState<PasscodeLockoutState | undefined>();
  const [displayName, setDisplayName] = useState('OPERATOR');
  const [statusLoading, setStatusLoading] = useState(true);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/auth/passcode/status'), { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as PasscodeStatusResponse;
      setLockoutState(mapLockout(data));
      if (data.displayName) setDisplayName(data.displayName);
    } catch {
      /* status endpoint optional during rollout */
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const handleSuccess = async (passcode: string, turnstileToken?: string | null) => {
    const res = await fetch(apiUrl('/api/auth/passcode/verify'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode, turnstileToken }),
    });

    if (res.status === 423) {
      const data = (await res.json()) as VerifyErrorResponse;
      const lockout = data.lockout ?? data;
      setLockoutState(mapLockout(lockout));
      throw new Error('locked');
    }

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as VerifyErrorResponse;
      if (data.lockout) {
        setLockoutState(mapLockout(data.lockout));
      } else if (data.lockout === undefined && data.error) {
        await refreshStatus();
      }
      throw new Error('invalid');
    }

    await new Promise((r) => setTimeout(r, 1400));
    router.push(next);
    router.refresh();
  };

  const handlePasskey = async () => {
    const optionsRes = await fetch(apiUrl('/api/auth/passkey/login/options'), {
      method: 'POST',
    });

    if (!optionsRes.ok) throw new Error('options failed');

    const options = await optionsRes.json();
    const authResponse = await startAuthentication({ optionsJSON: options });

    const verifyRes = await fetch(apiUrl('/api/auth/passkey/login/verify'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(authResponse),
    });

    if (!verifyRes.ok) throw new Error('verify failed');

    await new Promise((r) => setTimeout(r, 1400));
    router.push(next);
    router.refresh();
  };

  const handleRecovery = async (turnstileToken?: string | null) => {
    const res = await fetch(apiUrl('/api/auth/security-questions/request-email'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ turnstileToken }),
    });
    if (!res.ok) throw new Error('recovery failed');
  };

  if (statusLoading) {
    return (
      <div className="hex-grid-bg flex min-h-screen items-center justify-center bg-axon-bg">
        <p className="font-mono text-xs uppercase tracking-[0.32em] text-axon-cyan/70">
          Initializing HUD…
        </p>
      </div>
    );
  }

  return (
    <PasscodeGate
      displayName={displayName}
      lockoutState={lockoutState}
      onSuccess={handleSuccess}
      onPasskey={handlePasskey}
      onRequestRecovery={handleRecovery}
    />
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="hex-grid-bg flex min-h-screen items-center justify-center bg-axon-bg">
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-axon-cyan/70">
            Loading…
          </p>
        </div>
      }
    >
      <LoginPasscode />
    </Suspense>
  );
}
