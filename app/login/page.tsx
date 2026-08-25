'use client';

import { apiUrl } from '@/lib/api-base';
import { stripBasePath } from '@/lib/paths';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';

// NI Portal owns real account creation, password reset and OAuth (Supabase Auth).
// Build 1.5 places every option and links out; build 2 wires Google/GitHub directly.
const NI_AUTH = 'https://northsideintelligence.com/auth/signin';
const NI_RESET = 'https://northsideintelligence.com/auth/signin';
const NI_SIGNUP = 'https://northsideintelligence.com/auth/signin';

function LoginForm() {
  const searchParams = useSearchParams();
  const next = stripBasePath(searchParams.get('next') || '/boot');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [help, setHelp] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch(apiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // one field: NI email OR username. Server matches the allow-list; real
      // username lookup lands with NI-account signup in build 2.
      body: JSON.stringify({ password: code, email: identifier }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'That AXON code does not match this NI account.');
      setLoading(false);
      return;
    }
    const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
    const dest = next === '/' ? '/boot' : next;
    window.location.assign(`${base}${dest}`);
  }

  function guest() {
    const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
    window.location.assign(`${base}/guest`);
  }

  const oauth = (provider: string) => () => {
    // Build 2 wires these directly; for now hand off to the NI Portal.
    window.location.assign(`${NI_AUTH}?provider=${provider}`);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="id" className="block text-[10px] uppercase tracking-[0.25em] text-slate-400">
          NI Account
        </label>
        <input
          id="id"
          type="text"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          className="mt-2 w-full rounded-lg border border-cyan-400/20 bg-black/50 px-4 py-3 text-sm outline-none focus:border-cyan-400/60"
          placeholder="Email or username"
          autoComplete="username"
          required
        />
      </div>

      <div>
        <label htmlFor="code" className="block text-[10px] uppercase tracking-[0.25em] text-slate-400">
          AXON Code
        </label>
        <div className="relative mt-2">
          <input
            id="code"
            type={showCode ? 'text' : 'password'}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full rounded-lg border border-cyan-400/20 bg-black/50 px-4 py-3 pr-16 text-sm outline-none focus:border-cyan-400/60"
            placeholder="••••••••••••"
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            onClick={() => setShowCode((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-[10px] uppercase tracking-widest text-cyan-300/70 hover:text-cyan-200"
          >
            {showCode ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-rose-300">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-4 py-3 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/20 disabled:opacity-50"
      >
        {loading ? 'Verifying…' : 'Initialize AXON'}
      </button>

      {/* OAuth (placed now; wired in build 2) */}
      <div className="flex gap-2">
        <button type="button" onClick={oauth('google')} className="flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-xs text-slate-200 transition hover:bg-white/10">
          Continue with Google
        </button>
        <button type="button" onClick={oauth('github')} className="flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-xs text-slate-200 transition hover:bg-white/10">
          Continue with GitHub
        </button>
      </div>

      <button type="button" onClick={guest} className="w-full rounded-lg border border-cyan-400/15 px-4 py-2.5 text-xs uppercase tracking-[0.2em] text-cyan-300/80 transition hover:text-cyan-100">
        Continue as guest
      </button>

      {/* Account hyperlinks */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-1 text-[11px] text-slate-500">
        <a href={NI_SIGNUP} target="_blank" rel="noreferrer" className="hover:text-cyan-300">Sign up for NI account</a>
        <a href={NI_SIGNUP} target="_blank" rel="noreferrer" className="hover:text-cyan-300">Get AXON access</a>
        <a href={NI_RESET} target="_blank" rel="noreferrer" className="hover:text-cyan-300">Forgot password</a>
        <button type="button" onClick={() => setHelp(true)} className="hover:text-cyan-300">? Help</button>
      </div>

      <p className="text-center text-[10px] text-slate-600">
        Google / GitHub sign-in and in-app sign-up arrive in build 2.
      </p>

      {help && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setHelp(false)}>
          <div className="v0-panel v0-rise max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/70">How to sign in</p>
            <div className="mt-3 space-y-3 text-sm text-slate-300">
              <p><b className="text-slate-100">1. Your NI account</b> — enter the email or username tied to your Northside Intelligence account.</p>
              <p><b className="text-slate-100">2. Your AXON code</b> — the private code that unlocks AXON for your account. It's issued when your NI account is granted AXON access. Lost it? Ask your operator or use “Get AXON access”.</p>
              <p><b className="text-slate-100">No account yet?</b> — “Sign up for NI account”, then request AXON access.</p>
              <p><b className="text-slate-100">Just looking?</b> — “Continue as guest” to try the AXON chat with no account.</p>
            </div>
            <button onClick={() => setHelp(false)} className="mt-4 v0-chip text-cyan-200">Got it</button>
          </div>
        </div>
      )}
    </form>
  );
}

export default function LoginPage() {
  const [awake, setAwake] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAwake(true), 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#07080C] px-4 text-slate-100">
      <div className="v0-wave-layer" />
      <div className="v0-wave-layer v0-wave-2" />

      {!awake ? (
        // Cerebro-style chamber: rings iris open, then the console appears.
        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="relative h-40 w-40">
            <div className="v0-chamber-ring absolute inset-0 rounded-full border border-dashed border-cyan-400/40" />
            <div className="v0-chamber-ring absolute inset-4 rounded-full border border-cyan-400/25" style={{ animationDelay: '.15s' }} />
            <div className="v0-chamber-ring absolute inset-8 rounded-full border border-cyan-400/50" style={{ animationDelay: '.3s' }} />
            <div className="v0-dot absolute inset-0 m-auto h-3 w-3 rounded-full bg-cyan-300" style={{ boxShadow: '0 0 24px #00D4FF' }} />
          </div>
          <p className="v0-dot mt-6 font-mono text-xs uppercase tracking-[0.4em] text-cyan-300/80">
            opening the chamber…
          </p>
        </div>
      ) : (
        <div className="v0-iris v0-panel relative z-10 w-full max-w-md p-8">
          <p className="text-[10px] tracking-[0.35em] text-cyan-300/80">NORTHSiDE Intelligence</p>
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
