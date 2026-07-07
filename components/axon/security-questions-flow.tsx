'use client';

import { useState } from 'react';

export interface SecurityQuestionOption {
  id: string;
  text: string;
  category?: string;
}

interface SecurityQuestionsFlowProps {
  questions: SecurityQuestionOption[];
  mode: 'setup' | 'verify';
  title: string;
  subtitle: string;
  onSubmit: (answers: Array<{ questionId: string; answer: string }>) => Promise<void>;
}

export function SecurityQuestionsFlow({
  questions,
  mode,
  title,
  subtitle,
  onSubmit,
}: SecurityQuestionsFlowProps) {
  const [step, setStep] = useState<'select' | 'answers'>(mode === 'verify' ? 'answers' : 'select');
  const [selected, setSelected] = useState<string[]>(mode === 'verify' ? questions.map((q) => q.id) : []);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedQuestions =
    mode === 'verify'
      ? questions
      : questions.filter((q) => selected.includes(q.id));

  function toggleQuestion(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = selectedQuestions.map((q) => ({
        questionId: q.id,
        answer: answers[q.id] || '',
      }));
      await onSubmit(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="hex-grid-bg flex min-h-screen items-center justify-center bg-axon-bg px-4 py-10">
      <div className="axon-passcode-panel w-full max-w-2xl rounded-2xl border border-axon-border/80 p-8 axon-glass">
        <p className="font-mono text-xs uppercase tracking-[0.32em] text-axon-cyan/80">AXON Security</p>
        <h1 className="mt-2 text-2xl font-semibold axon-gradient-text">{title}</h1>
        <p className="mt-2 text-sm text-axon-muted">{subtitle}</p>

        {step === 'select' && (
          <div className="mt-8">
            <p className="text-xs uppercase tracking-wider text-axon-muted">
              Select 3 questions ({selected.length}/3)
            </p>
            <ul className="mt-4 max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {questions.map((q) => {
                const isSelected = selected.includes(q.id);
                const disabled = !isSelected && selected.length >= 3;
                return (
                  <li key={q.id}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleQuestion(q.id)}
                      className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition ${
                        isSelected
                          ? 'border-axon-cyan/60 bg-axon-cyan/10 text-axon-text'
                          : disabled
                            ? 'border-axon-border/40 text-axon-muted/50'
                            : 'border-axon-border bg-axon-elevated/40 text-axon-muted hover:border-axon-blue/40'
                      }`}
                    >
                      <span className="text-[10px] uppercase text-axon-blue-glow">{q.category}</span>
                      <span className="mt-1 block">{q.text}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              disabled={selected.length !== 3}
              onClick={() => setStep('answers')}
              className="axon-gradient-btn mt-6 w-full rounded-lg px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
            >
              Continue to answers
            </button>
          </div>
        )}

        {step === 'answers' && (
          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {selectedQuestions.map((q) => (
              <div key={q.id}>
                <label className="block text-xs uppercase tracking-wider text-axon-muted">{q.text}</label>
                <input
                  type="text"
                  autoComplete="off"
                  required
                  value={answers[q.id] || ''}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  className="mt-2 w-full rounded-lg border border-axon-border bg-axon-elevated px-4 py-3 text-sm outline-none focus:border-axon-cyan/50"
                />
              </div>
            ))}
            {error && <p className="text-sm text-axon-danger">{error}</p>}
            <div className="flex gap-3">
              {mode === 'setup' && (
                <button
                  type="button"
                  onClick={() => setStep('select')}
                  className="rounded-lg border border-axon-border px-4 py-3 text-sm text-axon-muted"
                >
                  Back
                </button>
              )}
              <button
                type="submit"
                disabled={loading}
                className="axon-gradient-btn flex-1 rounded-lg px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
              >
                {loading ? 'Verifying…' : mode === 'setup' ? 'Save security questions' : 'Verify identity'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
