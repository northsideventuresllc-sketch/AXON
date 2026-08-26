'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { apiUrl } from '@/lib/api-base';
import './brain.css';

interface CliNode {
  id: string;
  kind: 'hub' | 'decision' | 'learning' | 'context';
  label: string;
  at?: string | null;
}
interface CliTable {
  key: string;
  label: string;
  kind: string;
  source: string;
  count: number;
}

interface BrainCliProps {
  // If provided, the CLI uses these instead of self-fetching (avoids a double load).
  nodes?: CliNode[];
  tables?: CliTable[];
  onFocus?: (id: string) => void;
}

interface Line {
  kind: 'in' | 'out' | 'err';
  text: string;
}

const HELP = [
  'AXON BRAIN CONSOLE — read-only',
  '  help            show this help',
  '  ls              list organization tables + counts',
  '  ls <table>      list rows in a table (decisions|learnings|context)',
  '  tables          same as ls',
  '  find <text>     search every memory for text',
  '  open <id>       inspect a node and fly the graph to it',
  '  clear           clear the console',
].join('\n');

export function BrainCli({ nodes: nodesProp, tables: tablesProp, onFocus }: BrainCliProps) {
  const [nodes, setNodes] = useState<CliNode[]>(nodesProp || []);
  const [tables, setTables] = useState<CliTable[]>(tablesProp || []);
  const [lines, setLines] = useState<Line[]>([
    { kind: 'out', text: 'NI-Brain link established. Type `help` to begin.' },
  ]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [hIdx, setHIdx] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Self-fetch only if the parent didn't hand us data.
  useEffect(() => {
    if (nodesProp && nodesProp.length) {
      setNodes(nodesProp);
      return;
    }
    let alive = true;
    fetch(apiUrl('/api/axon-v0/brain-graph'))
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setNodes(d.nodes || []);
        if (!tablesProp?.length) setTables(d.tables || []);
      })
      .catch(() => void 0);
    return () => {
      alive = false;
    };
  }, [nodesProp, tablesProp]);

  useEffect(() => {
    if (nodesProp?.length) setNodes(nodesProp);
  }, [nodesProp]);
  useEffect(() => {
    if (tablesProp?.length) setTables(tablesProp);
  }, [tablesProp]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines]);

  const memNodes = useMemo(() => nodes.filter((n) => n.kind !== 'hub'), [nodes]);

  const emit = (out: Line[]) => setLines((prev) => [...prev, ...out]);

  const run = (raw: string) => {
    const cmd = raw.trim();
    const echo: Line = { kind: 'in', text: cmd };
    if (!cmd) {
      emit([echo]);
      return;
    }
    const [verb, ...rest] = cmd.split(/\s+/);
    const arg = rest.join(' ');
    const out: Line[] = [echo];

    switch (verb.toLowerCase()) {
      case 'help':
        out.push({ kind: 'out', text: HELP });
        break;
      case 'clear':
        setLines([]);
        setInput('');
        return;
      case 'tables':
      case 'ls': {
        if (!arg) {
          if (!tables.length) {
            out.push({ kind: 'out', text: 'no tables loaded yet.' });
          } else {
            out.push({ kind: 'out', text: 'ORGANIZATION TABLES' });
            tables.forEach((t) =>
              out.push({ kind: 'out', text: `  ${t.label.padEnd(12)} ${String(t.count).padStart(3)}  ${t.source}` })
            );
          }
        } else {
          const key = arg.toLowerCase().replace(/s$/, '');
          const rows = memNodes.filter((n) => n.kind === key || n.kind === key + '');
          const match = memNodes.filter((n) => n.kind.startsWith(key));
          const list = rows.length ? rows : match;
          if (!list.length) {
            out.push({ kind: 'err', text: `no rows for "${arg}" (try: decisions | learnings | context)` });
          } else {
            list.slice(0, 40).forEach((n) =>
              out.push({ kind: 'out', text: `  ${n.id.padEnd(18)} ${n.label.slice(0, 60)}` })
            );
            if (list.length > 40) out.push({ kind: 'out', text: `  … ${list.length - 40} more` });
          }
        }
        break;
      }
      case 'find': {
        if (!arg) {
          out.push({ kind: 'err', text: 'usage: find <text>' });
          break;
        }
        const q = arg.toLowerCase();
        const hits = memNodes.filter((n) => n.label.toLowerCase().includes(q));
        if (!hits.length) out.push({ kind: 'out', text: `no memories match "${arg}".` });
        else {
          out.push({ kind: 'out', text: `${hits.length} match(es):` });
          hits.slice(0, 30).forEach((n) =>
            out.push({ kind: 'out', text: `  [${n.kind}] ${n.id.padEnd(18)} ${n.label.slice(0, 56)}` })
          );
        }
        break;
      }
      case 'open': {
        if (!arg) {
          out.push({ kind: 'err', text: 'usage: open <id>' });
          break;
        }
        const node =
          nodes.find((n) => n.id === arg) ||
          nodes.find((n) => n.id.toLowerCase() === arg.toLowerCase()) ||
          memNodes.find((n) => n.label.toLowerCase().includes(arg.toLowerCase()));
        if (!node) {
          out.push({ kind: 'err', text: `not found: ${arg}` });
        } else {
          out.push({ kind: 'out', text: `┌ ${node.kind.toUpperCase()}  ${node.id}` });
          out.push({ kind: 'out', text: `│ ${node.label}` });
          if (node.at) out.push({ kind: 'out', text: `└ ${new Date(node.at).toLocaleString()}` });
          onFocus?.(node.id);
        }
        break;
      }
      default:
        out.push({ kind: 'err', text: `unknown command: ${verb} — type \`help\`` });
    }

    emit(out);
    setHistory((h) => [cmd, ...h].slice(0, 50));
    setHIdx(-1);
    setInput('');
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      run(input);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(history.length - 1, hIdx + 1);
      if (history[next] !== undefined) {
        setHIdx(next);
        setInput(history[next]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = hIdx - 1;
      if (next < 0) {
        setHIdx(-1);
        setInput('');
      } else {
        setHIdx(next);
        setInput(history[next] || '');
      }
    }
  };

  return (
    <section className="v0-panel bn-cli flex h-full flex-col p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/70">Console</p>
        <span className="bn-cli-dim text-[10px]">supabase · ni-brain</span>
      </div>
      <div ref={scrollRef} className="v0-scroll bn-cli-out flex-1 overflow-y-auto pr-1">
        {lines.map((l, i) => (
          <div key={i} className={l.kind === 'err' ? 'text-rose-300' : l.kind === 'in' ? 'text-slate-100' : 'text-slate-400'}>
            {l.kind === 'in' ? <span className="bn-cli-prompt">{'> '}</span> : null}
            {l.text}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2 border-t border-cyan-400/10 pt-2">
        <span className="bn-cli-prompt">{'>'}</span>
        <input
          className="bn-cli-in"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder="help · ls · find <text> · open <id>"
          spellCheck={false}
          autoComplete="off"
          aria-label="Brain console input"
        />
        <span className="bn-cursor" aria-hidden />
      </div>
    </section>
  );
}
