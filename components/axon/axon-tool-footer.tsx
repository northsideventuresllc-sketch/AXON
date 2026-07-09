'use client';

import Link from 'next/link';
import type { AxonUserTool } from '@/lib/axon-user-tools';
import { getAxonToolMeta } from '@/lib/axon-tool-meta';
import { formatAxonButton, formatAxonDescription } from '@/lib/axon-copy';
import { appPath } from '@/lib/paths';

export function AxonToolFooter({
  toolSlug,
  basePath,
}: {
  toolSlug: string;
  basePath?: string;
}) {
  const meta = getAxonToolMeta({
    slug: toolSlug,
    defaultDisplayName: toolSlug,
    href: '',
    icon: '',
    sourceType: 'custom',
  });
  const adjustHref = basePath
    ? appPath(`/tools/it-builder?axonTool=${encodeURIComponent(toolSlug)}`, basePath)
    : `/tools/it-builder?axonTool=${encodeURIComponent(toolSlug)}`;

  return (
    <footer className="mt-10 border-t border-axon-border/60 pt-6">
      <p className="text-xs font-medium uppercase tracking-wider text-axon-muted">
        How this tool is set up
      </p>
      <p className="mt-2 max-w-2xl text-sm text-axon-muted">
        {formatAxonDescription(meta.setupDescription)}
      </p>
      <Link
        href={adjustHref}
        className="mt-4 inline-block text-xs font-medium uppercase tracking-wider text-axon-gold hover:underline"
      >
        {formatAxonButton('Adjust Functionality')}
      </Link>
    </footer>
  );
}
