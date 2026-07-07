import { NextResponse } from 'next/server';
import { AXON_SECURITY_QUESTIONS } from '@/lib/axon-security-questions';
import {
  ensureMasterAccount,
  saveSecurityQuestions,
  getSecurityAnswersForRecovery,
} from '@/lib/axon-security';
import { getSessionFromCookies, setSessionCookie } from '@/lib/axon-session';
import { getSecurityQuestionById } from '@/lib/axon-security-questions';

export async function GET() {
  try {
    await ensureMasterAccount();
    const session = await getSessionFromCookies();

    if (session) {
      const answers = await getSecurityAnswersForRecovery();
      if (answers.length >= 3) {
        const questions = answers.map((a) => {
          const q = getSecurityQuestionById(a.question_id);
          return { id: a.question_id, text: q?.question || a.question_id, category: q?.category };
        });
        return NextResponse.json({ questions, configured: true });
      }
    }

    const questions = AXON_SECURITY_QUESTIONS.map((q) => ({
      id: q.id,
      text: q.question,
      category: q.category,
    }));
    return NextResponse.json({ questions, configured: false });
  } catch (err) {
    console.error('security-questions GET', err);
    return NextResponse.json({ error: 'Failed to list questions' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await ensureMasterAccount();
    const session = await getSessionFromCookies();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { answers } = await req.json();
    if (!Array.isArray(answers)) {
      return NextResponse.json({ error: 'answers array required' }, { status: 400 });
    }

    const result = await saveSecurityQuestions(answers);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    await setSessionCookie({ ...session, securityVerified: true });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('security-questions POST', err);
    return NextResponse.json({ error: 'Failed to save questions' }, { status: 500 });
  }
}
