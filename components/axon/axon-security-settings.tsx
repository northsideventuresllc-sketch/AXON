'use client';

import { useCallback, useEffect, useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import { apiUrl } from '@/lib/api-base';

export function AxonSecuritySettings() {
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [qrData, setQrData] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    const res = await fetch(apiUrl('/api/auth/passcode/status'), { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setTotpEnabled(Boolean(data.totpEnabled));
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function setup2FA() {
    setLoading(true);
    setStatus('');
    try {
      const res = await fetch(apiUrl('/api/auth/2fa/setup'), { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Setup failed');
      setQrData(data.otpauthUrl || data.qrData);
      setStatus('Scan the QR code with your authenticator app, then enter the 6-digit code below.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : '2FA setup failed');
    } finally {
      setLoading(false);
    }
  }

  async function enable2FA() {
    setLoading(true);
    setStatus('');
    try {
      const res = await fetch(apiUrl('/api/auth/2fa/verify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: totpCode, enable: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed');
      setTotpEnabled(true);
      setQrData(null);
      setTotpCode('');
      setStatus('Two-factor authentication enabled. Confirmation email sent.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to enable 2FA');
    } finally {
      setLoading(false);
    }
  }

  async function disable2FA() {
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/auth/2fa/verify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: totpCode, enable: false }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to disable');
      }
      setTotpEnabled(false);
      setTotpCode('');
      setStatus('Two-factor authentication disabled.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to disable 2FA');
    } finally {
      setLoading(false);
    }
  }

  async function registerPasskey() {
    setLoading(true);
    setStatus('');
    try {
      const optRes = await fetch(apiUrl('/api/auth/passkey/register/options'), { method: 'POST' });
      const options = await optRes.json();
      if (!optRes.ok) throw new Error(options.error || 'Passkey options failed');

      const attestation = await startRegistration({ optionsJSON: options });
      const verifyRes = await fetch(apiUrl('/api/auth/passkey/register/verify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attestation),
      });
      if (!verifyRes.ok) {
        const data = await verifyRes.json();
        throw new Error(data.error || 'Passkey registration failed');
      }
      setStatus('Passkey registered. You can use it to queue your passcode at login.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Passkey setup failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-axon-border bg-axon-surface p-6 axon-glass">
      <h2 className="text-sm font-medium">Security &amp; Authentication</h2>
      <p className="mt-1 text-xs text-axon-muted">
        Passkeys, two-factor authentication, and security question management.
      </p>

      <div className="mt-6 space-y-6">
        <div className="rounded-lg border border-axon-border/60 bg-axon-elevated/30 p-4">
          <h3 className="text-sm font-medium">Passkeys</h3>
          <p className="mt-1 text-xs text-axon-muted">
            Face ID, Touch ID, or hardware keys can queue your passcode at login.
          </p>
          <button
            type="button"
            disabled={loading}
            onClick={() => void registerPasskey()}
            className="mt-3 rounded-lg border border-axon-cyan/40 px-4 py-2 text-xs text-axon-cyan hover:bg-axon-cyan/10"
          >
            Register passkey
          </button>
        </div>

        <div className="rounded-lg border border-axon-border/60 bg-axon-elevated/30 p-4">
          <h3 className="text-sm font-medium">Two-factor authentication (2FA)</h3>
          <p className="mt-1 text-xs text-axon-muted">
            {totpEnabled
              ? '2FA is enabled on your account.'
              : 'Add an authenticator app for an extra layer of security.'}
          </p>
          {!totpEnabled && !qrData && (
            <button
              type="button"
              disabled={loading}
              onClick={() => void setup2FA()}
              className="mt-3 rounded-lg border border-axon-purple/40 px-4 py-2 text-xs text-axon-purple-glow hover:bg-axon-purple/10"
            >
              Set up 2FA
            </button>
          )}
          {qrData && (
            <div className="mt-3 space-y-3">
              <p className="break-all font-mono text-[10px] text-axon-muted">{qrData}</p>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="6-digit code"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                className="w-full max-w-xs rounded-lg border border-axon-border bg-axon-elevated px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={loading || totpCode.length < 6}
                onClick={() => void enable2FA()}
                className="axon-gradient-btn rounded-lg px-4 py-2 text-xs text-white"
              >
                Enable 2FA
              </button>
            </div>
          )}
          {totpEnabled && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="Code to disable"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                className="rounded-lg border border-axon-border bg-axon-elevated px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={loading}
                onClick={() => void disable2FA()}
                className="rounded-lg border border-axon-danger/40 px-4 py-2 text-xs text-axon-danger"
              >
                Disable 2FA
              </button>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-axon-border/60 bg-axon-elevated/30 p-4">
          <h3 className="text-sm font-medium">Security questions</h3>
          <p className="mt-1 text-xs text-axon-muted">
            Change your recovery questions (available 7 days after setup, then every 30 days).
          </p>
          <a
            href="/security-setup"
            className="mt-3 inline-block rounded-lg border border-axon-border px-4 py-2 text-xs text-axon-muted hover:text-axon-text"
          >
            Update security questions
          </a>
        </div>
      </div>

      {status && <p className="mt-4 text-xs text-axon-cyan">{status}</p>}
    </section>
  );
}
