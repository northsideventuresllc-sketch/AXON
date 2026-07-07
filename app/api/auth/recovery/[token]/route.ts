import { NextResponse } from 'next/server';
import {
  ensureMasterAccount,
  validateRecoveryToken,
  verifySecurityQuestions,
  consumeRecoveryToken,
  clearLockout,
  getUserSecurity,
  getSecurityAnswersForRecovery,
} from '@/lib/axon-security';
import { getSecurityQuestionById } from '@/lib/axon-security-questions';
import { createSessionPayload, setSessionCookie } from '@/lib/axon-session';
import { DEFAULT_OPERATOR_ID } from '@/lib/axon-security-types';

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_req: Request, context: RouteContext) {
  try {
    await ensureMasterAccount();
    const { token } = await context.params;
    const validation = await validateRecoveryToken(token);

    if (!validation.valid) {
      return NextResponse.json({ valid: false, error: validation.error }, { status: 400 });
    }

    const answers = await getSecurityAnswersForRecovery();
    const questions = answers.map((q) => {
      const question = getSecurityQuestionById(q.question_id);
      return { questionId: q.question_id, text: question?.question || q.question_id };
    });

    return NextResponse.json({ valid: true, questions });
  } catch (err) {
    console.error('recovery GET', err);
    return NextResponse.json({ error: 'Validation failed' }, { status: 500 });
  }
}

export async function POST(req: Request, context: RouteContext) {
  try {
    await ensureMasterAccount();
    const { token } = await context.params;
    const validation = await validateRecoveryToken(token);

    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const { answers } = await req.json();
    if (!Array.isArray(answers)) {
      return NextResponse.json({ error: 'answers array required' }, { status: 400 });
    }

    const result = await verifySecurityQuestions(answers);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }

    await consumeRecoveryToken(token);
    await clearLockout();

    const user = await getUserSecurity();
    const session = createSessionPayload(DEFAULT_OPERATOR_ID, user.display_name, {
      deviceId: 'recovery',
      securityVerified: true,
      totpVerified: !user.two_fa_enabled,
    });
    await setSessionCookie(session);

    return NextResponse.json({ ok: true, displayName: user.display_name });
  } catch (err) {
    console.error('recovery POST', err);
    return NextResponse.json({ error: 'Recovery failed' }, { status: 500 });
  }
}
