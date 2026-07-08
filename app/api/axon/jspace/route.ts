import { NextResponse } from 'next/server';
import { createSupabaseClient } from '@/lib/supabase.mjs';
import { getJspaceState } from '@/lib/axon-j-space-core.mjs';
import { fetchRecentFindings } from '@/lib/axon-research-core.mjs';

export async function GET() {
  try {
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const { sbSelect } = createSupabaseClient(key);

    const [jspace, findings] = await Promise.all([
      getJspaceState(sbSelect),
      fetchRecentFindings(sbSelect, 'default', 8),
    ]);

    return NextResponse.json({ jspace, findings });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'J-space fetch failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
