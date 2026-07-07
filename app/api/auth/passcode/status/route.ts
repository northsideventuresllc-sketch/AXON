import { NextResponse } from 'next/server';
import { ensureMasterAccount, getAuthStatus, mapLockoutForClient } from '@/lib/axon-security';

export async function GET() {
  try {
    await ensureMasterAccount();
    const status = await getAuthStatus();
    return NextResponse.json({
      locked: status.lockout.locked,
      lockoutUntil: status.lockout.locked_until,
      attemptsRemaining: status.lockout.attemptsRemaining ?? status.lockout.tries_remaining_in_phase,
      failedAttempts: status.lockout.failedAttempts ?? 0,
      lockoutPhase: status.lockout.lockout_phase,
      requiresSecurityQuestions: status.lockout.requires_security_questions,
      needsSecuritySetup: status.needsSecuritySetup,
      needsSecurityVerify: status.needsSecurityVerify,
      displayName: status.displayName,
      totpEnabled: status.totpEnabled,
      hasPasskeys: status.hasPasskeys,
    });
  } catch (err) {
    console.error('passcode/status', err);
    return NextResponse.json({ error: 'Failed to get status' }, { status: 500 });
  }
}
