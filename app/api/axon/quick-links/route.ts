import { NextResponse } from 'next/server';
import {
  DEFAULT_QUICK_LINKS,
  fetchQuickLinksFromDb,
  MAX_QUICK_LINKS,
  saveQuickLinksToDb,
  type AxonQuickLink,
} from '@/lib/axon-quick-links';

export async function GET() {
  try {
    const dbLinks = await fetchQuickLinksFromDb();
    return NextResponse.json({ links: dbLinks ?? DEFAULT_QUICK_LINKS });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load quick links' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as { links?: AxonQuickLink[] };
    if (!Array.isArray(body.links)) {
      return NextResponse.json({ error: 'links array required' }, { status: 400 });
    }
    if (body.links.length > MAX_QUICK_LINKS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_QUICK_LINKS} quick links allowed` },
        { status: 400 }
      );
    }

    const links = await saveQuickLinksToDb(body.links);
    return NextResponse.json({ links });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Quick links update failed' },
      { status: 500 }
    );
  }
}
