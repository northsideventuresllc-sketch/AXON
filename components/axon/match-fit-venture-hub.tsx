import Link from 'next/link';
import { fetchMatchFitHub, MF_ADMIN_LINKS } from '@/lib/match-fit-hub';

const ACCENT = '#FF7E00';

function AdminLink({ href, label, note }: { href: string; label: string; note?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3 transition hover:border-[#FF7E00]/40 hover:bg-white/10"
    >
      <span className="text-sm font-medium text-white">{label}</span>
      <span className="text-xs text-axon-muted">{note || 'Open →'}</span>
    </a>
  );
}

export async function MatchFitVentureHub() {
  const hub = await fetchMatchFitHub();

  return (
    <div className="space-y-8 p-6">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-axon-muted">Ventures · Sector 1A</p>
        <h1 className="mt-1 text-2xl font-semibold text-white">Match Fit</h1>
        <p className="mt-2 max-w-2xl text-sm text-axon-muted">
          Operator hub — same data as the admin portal. Approve content in the calendar; post from
          Content Hub. AXON mirrors NI-Brain; match-fit.net is where you publish.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Today's theme", value: hub.todayTheme },
          { label: 'Content pending', value: String(hub.contentPending) },
          { label: 'Content approved', value: String(hub.contentApproved) },
          { label: 'Outreach active', value: String(hub.outreachActive) },
        ].map((c) => (
          <div
            key={c.label}
            className="rounded-xl border border-white/10 bg-axon-surface p-4"
            style={{ borderTopColor: ACCENT, borderTopWidth: 2 }}
          >
            <p className="text-xs text-axon-muted">{c.label}</p>
            <p className="mt-1 text-lg font-semibold text-white">{c.value}</p>
          </div>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-axon-muted">
          Match Fit admin (deep links)
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <AdminLink href={MF_ADMIN_LINKS.contentCalendar} label="Content Calendar" note="Approve · generate" />
          <AdminLink href={MF_ADMIN_LINKS.contentPreview} label="Content Preview" note="Before publish" />
          <AdminLink href={MF_ADMIN_LINKS.adTracking} label="Ad Tracking" note="Log performance" />
          <AdminLink href={MF_ADMIN_LINKS.outreach} label="Outreach HQ" note="Trainer DMs" />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wider text-axon-muted">
            Today's content queue
          </h2>
          <Link
            href={MF_ADMIN_LINKS.contentCalendar}
            className="text-xs hover:underline"
            style={{ color: ACCENT }}
            target="_blank"
          >
            Open calendar →
          </Link>
        </div>
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-axon-muted">
              <tr>
                <th className="px-4 py-2">Format</th>
                <th className="px-4 py-2">Theme</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Platforms</th>
              </tr>
            </thead>
            <tbody>
              {hub.posts.map((p) => (
                <tr key={p.id} className="border-t border-white/5">
                  <td className="px-4 py-2 text-white">{p.post_type}</td>
                  <td className="px-4 py-2 text-axon-muted">{p.theme_name}</td>
                  <td className="px-4 py-2">
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">{p.status}</span>
                  </td>
                  <td className="px-4 py-2 text-xs text-axon-muted">
                    {(p.platforms || []).join(' · ') || '—'}
                  </td>
                </tr>
              ))}
              {!hub.posts.length && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-axon-muted">
                    No posts for today — Hermes batch runs 7 AM ET.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
