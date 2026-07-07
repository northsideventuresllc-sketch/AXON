'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SecurityQuestionsFlow } from '@/components/axon/security-questions-flow';
import { apiUrl } from '@/lib/api-base';

function SecuritySetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/';
  const [questions, setQuestions] = useState<Array<{ id: string; text: string; category?: string }>>([]);

  useEffect(() => {
    void fetch(apiUrl('/api/auth/security-questions'))
      .then((r) => r.json())
      .then((data) => setQuestions(data.questions?.map((q: { id: string; text: string; category?: string }) => q) || []));
  }, []);

  async function handleSubmit(answers: Array<{ questionId: string; answer: string }>) {
    const res = await fetch(apiUrl('/api/auth/security-questions'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to save security questions');
    }
    router.push(next);
    router.refresh();
  }

  return (
    <SecurityQuestionsFlow
      questions={questions}
      mode="setup"
      title="Set up security questions"
      subtitle="Choose 3 questions only you can answer. These are used if your account gets locked."
      onSubmit={handleSubmit}
    />
  );
}

export default function SecuritySetupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-axon-bg" />}>
      <SecuritySetupContent />
    </Suspense>
  );
}
