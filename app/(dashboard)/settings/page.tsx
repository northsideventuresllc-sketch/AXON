import { MAX_DRAFTS_PER_DAY } from '@/lib/constants.mjs';

const GUARDRAILS = [
  { label: 'No auto-send', detail: 'Every outbound requires JB approval via dashboard or Telegram.' },
  { label: 'Daily cap', detail: `Max ${MAX_DRAFTS_PER_DAY} new drafts per day.` },
  { label: 'API budget', detail: '$20/mo cap — monitor Anthropic console.' },
  { label: 'Hermes separate', detail: 'Sync only, no LLM overlap.' },
  { label: 'Score threshold', detail: 'Leads below 55 fit score are auto-skipped.' },
];

const SCHEDULE = [
  { job: 'AXON NI Outreach', cron: '30 7 * * * UTC', est: '2:30 AM EST daily' },
  { job: 'AXON Telegram Poll', cron: '*/15 * * * * UTC', est: 'Every 15 min' },
];

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Settings & Guardrails</h1>
        <p className="mt-1 text-sm text-axon-muted">Phase 1 operational constraints from nv-vault.</p>
      </header>

      <section className="rounded-xl border border-axon-border bg-axon-surface p-6">
        <h2 className="text-sm font-medium">Guardrails</h2>
        <div className="mt-4 space-y-4">
          {GUARDRAILS.map((g) => (
            <div key={g.label} className="border-l-2 border-axon-gold/40 pl-4">
              <p className="text-sm font-medium">{g.label}</p>
              <p className="text-xs text-axon-muted">{g.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-axon-border bg-axon-surface p-6">
        <h2 className="text-sm font-medium">GitHub Actions Schedule</h2>
        <div className="mt-4 overflow-hidden rounded-lg border border-axon-border">
          <table className="w-full text-sm">
            <thead className="bg-axon-elevated text-xs uppercase text-axon-muted">
              <tr>
                <th className="px-4 py-2 text-left">Workflow</th>
                <th className="px-4 py-2 text-left">Cron</th>
                <th className="px-4 py-2 text-left">Local</th>
              </tr>
            </thead>
            <tbody>
              {SCHEDULE.map((s) => (
                <tr key={s.job} className="border-t border-axon-border">
                  <td className="px-4 py-3">{s.job}</td>
                  <td className="px-4 py-3 font-mono text-xs">{s.cron}</td>
                  <td className="px-4 py-3 text-axon-muted">{s.est}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-axon-border bg-axon-surface p-6">
        <h2 className="text-sm font-medium">NI-Brain Connection</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex gap-2">
            <dt className="text-axon-muted">Project:</dt>
            <dd className="font-mono text-xs">kxijunwgbrlfzvgkhklo</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-axon-muted">Table:</dt>
            <dd className="font-mono text-xs">ni_brain_outreach</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-axon-muted">Source filter:</dt>
            <dd className="font-mono text-xs">axon_ni_services</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-axon-border bg-axon-surface p-6">
        <h2 className="text-sm font-medium">Telegram Commands</h2>
        <pre className="mt-4 rounded-lg bg-axon-elevated p-4 font-mono text-xs text-axon-muted">
{`/status              — pipeline summary
/approve <id>        — send email or approve LinkedIn
/reject <id>         — kill lead
/sent_li <id>        — mark LinkedIn DM sent`}
        </pre>
      </section>
    </div>
  );
}
