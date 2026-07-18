'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { appPath } from '@/lib/paths';
import { USAGE_CONNECTORS, USAGE_VENTURES, type UsageConnector } from '@/lib/axon-tools-data';
import { AxonToolFooter } from './axon-tool-footer';
import { learnStepClient } from '@/lib/axon-step-learn-client';

type Window = 'spendDay' | 'spendWeek' | 'spendMonth' | 'spendYear';

const WINDOWS: { key: Window; label: string }[] = [
  { key: 'spendDay', label: 'Day' },
  { key: 'spendWeek', label: 'Week' },
  { key: 'spendMonth', label: 'Month' },
  { key: 'spendYear', label: 'Year' },
];

const CATEGORY_LABELS: Record<UsageConnector['category'], string> = {
  ai: 'AI models',
  infra: 'Infrastructure',
  comms: 'Comms',
  creative: 'Creative',
  data: 'Data',
  local: 'Local',
};

function money(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function UsageTowerTool({ basePath }: { basePath?: string }) {
  const [win, setWin] = useState<Window>('spendMonth');
  const [caps, setCaps] = useState<Record<string, number | null>>(
    Object.fromEntries(USAGE_CONNECTORS.map((c) => [c.id, c.capMonthly])),
  );
  const [chat, setChat] = useState<{ role: 'user' | 'axon'; text: string }[]>([
    {
      role: 'axon',
      text: 'Ask me how to trim spend — e.g. "where is the waste?" or "cap creative to $400".',
    },
  ]);
  const [input, setInput] = useState('');

  const homeHref = basePath ? appPath('/', basePath) : '/';

  const totals = useMemo(() => {
    const total = USAGE_CONNECTORS.reduce((sum, c) => sum + c[win], 0);
    const byVenture = Object.fromEntries(USAGE_VENTURES.map((v) => [v, 0])) as Record<string, number>;
    for (const c of USAGE_CONNECTORS) {
      const v = USAGE_VENTURES.includes(c.venture as (typeof USAGE_VENTURES)[number]) ? c.venture : 'Unknown';
      byVenture[v] += c[win];
    }
    return { total, byVenture };
  }, [win]);

  function sendChat() {
    const q = input.trim();
    if (!q) return;
    const top = [...USAGE_CONNECTORS].sort((a, b) => b.spendMonth - a.spendMonth)[0];
    const reply = `Biggest line item is ${top.label} at ${money(top.spendMonth)}/mo (${top.venture}). Consider a monthly cap and routing cheaper calls to Gemini/local. Once the FIRE gate is live I can enforce caps automatically.`;
    setChat((prev) => [...prev, { role: 'user', text: q }, { role: 'axon', text: reply }]);
    setInput('');
    // Learn which cost questions JB asks + which tip was surfaced.
    learnStepClient({
      tool: 'usage-tower',
      step: 'cost-tip',
      after: `tip: trim ${top.label}`,
      venture: top.venture,
      meta: { question: q },
    });
  }

  function recordCapChange(connector: UsageConnector, next: number | null) {
    const previous = connector.capMonthly;
    if (next === previous) return;
    learnStepClient({
      tool: 'usage-tower',
      step: 'cap-change',
      before: previous == null ? 'none' : previous,
      after: next == null ? 'none' : next,
      venture: connector.venture,
      meta: { connector: connector.label, connectorId: connector.id },
    });
  }

  return (
    <div className="axon-tool-enter space-y-8">
      <header>
        <Link href={homeHref} className="text-sm text-axon-muted hover:text-axon-gold">
          ← Back to AXON
        </Link>
        <p className="mt-3 text-xs uppercase tracking-[0.25em] text-axon-gold">AXON Tool</p>
        <h1 className="mt-1 text-3xl font-semibold">Usage Tower</h1>
        <p className="mt-2 max-w-2xl text-sm text-axon-muted">
          Every AI + platform connector, spend by window, attributed to a venture. Set caps and ask
          AXON where to trim.
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex rounded-lg border border-axon-border bg-axon-surface p-1">
          {WINDOWS.map((w) => (
            <button
              key={w.key}
              type="button"
              onClick={() => setWin(w.key)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                win === w.key ? 'bg-axon-blue/20 text-axon-cyan' : 'text-axon-muted hover:text-axon-text'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
        <div className="rounded-xl border border-axon-border bg-axon-surface px-5 py-3 text-right">
          <p className="text-xs text-axon-muted">Total spend ({WINDOWS.find((w) => w.key === win)?.label})</p>
          <p className="text-2xl font-semibold text-axon-text">{money(totals.total)}</p>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-medium">Venture attribution</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {USAGE_VENTURES.map((v) => (
            <div
              key={v}
              className={`rounded-xl border p-4 ${
                v === 'Unknown'
                  ? 'border-axon-gold/30 bg-axon-gold/5'
                  : 'border-axon-border bg-axon-surface'
              }`}
            >
              <p className="text-xs text-axon-muted">{v}</p>
              <p className="mt-1 text-lg font-semibold text-axon-text">{money(totals.byVenture[v])}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Connector registry + caps</h2>
        <div className="overflow-hidden rounded-xl border border-axon-border bg-axon-surface">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-wider text-axon-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Connector</th>
                <th className="px-4 py-2.5 font-medium">Category</th>
                <th className="px-4 py-2.5 font-medium">Venture</th>
                <th className="px-4 py-2.5 text-right font-medium">
                  Spend ({WINDOWS.find((w) => w.key === win)?.label})
                </th>
                <th className="px-4 py-2.5 text-right font-medium">Monthly cap</th>
              </tr>
            </thead>
            <tbody>
              {USAGE_CONNECTORS.map((c) => {
                const cap = caps[c.id];
                const over = cap != null && c.spendMonth > cap;
                return (
                  <tr key={c.id} className="border-t border-white/5">
                    <td className="px-4 py-3 font-medium text-axon-text">{c.label}</td>
                    <td className="px-4 py-3 text-xs text-axon-muted">{CATEGORY_LABELS[c.category]}</td>
                    <td className="px-4 py-3 text-xs">
                      <span
                        className={
                          c.venture === 'Unknown' ? 'text-axon-gold' : 'text-axon-muted'
                        }
                      >
                        {c.venture}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-right font-mono text-xs ${over ? 'text-axon-danger' : 'text-axon-text'}`}>
                      {money(c[win])}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        value={cap ?? ''}
                        placeholder="none"
                        onChange={(e) =>
                          setCaps((prev) => ({
                            ...prev,
                            [c.id]: e.target.value === '' ? null : Number(e.target.value),
                          }))
                        }
                        onBlur={(e) =>
                          recordCapChange(c, e.target.value === '' ? null : Number(e.target.value))
                        }
                        className="w-24 rounded-md border border-axon-border bg-axon-elevated px-2 py-1 text-right text-xs text-axon-text"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-axon-muted">
          Caps are editable here now; enforcement (throttle / alert) activates once connectors are
          wired and the FIRE gate is live.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Optimize efficiency</h2>
        <div className="rounded-xl border border-axon-border bg-axon-surface p-4">
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {chat.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  m.role === 'user'
                    ? 'ml-auto bg-axon-blue/15 text-axon-text'
                    : 'bg-axon-elevated text-axon-muted'
                }`}
              >
                {m.text}
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') sendChat();
              }}
              placeholder="Ask AXON how to cut spend…"
              className="flex-1 rounded-lg border border-axon-border bg-axon-elevated px-3 py-2 text-sm text-axon-text"
            />
            <button
              type="button"
              onClick={sendChat}
              className="rounded-lg border border-axon-blue/40 bg-axon-blue/10 px-4 py-2 text-sm font-medium text-axon-cyan transition hover:bg-axon-blue/20"
            >
              Send
            </button>
          </div>
        </div>
      </section>

      <AxonToolFooter toolSlug="usage-tower" basePath={basePath} />
    </div>
  );
}
