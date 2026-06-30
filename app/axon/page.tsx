import Link from 'next/link';
import { WaitlistForm } from '@/components/axon/waitlist-form';

const FEATURES = [
  {
    title: 'Autonomous Discovery',
    body: 'SERP-powered prospecting finds ops-heavy SMBs and enterprise leads while you sleep.',
  },
  {
    title: 'AI Scoring & Drafting',
    body: 'Gemini scans fit. Haiku drafts underground-premium outreach matched to NI Services.',
  },
  {
    title: 'Human-in-the-Loop',
    body: 'No auto-send. Every draft waits for JB approval — via dashboard or Telegram.',
  },
  {
    title: 'NI-Brain Memory',
    body: 'Pipeline state lives in NI-Brain. Learn, iterate, close 4 paid clients in Phase 1.',
  },
];

const PRICING = [
  { tier: 'Solo', price: '$149', sub: '+ $49/mo', detail: 'Individual operators' },
  { tier: 'Team', price: '$499', sub: '+ $149/mo', detail: 'Small teams, shared pipeline' },
  { tier: 'Enterprise', price: '$2,500', sub: '+ $499/mo', detail: 'White-label, own API keys' },
];

export default function AxonLandingPage() {
  return (
    <div className="min-h-screen bg-axon-bg text-axon-text">
      <div className="axon-grid-bg">
        <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
          <div>
            <span className="text-lg font-semibold tracking-[0.2em] text-axon-gold">AXON</span>
            <span className="ml-2 text-xs text-axon-muted">by NORTHSiDE</span>
          </div>
          <Link
            href="/login"
            className="rounded-lg border border-axon-border px-4 py-2 text-sm text-axon-muted transition hover:border-axon-gold/40 hover:text-axon-gold"
          >
            Operator Login
          </Link>
        </header>

        <main className="mx-auto max-w-5xl px-6 pb-24">
          <section className="py-16 text-center">
            <p className="text-xs uppercase tracking-[0.35em] text-axon-gold">Sector 5 — Autonomous Systems</p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl">
              AI that partners with humans.
              <br />
              <span className="text-axon-muted">Not replaces them.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-axon-muted">
              AXON is NORTHSiDE&apos;s 24/7 outreach engine — find prospects, score fit, draft
              personalized NI Services pitches, and queue them for your approval.
            </p>

            <div className="mx-auto mt-10 max-w-md">
              <WaitlistForm />
              <p className="mt-3 text-xs text-axon-muted">Early access waitlist — no spam, underground-premium only.</p>
            </div>
          </section>

          <section className="grid gap-6 py-12 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-axon-border bg-axon-surface p-6 transition hover:border-axon-gold/30"
              >
                <h3 className="font-medium text-axon-gold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-axon-muted">{f.body}</p>
              </div>
            ))}
          </section>

          <section className="py-12">
            <h2 className="text-center text-2xl font-semibold">How Phase 1 Works</h2>
            <div className="mt-8 flex flex-wrap justify-center gap-2 text-sm">
              {['Find', 'Score', 'Draft', 'Approve', 'Send', 'Close'].map((step, i) => (
                <div key={step} className="flex items-center gap-2">
                  <span className="rounded-full border border-axon-gold/40 bg-axon-gold/10 px-4 py-2 font-mono text-xs text-axon-gold">
                    {step}
                  </span>
                  {i < 5 && <span className="text-axon-muted">→</span>}
                </div>
              ))}
            </div>
            <p className="mx-auto mt-6 max-w-xl text-center text-sm text-axon-muted">
              Phase 1 goal: close 4 paid NI Services clients. Max 15 drafts/day. $20/mo API cap.
            </p>
          </section>

          <section className="py-12">
            <h2 className="text-center text-2xl font-semibold">Pricing Preview</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {PRICING.map((p) => (
                <div
                  key={p.tier}
                  className="rounded-xl border border-axon-border bg-axon-surface p-6 text-center"
                >
                  <p className="text-xs uppercase tracking-wider text-axon-muted">{p.tier}</p>
                  <p className="mt-2 text-3xl font-semibold text-axon-gold">{p.price}</p>
                  <p className="text-sm text-axon-muted">{p.sub}</p>
                  <p className="mt-3 text-xs text-axon-muted">{p.detail}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-axon-gold/20 bg-axon-gold/5 p-8 text-center">
            <h2 className="text-xl font-semibold">Need NI Services now?</h2>
            <p className="mt-2 text-sm text-axon-muted">
              Workflow automation, intelligence audits, enterprise AI strategy — built for ops-heavy teams.
            </p>
            <a
              href="https://northsideintelligence.com/services"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-block rounded-lg bg-axon-gold px-8 py-3 text-sm font-medium text-black transition hover:bg-axon-gold/90"
            >
              Explore NI Services ↗
            </a>
          </section>
        </main>

        <footer className="border-t border-axon-border py-8 text-center text-xs text-axon-muted">
          <p>NORTHSiDE Intelligence · AXON Autonomous Systems</p>
          <p className="mt-1">Underground-premium. Direct. No corporate fluff.</p>
        </footer>
      </div>
    </div>
  );
}
