'use client';

import { apiUrl } from '@/lib/api-base';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, Suspense } from 'react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/';
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch(apiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (!res.ok) {
      setError('Invalid credentials');
      setLoading(false);
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="password" className="block text-xs uppercase tracking-wider text-axon-muted">
          Access Key
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-2 w-full rounded-lg border border-axon-border bg-axon-elevated px-4 py-3 text-sm outline-none focus:border-axon-gold/50"
          placeholder="AXON_DASHBOARD_SECRET"
          required
        />
      </div>
      {error && <p className="text-sm text-axon-danger">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-axon-gold px-4 py-3 text-sm font-medium text-black transition hover:bg-axon-gold/90 disabled:opacity-50"
      >
        {loading ? 'Signing in…' : 'Enter Command Center'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="axon-grid-bg flex min-h-screen items-center justify-center bg-axon-bg px-4">
      <div className="w-full max-w-md rounded-2xl border border-axon-border bg-axon-surface p-8 axon-glow">
        <p className="text-xs uppercase tracking-[0.3em] text-axon-gold">NORTHSiDE</p>
        <h1 className="mt-2 text-2xl font-semibold">AXON</h1>
        <p className="mt-2 text-sm text-axon-muted">Operator access for JB. Phase 1 outreach dashboard.</p>
        <div className="mt-8">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
