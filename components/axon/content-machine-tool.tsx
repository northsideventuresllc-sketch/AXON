'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { apiUrl } from '@/lib/api-base';
import { appPath } from '@/lib/paths';
import {
  CONTENT_MIX,
  PLATFORM_LABELS,
  type ContentPlatform,
  type ContentPost,
} from '@/lib/axon-content-machine';
import { AxonToolFooter } from './axon-tool-footer';
import { FireGateNotice, FireModePill, useFireGate } from './fire-gate-banner';

const ACTIONS = [
  { key: 'approve', label: 'Approve', gated: false },
  { key: 'edit', label: 'Edit', gated: false },
  { key: 'adjust', label: 'Adjust', gated: false },
  { key: 'optimize', label: 'Optimize', gated: false },
  { key: 'publish', label: 'Publish', gated: true },
  { key: 'schedule', label: 'Schedule', gated: true },
] as const;

function platformLabel(p: string): string {
  return PLATFORM_LABELS[p as ContentPlatform] ?? p;
}

export function ContentMachineTool({ basePath }: { basePath?: string }) {
  const { mode } = useFireGate();
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const homeHref = basePath ? appPath('/', basePath) : '/';

  const load = useCallback(async () => {
    try {
      const r = await fetch(apiUrl('/api/axon/content-machine'), { cache: 'no-store' });
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || 'load failed');
      setPosts(data.posts || []);
      setLive(Boolean(data.live));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runAction(post: ContentPost, action: string, caption?: string) {
    setBusyId(post.id);
    setFlash(null);
    try {
      const r = await fetch(apiUrl('/api/axon/content-machine'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, postId: post.id, caption }),
      });
      const data = await r.json();
      if (r.status === 423) {
        setFlash(`Blocked: ${data.error}`);
        return;
      }
      if (!data.ok) throw new Error(data.error || 'action failed');
      setFlash(data.message);
      if (data.status) {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === post.id
              ? { ...p, status: data.status, caption: action === 'edit' && caption ? caption : p.caption }
              : p,
          ),
        );
      }
      setEditing(null);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  }

  const platforms: string[] = ['linkedin', 'instagram', 'facebook', 'threads'];

  return (
    <div className="axon-tool-enter space-y-8">
      <header>
        <Link href={homeHref} className="text-sm text-axon-muted hover:text-axon-gold">
          ← Back to AXON
        </Link>
        <p className="mt-3 text-xs uppercase tracking-[0.25em] text-axon-gold">AXON Tool</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold">NI Content Machine</h1>
          <FireModePill mode={mode} />
          <span className="rounded-full border border-axon-border px-2.5 py-0.5 text-[10px] uppercase tracking-wide text-axon-muted">
            {live ? 'Live · NI-Brain' : 'Fixtures'}
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-axon-muted">
          NORTHSiDE Intelligence content — product-first 3/2/2, one post per platform per day across
          LinkedIn, Instagram, Facebook and Threads. Reddit is handled in its own tool.
        </p>
      </header>

      <section>
        <h2 className="mb-3 text-lg font-medium">Weekly mix (3 / 2 / 2)</h2>
        <div className="grid grid-cols-3 gap-3">
          {CONTENT_MIX.map((m) => (
            <div key={m.key} className="rounded-xl border border-axon-border bg-axon-surface p-4">
              <p className="text-2xl font-semibold text-axon-cyan">{m.count}</p>
              <p className="mt-1 text-sm font-medium text-axon-text">{m.label}</p>
              <p className="mt-1 text-xs text-axon-muted">{m.hint}</p>
            </div>
          ))}
        </div>
      </section>

      <FireGateNotice mode={mode} action="Publishing / scheduling" />
      {flash && (
        <p className="rounded-lg border border-axon-border bg-axon-surface px-4 py-2.5 text-sm text-axon-text">
          {flash}
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-axon-muted">Loading drafts…</p>
      ) : (
        <div className="space-y-6">
          {platforms.map((platform) => {
            const group = posts.filter((p) => p.platform === platform);
            return (
              <section key={platform}>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-axon-muted">
                  {platformLabel(platform)} · {group.length} post{group.length === 1 ? '' : 's'}/day
                </h3>
                {group.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-axon-border p-6 text-center text-sm text-axon-muted">
                    No {platformLabel(platform)} draft today.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {group.map((post) => (
                      <div key={post.id} className="rounded-xl border border-axon-border bg-axon-surface p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-axon-blue/15 px-2 py-0.5 text-[10px] uppercase text-axon-cyan">
                            {post.pillar}
                          </span>
                          <span className="rounded-full bg-axon-elevated px-2 py-0.5 text-[10px] uppercase text-axon-muted">
                            {post.postType}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${
                              post.status === 'published'
                                ? 'bg-axon-success/15 text-axon-success'
                                : post.status === 'scheduled'
                                  ? 'bg-axon-teal/15 text-axon-teal'
                                  : post.status === 'approved'
                                    ? 'bg-axon-gold/15 text-axon-gold'
                                    : 'bg-axon-elevated text-axon-muted'
                            }`}
                          >
                            {String(post.status).replace(/_/g, ' ')}
                          </span>
                        </div>

                        {editing === post.id ? (
                          <div className="mt-3">
                            <textarea
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              rows={3}
                              className="w-full rounded-lg border border-axon-border bg-axon-elevated px-3 py-2 text-sm text-axon-text"
                            />
                            <div className="mt-2 flex gap-2">
                              <button
                                type="button"
                                disabled={busyId === post.id}
                                onClick={() => runAction(post, 'edit', draft)}
                                className="rounded-lg border border-axon-teal/40 bg-axon-teal/10 px-3 py-1.5 text-xs text-axon-teal hover:bg-axon-teal/20 disabled:opacity-50"
                              >
                                Save edit
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditing(null)}
                                className="rounded-lg border border-axon-border px-3 py-1.5 text-xs text-axon-muted hover:bg-axon-elevated"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-2 text-sm text-axon-text">{post.caption}</p>
                        )}

                        <div className="mt-3 flex flex-wrap gap-2">
                          {ACTIONS.map((a) => {
                            if (a.key === 'edit') {
                              return (
                                <button
                                  key={a.key}
                                  type="button"
                                  disabled={busyId === post.id}
                                  onClick={() => {
                                    setEditing(post.id);
                                    setDraft(post.caption);
                                  }}
                                  className="rounded-lg border border-axon-border px-3 py-1.5 text-xs text-axon-muted transition hover:border-axon-gold/40 hover:text-axon-text disabled:opacity-50"
                                >
                                  Edit
                                </button>
                              );
                            }
                            const blocked = a.gated && mode !== 'FIRE';
                            return (
                              <button
                                key={a.key}
                                type="button"
                                disabled={busyId === post.id || blocked}
                                title={blocked ? 'Blocked while on HOLD' : undefined}
                                onClick={() => runAction(post, a.key)}
                                className={`rounded-lg border px-3 py-1.5 text-xs transition disabled:opacity-40 ${
                                  a.gated
                                    ? 'border-axon-success/40 text-axon-success hover:bg-axon-success/10'
                                    : 'border-axon-border text-axon-muted hover:border-axon-gold/40 hover:text-axon-text'
                                }`}
                              >
                                {a.label}
                                {blocked ? ' 🔒' : ''}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <AxonToolFooter toolSlug="content-machine" basePath={basePath} />
    </div>
  );
}
