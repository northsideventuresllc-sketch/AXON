import { NextResponse } from 'next/server';
import {
  ensureMasterAccount,
  verifyPasscode,
  computeLockoutState,
  getUserSecurity,
  mapLockoutForClient,
} from '@/lib/axon-security';
import { verifyTurnstileToken } from '@/lib/turnstile';
import { createSessionPayload, setSessionCookie } from '@/lib/axon-session';
import { DEFAULT_OPERATOR_ID } from '@/lib/axon-security-types';

export async function POST(req: Request) {
  try {
    await ensureMasterAccount();

    const body = await req.json();
    const { passcode, turnstileToken, deviceId } = body as {
      passcode?: string;
      turnstileToken?: string;
      deviceId?: string;
    };

    const remoteIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const turnstile = await verifyTurnstileToken(turnstileToken || '', remoteIp);
    if (!turnstile.success && process.env.TURNSTILE_SECRET_KEY) {
      return NextResponse.json({ error: 'Turnstile verification failed' }, { status: 403 });
    }

    if (!passcode) {
      return NextResponse.json({ error: 'Passcode required' }, { status: 400 });
    }

    const user = await getUserSecurity();
    const lockout = mapLockoutForClient(computeLockoutState(user));
    if (lockout.locked) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Account locked',
          lockout,
          needsSecuritySetup: !user.security_questions_set_at,
          needsSecurityVerify: false,
          displayName: user.display_name,
        },
        { status: 423 }
      );
    }

    const result = await verifyPasscode(passcode, DEFAULT_OPERATOR_ID, {
      deviceId: deviceId || undefined,
      userAgent: req.headers.get('user-agent') || undefined,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          lockout: result.lockout ? mapLockoutForClient(result.lockout) : undefined,
          needsSecuritySetup: result.needsSecuritySetup,
          needsSecurityVerify: result.needsSecurityVerify,
          displayName: result.displayName,
        },
        { status: 401 }
      );
    }

    const refreshed = await getUserSecurity();
    const session = createSessionPayload(DEFAULT_OPERATOR_ID, result.displayName, {
      deviceId: deviceId || 'unknown',
      securityVerified: !result.needsSecurityVerify,
      totpVerified: !refreshed.two_fa_enabled,
    });
    await setSessionCookie(session);

    return NextResponse.json({
      ok: true,
      needsSecuritySetup: result.needsSecuritySetup,
      needsSecurityVerify: result.needsSecurityVerify,
      displayName: result.displayName,
      deviceId: deviceId || null,
    });
  } catch (err) {
    console.error('passcode/verify', err);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
