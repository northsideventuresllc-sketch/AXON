import { NextResponse } from "next/server";
import {
  DEFAULT_QUICK_LINKS,
  fetchQuickLinksFromDb,
  MAX_QUICK_LINKS,
  saveQuickLinksToDb,
  type AxonQuickLink,
} from "@/lib/axon/axon-quick-links";
import { requireAxonOperatorId } from "@/lib/axon/operator";

export async function GET() {
  try {
    await requireAxonOperatorId();
    const dbLinks = await fetchQuickLinksFromDb();
    return NextResponse.json({ links: dbLinks ?? DEFAULT_QUICK_LINKS });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load quick links";
    const status = message === "AXON access denied" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAxonOperatorId();
    const body = (await req.json()) as { links?: AxonQuickLink[] };
    if (!Array.isArray(body.links)) {
      return NextResponse.json({ error: "links array required" }, { status: 400 });
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
    const message = err instanceof Error ? err.message : "Quick links update failed";
    const status = message === "AXON access denied" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
