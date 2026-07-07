import { NextResponse } from 'next/server';
import { ensureMasterAccount } from '@/lib/axon-security';

/**
 * Legacy login endpoint — deprecated in favor of /api/auth/passcode/verify.
 * Returns 410 with redirect hint for clients still calling the old route.
 */
export async function POST() {
  await ensureMasterAccount();
  return NextResponse.json(
    {
      error: 'Deprecated — use POST /api/auth/passcode/verify',
      redirect: '/api/auth/passcode/verify',
    },
    { status: 410 }
  );
}
