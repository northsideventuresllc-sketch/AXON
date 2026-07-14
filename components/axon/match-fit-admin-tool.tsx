'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { apiUrl } from '@/lib/api-base';
import { consumeToolLaunch } from '@/lib/axon-user-tools';
import { AxonToolLaunchOverlay } from './axon-tool-launch-overlay';
import { AxonToolFooter } from './axon-tool-footer';
import { MF_ADMIN_LINKS } from '@/lib/match-fit-hub';

// ─── Types ─────────────────────────────────────────────────────────────────

type ContentPost = {
  id: string;
  post_type: string;
  theme_name: string;
  status: string;
  caption: string | null;
  platforms: string[] | null;
  created_at: string;
  scheduled_for: string | null;
};

type OutreachLead = {
  id: string;
  full_name: string | null;
  instagram_handle: string | null;
  status: string;
  created_at: string;
  source: string;
};

type AdPlatformTotals = {
  impressions: number;
  clicks: number;
  spendCents: number;
  conversions: number;
};

type AdDailyRow = {
  platform: string;
  dayKey: string;
  impressions: number;
  clicks: number;
  spendCents: number;
  conversions: number;
  source: string;
  syncedAt: string;
};

type AdSummary = {
  totalLast30Days: number;
  published: number;
  pending: number;
  byPlatform: Record<string, number>;
  tracker?: {
    mode: 'api' | 'site_attribution' | 'empty';
    daysCovered: number;
    totals: {
      meta: AdPlatformTotals;
      tiktok: AdPlatformTotals;
      google: AdPlatformTotals;
    };
    daily: AdDailyRow[];
  };
};

type AdminData = {
  todayTheme: string;
  contentPending: number;
  contentApproved: number;
  outreachActive: number;
  todayPosts: ContentPost[];
  outreachLeads: OutreachLead[];
  adSummary: AdSummary;
};

// ─── Constants ─────────────────────────────────────────────────────────────

const MF_ACCENT = '#FF7E00';
const SESSION_API = apiUrl('/api/axon/match-fit/session');
const DATA_API = apiUrl('/api/axon/match-fit/data');

const STATUS_COLORS: Record<string, string> = {
  pending_approval: 'bg-axon-gold/20 text-axon-gold',
  approved: 'bg-axon-success/20 text-axon-success',
  published: 'bg-axon-cyan/20 text-axon-cyan',
  sent: 'bg-axon-blue-bright/20 text-axon-blue-bright',
  approved_for_send: 'bg-axon-teal/20 text-axon-teal',
  dead: 'bg-white/10 text-axon-muted',
};

