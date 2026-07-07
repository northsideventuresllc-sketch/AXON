import { NextResponse } from 'next/server';
import { AXON_SECURITY_QUESTIONS } from '@/lib/axon-security-questions';
import { ensureMasterAccount, saveSecurityQuestions } from '@/lib/axon-security';
import { getSessionFromCookies } from '@/lib/axon-session';

export async function GET() {
  try {
    await ensureMasterAccount();
    const questions = AXON_SECURITY_QUESTIONS.map((q) => ({
      id: q.id,
      text: q.question,
      category: q.category,
    }));
    return NextResponse.json({ questions });
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

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('security-questions POST', err);
    return NextResponse.json({ error: 'Failed to save questions' }, { status: 500 });
  }
}
