import Link from 'next/link';

export function ToolPlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-axon-muted hover:text-axon-gold">
        ← Back to AXON
      </Link>
      <div className="rounded-xl border border-dashed border-axon-border p-12 text-center">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-axon-muted">{description}</p>
        <p className="mt-4 text-xs uppercase tracking-wider text-axon-gold">Coming soon</p>
      </div>
    </div>
  );
}