type Tab = 'content' | 'outreach' | 'ads';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'content', label: 'Content Calendar', icon: '📅' },
  { id: 'outreach', label: 'Outreach', icon: '◎' },
  { id: 'ads', label: 'Ad Tracking', icon: '📊' },
];

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div
      className="rounded-xl border border-white/10 bg-axon-surface p-4"
      style={{ borderTopColor: MF_ACCENT, borderTopWidth: 2 }}
    >
      <p className="text-xs text-axon-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-axon-muted">{sub}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? 'bg-white/10 text-axon-muted';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function DeepLinkRow({
  href,
  label,
  note,
}: {
  href: string;
  label: string;
  note?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3 transition hover:border-[#FF7E00]/40 hover:bg-white/10"
    >
      <span className="text-sm font-medium text-white">{label}</span>
      <span className="text-xs text-axon-muted">{note || 'Open →'}</span>
    </a>
  );
}

// ─── Content Calendar Tab ───────────────────────────────────────────────────

function ContentCalendarTab({ posts }: { posts: ContentPost[] }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-axon-muted">
          {posts.length} post{posts.length !== 1 ? 's' : ''} today
        </p>
        <a
          href={MF_ADMIN_LINKS.contentCalendar}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs transition hover:underline"
          style={{ color: MF_ACCENT }}
        >
          Open full calendar →
        </a>
      </div>

      {posts.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-axon-muted">
          No posts for today — Hermes batch runs 7 AM ET.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-axon-muted">
              <tr>
                <th className="px-4 py-2.5">Format</th>
                <th className="px-4 py-2.5">Theme</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Platforms</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id} className="border-t border-white/5 hover:bg-white/5">
                  <td className="px-4 py-2.5 font-medium text-white">{p.post_type}</td>
                  <td className="max-w-[180px] truncate px-4 py-2.5 text-axon-muted">
                    {p.theme_name}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-4 py-2.5 text-xs text-axon-muted">
                    {(p.platforms ?? []).join(' · ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="space-y-2 pt-2">
        <p className="text-xs font-medium uppercase tracking-wider text-axon-muted">
          Admin deep links
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <DeepLinkRow
            href={MF_ADMIN_LINKS.contentCalendar}
            label="Content Calendar"
            note="Approve · generate"
          />
          <DeepLinkRow
            href={MF_ADMIN_LINKS.contentPreview}
            label="Content Preview"
            note="Before publish"
          />
        </div>
      </section>
    </div>
  );
}

// ─── Outreach Tab ───────────────────────────────────────────────────────────

function OutreachTab({ leads }: { leads: OutreachLead[] }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-axon-muted">
          {leads.length} active lead{leads.length !== 1 ? 's' : ''}
        </p>
        <a
          href={MF_ADMIN_LINKS.outreach}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs transition hover:underline"
          style={{ color: MF_ACCENT }}
        >
          Open outreach HQ →
        </a>
      </div>

      {leads.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-axon-muted">
          No active outreach leads — check back after the next prospecting run.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-axon-muted">
              <tr>
                <th className="px-4 py-2.5">Handle</th>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Added</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} className="border-t border-white/5 hover:bg-white/5">
                  <td className="px-4 py-2.5 font-mono text-xs text-axon-cyan">
                    {l.instagram_handle ? `@${l.instagram_handle}` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-white">{l.full_name || '—'}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={l.status} />
                  </td>
                  <td className="px-4 py-2.5 text-xs text-axon-muted">
                    {new Date(l.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Ad Tracking Tab ────────────────────────────────────────────────────────

function formatUsd(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function AdTrackingTab({ summary }: { summary: AdSummary }) {
  const platforms = Object.entries(summary.byPlatform).sort((a, b) => b[1] - a[1]);
  const tracker = summary.tracker;
  const modeLabel =
    tracker?.mode === 'api'
      ? 'Live Ads API'
      : tracker?.mode === 'site_attribution'
        ? 'Site UTM attribution (spend pending API keys)'
        : 'No snapshots yet';

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Meta (30d)"
          value={
            tracker?.mode === 'api'
              ? formatUsd(tracker.totals.meta.spendCents)
              : tracker?.totals.meta.clicks ?? 0
          }
          sub={
            tracker?.mode === 'api'
              ? `${tracker.totals.meta.clicks} clicks · ${tracker.totals.meta.impressions} imps`
              : `${tracker?.totals.meta.clicks ?? 0} attributed page views`
          }
        />
        <StatCard
          label="TikTok (30d)"
          value={
            tracker?.mode === 'api'
              ? formatUsd(tracker.totals.tiktok.spendCents)
              : tracker?.totals.tiktok.clicks ?? 0
          }
          sub={
            tracker?.mode === 'api'
              ? `${tracker.totals.tiktok.clicks} clicks · ${tracker.totals.tiktok.impressions} imps`
              : `${tracker?.totals.tiktok.clicks ?? 0} attributed page views`
          }
        />
        <StatCard
          label="Tracker mode"
          value={tracker?.daysCovered ?? 0}
          sub={modeLabel}
        />
      </div>

      {tracker && tracker.daily.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wider text-axon-muted">
            Daily snapshots
          </p>
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-white/5 text-xs uppercase tracking-wider text-axon-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Day</th>
                  <th className="px-3 py-2 font-medium">Platform</th>
                  <th className="px-3 py-2 font-medium">Imps</th>
                  <th className="px-3 py-2 font-medium">Clicks / views</th>
                  <th className="px-3 py-2 font-medium">Spend</th>
                </tr>
              </thead>
              <tbody>
                {tracker.daily.map((row) => (
                  <tr key={`${row.platform}-${row.dayKey}-${row.source}`} className="border-t border-white/5">
                    <td className="px-3 py-2 text-axon-muted">{row.dayKey}</td>
                    <td className="px-3 py-2 capitalize text-white">{row.platform}</td>
                    <td className="px-3 py-2 text-axon-muted">{row.impressions}</td>
                    <td className="px-3 py-2 text-axon-muted">{row.clicks}</td>
                    <td className="px-3 py-2 text-axon-muted">
                      {row.source === 'api' ? formatUsd(row.spendCents) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {platforms.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wider text-axon-muted">
            Content posts by platform (30 days)
          </p>
          <div className="space-y-2">
            {platforms.map(([pl, count]) => {
              const pct = summary.totalLast30Days
                ? Math.round((count / summary.totalLast30Days) * 100)
                : 0;
              return (
                <div key={pl} className="flex items-center gap-3">
                  <span className="w-24 text-xs capitalize text-axon-muted">{pl}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-[#FF7E00]/60 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-xs text-axon-muted">{count}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-axon-muted">
          Log performance
        </p>
        <DeepLinkRow
          href={MF_ADMIN_LINKS.adTracking}
          label="Ad Tracking — Match Fit Admin"
          note="Sync / register campaigns →"
        />
      </section>
    </div>
  );
}

// ─── Login Form ─────────────────────────────────────────────────────────────

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [accessCode, setAccessCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(SESSION_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accessCode: accessCode.trim() }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || 'Access denied');
      } else {
        onSuccess();
      }
    } catch {
      setError('Network error — try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[420px] items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-axon-muted">AXON · Sector 1A</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Match Fit Admin</h1>
          <p className="mt-2 text-sm text-axon-muted">
            Enter your Match Fit admin access code to continue.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium uppercase tracking-wider text-axon-muted">
              Access Code
            </label>
            <input
              ref={inputRef}
              type="password"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              autoComplete="one-time-code"
              required
              className="w-full rounded-lg border border-axon-border bg-axon-surface px-4 py-2.5 text-sm text-white placeholder-axon-muted/50 outline-none transition focus:border-[#FF7E00]/60 focus:ring-1 focus:ring-[#FF7E00]/30"
              placeholder="Your access code"
            />
          </div>

          {error && (
            <p className="rounded-lg border border-axon-danger/30 bg-axon-danger/10 px-3 py-2 text-xs text-axon-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !accessCode.trim()}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50"
            style={{ background: loading ? 'rgba(255,126,0,0.4)' : MF_ACCENT }}
          >
            {loading ? 'Verifying…' : 'Continue'}
          </button>
        </form>

        <p className="text-center text-xs text-axon-muted">
          Access code is session-only and never stored in this browser or git.
        </p>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function MatchFitAdminTool() {
  const [showLaunch, setShowLaunch] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('content');
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (consumeToolLaunch('match-fit-admin')) setShowLaunch(true);
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch(SESSION_API);
      const json = await res.json();
      setAuthed(json.authed === true);
    } catch {
      setAuthed(false);
    } finally {
      setAuthChecked(true);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(DATA_API);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'data load failed');
      setData(json.data as AdminData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'data load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (authed) loadData();
  }, [authed, loadData]);

  async function handleSignOut() {
    await fetch(SESSION_API, { method: 'DELETE' });
    setAuthed(false);
    setData(null);
  }

  if (showLaunch) {
    return (
      <AxonToolLaunchOverlay
        toolName="Match Fit Admin"
        icon="🏋"
        onComplete={() => setShowLaunch(false)}
      />
    );
  }

  if (!authChecked) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <span className="text-sm text-axon-muted">Checking session…</span>
      </div>
    );
  }

  if (!authed) {
    return <LoginForm onSuccess={() => { setAuthed(true); }} />;
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <header className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-axon-muted">Ventures · Sector 1A</p>
          <h1 className="mt-1 text-2xl font-semibold text-white">Match Fit Admin</h1>
          <p className="mt-1 text-sm text-axon-muted">
            Live NI-Brain mirror of{' '}
            <a
              href="https://match-fit.net/admin"
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 hover:underline"
              style={{ color: MF_ACCENT }}
            >
              match-fit.net/admin
            </a>
          </p>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="rounded-lg px-3 py-1.5 text-xs text-axon-muted transition hover:bg-axon-elevated hover:text-white"
        >
          Sign out
        </button>
      </header>

      {/* Stat strip */}
      {data && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Today's theme" value={data.todayTheme} />
          <StatCard label="Content pending" value={data.contentPending} />
          <StatCard label="Content approved" value={data.contentApproved} />
          <StatCard label="Outreach active" value={data.outreachActive} />
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-axon-border">
        <nav className="-mb-px flex gap-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 border-b-2 pb-3 text-sm font-medium transition ${
                activeTab === t.id
                  ? 'border-[#FF7E00] text-white'
                  : 'border-transparent text-axon-muted hover:text-white'
              }`}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content area */}
      {loading && !data && (
        <div className="py-12 text-center text-sm text-axon-muted">Loading admin data…</div>
      )}

      {error && (
        <div className="rounded-lg border border-axon-danger/30 bg-axon-danger/10 px-4 py-3 text-sm text-axon-danger">
          {error} ·{' '}
          <button
            type="button"
            className="underline hover:no-underline"
            onClick={loadData}
          >
            Retry
          </button>
        </div>
      )}

      {data && !loading && (
        <>
          {activeTab === 'content' && <ContentCalendarTab posts={data.todayPosts} />}
          {activeTab === 'outreach' && <OutreachTab leads={data.outreachLeads} />}
          {activeTab === 'ads' && <AdTrackingTab summary={data.adSummary} />}
        </>
      )}

      {/* Refresh link */}
      {data && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="text-xs text-axon-muted transition hover:text-axon-text disabled:opacity-50"
          >
            {loading ? 'Refreshing…' : '↺ Refresh'}
          </button>
        </div>
      )}
      <AxonToolFooter toolSlug="match-fit-admin" />
    </div>
  );
}
