import { NextResponse } from 'next/server';
import { createSupabaseClient } from '@/lib/supabase.mjs';

export interface BrainNode {
  id: string;
  label: string;
  kind: 'decision' | 'learning' | 'context' | 'hub';
  at: string | null;
}

export interface BrainTable {
  key: 'decisions' | 'learnings' | 'context';
  label: string;
  kind: BrainNode['kind'];
  source: string;
  count: number;
}

// Serves the 3D brain graph: recent Decisions / Learnings / Context rows as
// glowing nodes, linked hub-and-spoke by kind plus chronological threads.
// Also returns `tables` metadata so the CLI can render an "organization tables"
// view. Never 500s in a way that breaks the client — on error returns empties.
export async function GET() {
  try {
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const { sbSelect } = createSupabaseClient(key) as {
      sbSelect: (t: string, f?: string) => Promise<any[]>;
    };

    const [decisions, learnings, context] = await Promise.all([
      sbSelect('Decisions', 'select=id,decision,date&order=date.desc&limit=45').catch(() => []),
      sbSelect('Learnings', 'select=id,learning,date&order=date.desc&limit=45').catch(() => []),
      sbSelect('Context', 'select=id,content,updated_at&order=updated_at.desc&limit=20').catch(() => []),
    ]);

    const nodes: BrainNode[] = [
      { id: 'hub:decisions', label: 'Decisions', kind: 'hub', at: null },
      { id: 'hub:learnings', label: 'Learnings', kind: 'hub', at: null },
      { id: 'hub:context', label: 'Context', kind: 'hub', at: null },
    ];
    const links: Array<{ source: string; target: string }> = [
      { source: 'hub:decisions', target: 'hub:learnings' },
      { source: 'hub:learnings', target: 'hub:context' },
      { source: 'hub:context', target: 'hub:decisions' },
    ];

    const addGroup = (
      rows: any[],
      kind: BrainNode['kind'],
      hub: string,
      text: (r: any) => string,
      at: (r: any) => string | null
    ) => {
      let prev: string | null = null;
      for (const r of rows) {
        const id = `${kind}:${r.id}`;
        nodes.push({ id, label: String(text(r) || '').slice(0, 140), kind, at: at(r) });
        links.push({ source: hub, target: id });
        if (prev) links.push({ source: prev, target: id });
        prev = id;
      }
    };
    addGroup(decisions, 'decision', 'hub:decisions', (r) => r.decision, (r) => r.date);
    addGroup(learnings, 'learning', 'hub:learnings', (r) => r.learning, (r) => r.date);
    addGroup(context, 'context', 'hub:context', (r) => r.content, (r) => r.updated_at);

    const tables: BrainTable[] = [
      {
        key: 'decisions',
        label: 'Decisions',
        kind: 'decision',
        source: 'NI-Brain · Decisions',
        count: decisions.length,
      },
      {
        key: 'learnings',
        label: 'Learnings',
        kind: 'learning',
        source: 'NI-Brain · Learnings',
        count: learnings.length,
      },
      {
        key: 'context',
        label: 'Context',
        kind: 'context',
        source: 'NI-Brain · Context',
        count: context.length,
      },
    ];

    return NextResponse.json({ nodes, links, tables });
  } catch (err) {
    // Fail safe: never break the client. Return empty graph + tables.
    return NextResponse.json({
      nodes: [],
      links: [],
      tables: [],
      error: err instanceof Error ? err.message : 'Failed to load brain graph',
    });
  }
}
