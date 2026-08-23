import { NextResponse } from 'next/server';
import { createSupabaseClient } from '@/lib/supabase.mjs';

export async function GET() {
  try {
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const { sbSelect } = createSupabaseClient(key) as {
      sbSelect: (t: string, f?: string) => Promise<any[]>;
    };
    const rows = await sbSelect(
      'ni_notifications',
      'select=id,title,body,category,created_at&order=created_at.desc&limit=30'
    ).catch(() => []);
    return NextResponse.json({ notifications: rows });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load notifications' },
      { status: 500 }
    );
  }
}
