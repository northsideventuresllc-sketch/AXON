import { SERVICES_CATALOG, ICP, MAX_DRAFTS_PER_DAY, SEARCH_QUERIES } from '@/lib/constants.mjs';

export default function ServicesPage() {
  const smb = SERVICES_CATALOG.split('\n\n')[0];
  const enterprise = SERVICES_CATALOG.split('\n\n')[1];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">NI Services Catalog</h1>
        <p className="mt-1 text-sm text-axon-muted">
          Services AXON recommends and pitches to prospects.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <CatalogBlock title="SMB ($4,500–$15,000)" content={smb} />
        <CatalogBlock title="Enterprise ($12,000–$100,000+)" content={enterprise} />
      </div>

      <section className="rounded-xl border border-axon-border bg-axon-surface p-6">
        <h2 className="text-sm font-medium">Ideal Customer Profile</h2>
        <pre className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-axon-muted">
          {ICP}
        </pre>
      </section>

      <section className="rounded-xl border border-axon-border bg-axon-surface p-6">
        <h2 className="text-sm font-medium">Daily SERP Queries ({SEARCH_QUERIES.length} rotating)</h2>
        <ul className="mt-4 space-y-2">
          {SEARCH_QUERIES.map((entry, i) => (
            <li key={entry.query} className="text-sm text-axon-muted">
              <span className="font-mono text-xs text-axon-gold">{i + 1}.</span> {entry.query}
              <span className="ml-2 text-xs opacity-70">({entry.industry})</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-axon-gold/20 bg-axon-gold/5 p-6">
        <h2 className="text-sm font-medium text-axon-gold">CTA</h2>
        <a
          href="https://northsideintelligence.com/services"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-sm text-axon-teal hover:underline"
        >
          northsideintelligence.com/services ↗
        </a>
      </section>
    </div>
  );
}

function CatalogBlock({ title, content }: { title: string; content: string }) {
  return (
    <div className="rounded-xl border border-axon-border bg-axon-surface p-6">
      <h2 className="text-sm font-medium">{title}</h2>
      <pre className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-axon-muted">
        {content}
      </pre>
    </div>
  );
}
