import { NextResponse } from 'next/server';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import {
  ensureMasterAccount,
  getUserSecurity,
  needsSecuritySetup,
  needsSecurityVerifyForLogin,
} from '@/lib/axon-security';
import { verifyPasskeyLogin } from '@/lib/axon-passkey';
import { createSessionPayload, setSessionCookie } from '@/lib/axon-session';
import { DEFAULT_OPERATOR_ID } from '@/lib/axon-security-types';

export async function POST(req: Request) {
  try {
    await ensureMasterAccount();

    const body = (await req.json()) as AuthenticationResponseJSON & { deviceId?: string };
    const result = await verifyPasskeyLogin(body);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }

    const user = await getUserSecurity();

    const session = createSessionPayload(DEFAULT_OPERATOR_ID, result.displayName, {
      deviceId: body.deviceId || 'passkey',
      securityVerified: !needsSecurityVerifyForLogin(user, body.deviceId),
      totpVerified: !user.two_fa_enabled,
    });
    await setSessionCookie(session);

    return NextResponse.json({
      ok: true,
      displayName: result.displayName,
      needsSecuritySetup: needsSecuritySetup(user),
      needsSecurityVerify: needsSecurityVerifyForLogin(user, body.deviceId),
      needs2FA: user.two_fa_enabled,
    });
  } catch (err) {
    console.error('passkey/login/verify', err);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
