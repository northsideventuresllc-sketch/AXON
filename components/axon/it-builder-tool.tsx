'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiUrl } from '@/lib/api-base';
import { getItSkeletonBySlug } from '@/lib/it-axon-skeleton';
import { AXON_USER_TOOLS } from '@/lib/axon-user-tools';
import { getAxonToolMeta } from '@/lib/axon-tool-meta';
import { appPath } from '@/lib/paths';

type BuilderMessage = { role: 'user' | 'assistant' | 'system'; content: string };

export function ItBuilderTool({ basePath }: { basePath?: string }) {
  const searchParams = useSearchParams();
  const slug = searchParams.get('slug') ?? '';
  const axonTool = searchParams.get('axonTool') ?? '';
  const skeleton = slug ? getItSkeletonBySlug(slug) : undefined;
  const axonToolDef = axonTool ? AXON_USER_TOOLS.find((t) => t.slug === axonTool) : undefined;
  const axonMeta = axonToolDef ? getAxonToolMeta(axonToolDef) : null;
  const [messages, setMessages] = useState<BuilderMessage[]>([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [toolHref, setToolHref] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const dash = basePath ? appPath('/dashboard', basePath) : '/';
  const mode = axonTool && axonMeta ? 'axon-tool' : slug && skeleton ? 'it' : null;

  useEffect(() => {
    if (!mode) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const body =
          mode === 'axon-tool'
            ? { action: 'start', axonTool }
            : { action: 'start', slug };
        const r = await fetch(apiUrl('/api/axon/it-builder'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
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
  }, [mode, slug, skeleton, axonTool, axonMeta]);

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

  if (!mode) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold text-white">AXON Tool Builder</h1>
        <p className="mt-2 text-sm text-axon-muted">
          Open from an IT&apos;s <strong className="text-axon-gold">MODIFY</strong> button or an AXON
          tool&apos;s <strong className="text-axon-gold">Adjust Functionality</strong> link.
        </p>
        <Link href={dash} className="mt-4 inline-block text-sm text-axon-gold hover:underline">
          ← Back to AXON Dash
        </Link>
      </div>
    );
  }

  const title =
    mode === 'axon-tool'
      ? `${axonToolDef?.defaultDisplayName ?? axonTool} → Adjust`
      : `${skeleton?.name} → AXON Toolbox`;

  const builtToolPath = toolHref ? (basePath ? appPath(toolHref, basePath) : toolHref) : null;

  return (
    <div className="flex h-[min(80vh,720px)] flex-col p-6">
      <header className="shrink-0 border-b border-axon-border pb-4">
        <p className="text-xs uppercase tracking-wider text-axon-muted">Coding AXON tool</p>
        <h1 className="text-xl font-semibold text-white">{title}</h1>
        {axonMeta && (
          <p className="mt-1 text-sm text-axon-muted">{axonMeta.setupDescription}</p>
        )}
        {mode === 'it' && skeleton && (
          <p className="mt-1 text-sm text-axon-muted">
            Skeleton status: <span className="text-axon-gold">{skeleton.skeletonStatus}</span>
          </p>
        )}
        {builtToolPath && (
          <Link href={builtToolPath} className="mt-2 inline-block text-sm text-axon-gold hover:underline">
            Open tool →
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
