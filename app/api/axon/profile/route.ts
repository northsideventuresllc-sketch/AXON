import { NextResponse } from 'next/server';
import { getOperatorProfile, updateOperatorProfile, fetchTopSignals, fetchMemories } from '@/lib/axon-profile';

export async function GET() {
  try {
    const [profile, signals, memories] = await Promise.all([
      getOperatorProfile(),
      fetchTopSignals(undefined, 10),
      fetchMemories(undefined, 10),
    ]);
    return NextResponse.json({ profile, signals, memories });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load profile' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const allowed = ['input_mode', 'read_aloud', 'voice_id', 'voice_name'];
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No valid fields' }, { status: 400 });
    }
    await updateOperatorProfile('default', patch);
    const profile = await getOperatorProfile();
    return NextResponse.json({ profile });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Update failed' },
      { status: 500 }
    );
  }
}
