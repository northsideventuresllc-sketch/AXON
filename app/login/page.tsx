'use client';

import { apiUrl } from '@/lib/api-base';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/boot';
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    // One AXON account per NI account: the code must belong to this NI login.
    const res = await fetch(apiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: code, email }),
    });

    if (!res.ok) {
      setError('That AXON code does not match this NI account.');
      setLoading(false);
      return;
    }
    router.push(next === '/' ? '/boot' : next);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-[10px] uppercase tracking-[0.25em] text-slate-400">
          NI Account
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-2 w-full rounded-lg border border-cyan-400/20 bg-black/50 px-4 py-3 text-sm outline-none focus:border-cyan-400/60"
          placeholder="you@northsideintelligence.com"
          required
        />
      </div>
      <div>
        <label htmlFor="code" className="block text-[10px] uppercase tracking-[0.25em] text-slate-400">
          AXON Code
        </label>
        <input
          id="code"
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="mt-2 w-full rounded-lg border border-cyan-400/20 bg-black/50 px-4 py-3 text-sm outline-none focus:border-cyan-400/60"
          placeholder="••••••••••••"
          required
        />
      </div>
      {error && <p className="text-sm text-rose-300">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-4 py-3 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/20 disabled:opacity-50"
      >
        {loading ? 'Verifying…' : 'Initialize AXON'}
      </button>
      <p className="text-center text-[10px] text-slate-500">
        Passkey and alternate sign-in arrive in a later build.
      </p>
    </form>
  );
}

export default function LoginPage() {
  const [awake, setAwake] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAwake(true), 1400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#07080C] px-4 text-slate-100">
      <div className="v0-wave-layer" />
      <div className="v0-wave-layer v0-wave-2" />

      {!awake ? (
        // Robotic intro: the machine assembles itself, then asks for credentials.
        <div className="relative z-10 text-center">
          <div className="v0-ring mx-auto h-32 w-32 rounded-full border border-dashed border-cyan-400/40" />
          <p className="v0-dot mt-6 font-mono text-xs uppercase tracking-[0.4em] text-cyan-300/80">
            constructing interface…
          </p>
        </div>
      ) : (
        <div className="v0-rise v0-panel relative z-10 w-full max-w-md p-8">
          <p className="text-[10px] uppercase tracking-[0.35em] text-cyan-300/80">Northside Intelligence</p>
          <h1 className="v0-neon mt-2 text-4xl">AXON</h1>
          <p className="mt-2 text-sm text-slate-400">The master harness. Identify yourself.</p>
          <div className="mt-8">
            <Suspense>
              <LoginForm />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}
