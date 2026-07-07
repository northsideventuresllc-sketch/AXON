'use client';

import { useState } from 'react';
import { apiUrl } from '@/lib/api-base';

export function WaitlistForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    setMessage('');

    const res = await fetch(apiUrl('/api/waitlist'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    const data = await res.json();
    if (!res.ok) {
      setStatus('error');
      setMessage(data.error || 'Signup failed');
      return;
    }

    setStatus('success');
    setMessage(data.message);
    setEmail('');
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        required
        className="flex-1 rounded-lg border border-axon-border bg-axon-elevated px-4 py-3 text-sm outline-none focus:border-axon-gold/50"
      />
      <button
        type="submit"
        disabled={status === 'loading'}
        className="rounded-lg bg-axon-gold px-6 py-3 text-sm font-medium text-black transition hover:bg-axon-gold/90 disabled:opacity-50"
      >
        {status === 'loading' ? 'Joining…' : 'Join Waitlist'}
      </button>
      {message && (
        <p className={`sm:col-span-2 text-sm ${status === 'error' ? 'text-axon-danger' : 'text-axon-success'}`}>
          {message}
        </p>
      )}
    </form>
  );
}
