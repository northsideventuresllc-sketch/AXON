import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="text-xs uppercase tracking-[0.3em] text-axon-blue-glow">AXON</p>
      <h1 className="mt-4 text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 max-w-md text-sm text-axon-muted">
        This route does not exist yet or may have moved.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-lg border border-axon-border px-4 py-2 text-sm text-axon-cyan transition hover:border-axon-blue-glow/50"
      >
        Back to AXON home
      </Link>
    </div>
  );
}
