'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SecurityQuestionsFlow } from '@/components/axon/security-questions-flow';
import { apiUrl } from '@/lib/api-base';

function RecoveryContent({ token }: { token: string }) {
  const router = useRouter();
  const [questions, setQuestions] = useState<Array<{ id: string; text: string }>>([]);
  const [valid, setValid] = useState<boolean | null>(null);

  useEffect(() => {
    void fetch(apiUrl(`/api/auth/recovery/${encodeURIComponent(token)}`))
      .then((r) => r.json())
      .then((data) => {
        if (!data.valid) {
          setValid(false);
          return;
        }
        setValid(true);
        setQuestions(
          (data.questions || []).map((q: { questionId: string; text: string }) => ({
            id: q.questionId,
            text: q.text,
          }))
        );
      })
      .catch(() => setValid(false));
  }, [token]);

  async function handleSubmit(answers: Array<{ questionId: string; answer: string }>) {
    const res = await fetch(apiUrl(`/api/auth/recovery/${encodeURIComponent(token)}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Recovery failed');
    }
    router.push('/');
    router.refresh();
  }

  if (valid === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-axon-bg">
        <p className="font-mono text-xs uppercase tracking-widest text-axon-cyan/70">Validating recovery link…</p>
      </div>
    );
  }

  if (!valid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-axon-bg px-4">
        <div className="axon-glass max-w-md rounded-2xl border border-axon-danger/40 p-8 text-center">
          <h1 className="text-lg font-semibold text-axon-danger">Invalid or expired link</h1>
          <p className="mt-2 text-sm text-axon-muted">Request a new recovery email from the login screen.</p>
        </div>
      </div>
    );
  }

  return (
    <SecurityQuestionsFlow
      questions={questions}
      mode="verify"
      title="Account recovery"
      subtitle="Answer your security questions to unlock your AXON account."
      onSubmit={handleSubmit}
    />
  );
}

export default function SecurityRecoveryPage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    void params.then((p) => setToken(p.token));
  }, [params]);

  if (!token) {
    return <div className="min-h-screen bg-axon-bg" />;
  }

  return (
    <Suspense fallback={<div className="min-h-screen bg-axon-bg" />}>
      <RecoveryContent token={token} />
    </Suspense>
  );
}
