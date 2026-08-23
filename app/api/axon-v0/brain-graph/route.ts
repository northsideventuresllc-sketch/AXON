import { NextResponse } from 'next/server';
import { createSupabaseClient } from '@/lib/supabase.mjs';

export interface BrainNode {
  id: string;
  label: string;
  kind: 'decision' | 'learning' | 'context' | 'hub';
  at: string | null;
}

// Serves the 3D brain graph: recent Decisions / Learnings / Context rows as
// glowing nodes, linked hub-and-spoke by kind plus chronological threads.
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

    const addGroup = (rows: any[], kind: BrainNode['kind'], hub: string, text: (r: any) => string, at: (r: any) => string | null) => {
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

    return NextResponse.json({ nodes, links });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load brain graph' },
      { status: 500 }
    );
  }
}
