import { NextResponse } from "next/server";
import {
  fetchMemories,
  fetchTopSignals,
  getOperatorProfile,
  updateOperatorProfile,
} from "@/lib/axon/axon-profile";
import { requireAxonOperatorId } from "@/lib/axon/operator";

export async function GET() {
  try {
    const operatorId = await requireAxonOperatorId();
    const [profile, signals, memories] = await Promise.all([
      getOperatorProfile(operatorId),
      fetchTopSignals(operatorId, 10),
      fetchMemories(operatorId, 10),
    ]);
    return NextResponse.json({ profile, signals, memories });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load profile";
    const status = message === "AXON access denied" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    const operatorId = await requireAxonOperatorId();
    const body = await req.json();
    const allowed = ["input_mode", "read_aloud", "voice_id", "voice_name"];
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No valid fields" }, { status: 400 });
    }
    await updateOperatorProfile(operatorId, patch);
    const profile = await getOperatorProfile(operatorId);
    return NextResponse.json({ profile });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    const status = message === "AXON access denied" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
