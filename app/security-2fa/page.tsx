'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiUrl } from '@/lib/api-base';

function TwoFactorContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/';
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch(apiUrl('/api/auth/2fa/challenge'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Invalid code');
      setLoading(false);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <div className="hex-grid-bg flex min-h-screen items-center justify-center bg-axon-bg px-4">
      <form
        onSubmit={handleSubmit}
        className="axon-passcode-panel w-full max-w-md rounded-2xl border border-axon-border/80 p-8 axon-glass"
      >
        <p className="font-mono text-xs uppercase tracking-[0.32em] text-axon-cyan/80">AXON 2FA</p>
        <h1 className="mt-2 text-xl font-semibold">Authenticator code</h1>
        <p className="mt-2 text-sm text-axon-muted">Enter the 6-digit code from your authenticator app.</p>
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className="mt-6 w-full rounded-lg border border-axon-border bg-axon-elevated px-4 py-3 text-center font-mono text-2xl tracking-[0.4em] outline-none focus:border-axon-cyan/50"
        />
        {error && <p className="mt-3 text-sm text-axon-danger">{error}</p>}
        <button
          type="submit"
          disabled={loading || code.length < 6}
          className="axon-gradient-btn mt-6 w-full rounded-lg px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? 'Verifying…' : 'Continue'}
        </button>
      </form>
    </div>
  );
}

export default function Security2FAPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-axon-bg" />}>
      <TwoFactorContent />
    </Suspense>
  );
}
