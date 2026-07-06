import { NextResponse } from "next/server";
import { resetOperatorData } from "@/lib/axon/axon-profile";
import { requireAxonOperatorId } from "@/lib/axon/operator";

const MESSAGES: Record<string, string> = {
  memories_before: "Memories before the selected date have been cleared.",
  communication: "Communication learnings reset. AXON returns to default tone signals.",
  context: "Context and memories cleared. Chat history preserved.",
  full: "Full clean slate. AXON is back to default starting mode.",
};

export async function POST(req: Request) {
  try {
    const operatorId = await requireAxonOperatorId();
    const { scope, beforeDate } = await req.json();
    const valid = ["memories_before", "communication", "context", "full"];
    if (!valid.includes(scope)) {
      return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
    }
    if (scope === "memories_before" && !beforeDate) {
      return NextResponse.json({ error: "beforeDate required" }, { status: 400 });
    }

    await resetOperatorData(
      operatorId,
      scope,
      beforeDate ? `${beforeDate}T00:00:00Z` : undefined
    );
    return NextResponse.json({ ok: true, message: MESSAGES[scope] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reset failed";
    const status = message === "AXON access denied" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
