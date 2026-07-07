'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SecurityQuestionsFlow } from '@/components/axon/security-questions-flow';
import { apiUrl } from '@/lib/api-base';

function SecurityVerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/';
  const [questions, setQuestions] = useState<Array<{ id: string; text: string }>>([]);

    useEffect(() => {
    void fetch(apiUrl('/api/auth/security-questions'))
      .then((r) => r.json())
      .then((data) => {
        const qs = data.questions || [];
        setQuestions(qs.map((q: { id: string; text: string }) => ({ id: q.id, text: q.text })));
      });
  }, []);

  async function handleSubmit(answers: Array<{ questionId: string; answer: string }>) {
    const res = await fetch(apiUrl('/api/auth/security-questions/verify'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Verification failed');
    }
    router.push(next);
    router.refresh();
  }

  return (
    <SecurityQuestionsFlow
      questions={questions}
      mode="verify"
      title="Verify your identity"
      subtitle="Periodic security check — answer your 3 security questions to continue."
      onSubmit={handleSubmit}
    />
  );
}

export default function SecurityVerifyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-axon-bg" />}>
      <SecurityVerifyContent />
    </Suspense>
  );
}
