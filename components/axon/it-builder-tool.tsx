'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiUrl } from '@/lib/api-base';
import { getItSkeletonBySlug } from '@/lib/it-axon-skeleton';
import { appPath } from '@/lib/paths';

type BuilderMessage = { role: 'user' | 'assistant' | 'system'; content: string };

export function ItBuilderTool({ basePath }: { basePath?: string }) {
  const searchParams = useSearchParams();
  const slug = searchParams.get('slug') ?? '';
  const skeleton = slug ? getItSkeletonBySlug(slug) : undefined;
  const [messages, setMessages] = useState<BuilderMessage[]>([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [toolHref, setToolHref] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const dash = basePath ? appPath('/dashboard', basePath) : '/';

  useEffect(() => {
    if (!slug || !skeleton) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(apiUrl('/api/axon/it-builder'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'start', slug }),
        });
        const data = await r.json();
        if (cancelled || !data.ok) return;
        setSessionId(data.sessionId);
        setMessages(data.messages ?? []);
        if (data.toolHref) setToolHref(data.toolHref);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, skeleton]);

  async function send() {
    if (!input.trim() || !sessionId || loading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: userMsg }]);
    setLoading(true);
    try {
      const r = await fetch(apiUrl('/api/axon/it-builder'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'chat', sessionId, message: userMsg }),
      });
      const data = await r.json();
      if (data.ok) {
        setMessages((m) => [...m, { role: 'assistant', content: data.reply }]);
        if (data.toolHref) setToolHref(data.toolHref);
      }
    } finally {
      setLoading(false);
    }
  }

  if (!slug || !skeleton) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold text-white">AXON Tool Builder</h1>
        <p className="mt-2 text-sm text-axon-muted">
          Open this page from an IT&apos;s <strong className="text-axon-gold">MODIFY</strong> button in the sidebar.
        </p>
        <Link href={dash} className="mt-4 inline-block text-sm text-axon-gold hover:underline">
          ← Back to AXON Dash
        </Link>
      </div>
    );
  }

  const builtToolPath = toolHref ? (basePath ? appPath(toolHref, basePath) : toolHref) : null;

  return (
    <div className="flex h-[min(80vh,720px)] flex-col p-6">
      <header className="shrink-0 border-b border-axon-border pb-4">
        <p className="text-xs uppercase tracking-wider text-axon-muted">Coding AXON tool</p>
        <h1 className="text-xl font-semibold text-white">{skeleton.name} → AXON Toolbox</h1>
        <p className="mt-1 text-sm text-axon-muted">
          Skeleton status: <span className="text-axon-gold">{skeleton.skeletonStatus}</span> — full codegen UI ships next.
        </p>
        {builtToolPath && (
          <Link href={builtToolPath} className="mt-2 inline-block text-sm text-axon-gold hover:underline">
            Open AXON tool MVP →
          </Link>
        )}
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-4 axon-sidebar-scroll">
        {messages.map((m, i) => (
          <p
            key={i}
            className={`text-sm ${m.role === 'user' ? 'text-axon-gold' : 'text-axon-muted'}`}
          >
            <span className="font-medium">{m.role === 'user' ? 'You' : 'AXON Builder'}:</span> {m.content}
          </p>
        ))}
        {loading && <p className="text-xs text-axon-muted">Building…</p>}
      </div>

      <div className="shrink-0 flex gap-2 border-t border-axon-border pt-4">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Describe changes to your AXON tool…"
          className="flex-1 rounded-lg border border-axon-border bg-axon-elevated px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={send}
          disabled={loading || !sessionId}
          className="rounded-lg bg-axon-gold px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}
