'use client';

import Link from 'next/link';
import { useState } from 'react';
import { appPath } from '@/lib/paths';
import {
  REDDIT_ACCOUNT,
  REDDIT_PROMO_QUEUE,
  REDDIT_REPLY_QUEUE,
  type RedditQueueItem,
  type TelegramApprovalStatus,
} from '@/lib/axon-tools-data';
import { AxonToolFooter } from './axon-tool-footer';
import { FireGateNotice, FireModePill, useFireGate } from './fire-gate-banner';

const TELEGRAM_STATUS: Record<
  TelegramApprovalStatus,
  { label: string; className: string }
> = {
  awaiting: { label: 'Awaiting Telegram', className: 'bg-axon-gold/15 text-axon-gold' },
  approved: { label: 'Approved via Telegram', className: 'bg-axon-success/15 text-axon-success' },
  rejected: { label: 'Rejected via Telegram', className: 'bg-axon-danger/15 text-axon-danger' },
};

export function RedditQueuesTool({ basePath }: { basePath?: string }) {
  const { mode } = useFireGate();
  const [promo] = useState<RedditQueueItem[]>(REDDIT_PROMO_QUEUE);
  const [replies] = useState<RedditQueueItem[]>(REDDIT_REPLY_QUEUE);
  const homeHref = basePath ? appPath('/', basePath) : '/';

  return (
    <div className="axon-tool-enter space-y-8">
      <header>
        <Link href={homeHref} className="text-sm text-axon-muted hover:text-axon-gold">
          ← Back to AXON
        </Link>
        <p className="mt-3 text-xs uppercase tracking-[0.25em] text-axon-gold">AXON Tool</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold">Reddit Queues</h1>
          <FireModePill mode={mode} />
          <span className="rounded-full border border-axon-border px-2.5 py-0.5 text-xs font-mono text-axon-muted">
            {REDDIT_ACCOUNT}
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-axon-muted">
          Two queues for Reddit — promotional posts and thread replies. Each item is approved over
          Telegram before anything posts. Nothing goes live while AXON is on HOLD.
        </p>
      </header>

      <FireGateNotice mode={mode} action="Posting to Reddit" />

      <RedditQueue title="Promo posts" items={promo} mode={mode} />
      <RedditQueue title="Thread replies" items={replies} mode={mode} />

      <AxonToolFooter toolSlug="reddit" basePath={basePath} />
    </div>
  );
}

function RedditQueue({
  title,
  items,
  mode,
}: {
  title: string;
  items: RedditQueueItem[];
  mode: 'HOLD' | 'FIRE';
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-lg font-medium">{title}</h2>
        <span className="text-xs text-axon-muted">
          {items.length} item{items.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="space-y-3">
        {items.map((item) => {
          const tg = TELEGRAM_STATUS[item.telegramStatus];
          const canPost = mode === 'FIRE' && item.telegramStatus === 'approved';
          return (
            <div key={item.id} className="rounded-xl border border-axon-border bg-axon-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs text-axon-cyan">{item.subreddit}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] uppercase ${tg.className}`}>
                  {tg.label}
                </span>
              </div>
              <p className="mt-2 text-sm font-medium text-axon-text">{item.title}</p>
              {item.parentContext && (
                <p className="mt-1 text-xs italic text-axon-muted">Context: {item.parentContext}</p>
              )}
              <p className="mt-1.5 text-sm text-axon-muted">{item.body}</p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={!canPost}
                  title={!canPost ? 'Needs Telegram approval + FIRE' : undefined}
                  className="rounded-lg border border-axon-success/40 px-3 py-1.5 text-xs text-axon-success transition hover:bg-axon-success/10 disabled:opacity-40"
                >
                  Post now{!canPost ? ' 🔒' : ''}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-axon-border px-3 py-1.5 text-xs text-axon-muted transition hover:border-axon-gold/40 hover:text-axon-text"
                >
                  Preview
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
