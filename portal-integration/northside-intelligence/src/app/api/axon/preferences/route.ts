import { NextResponse } from "next/server";
import {
  addNotification,
  getPreferences,
  markNotificationRead,
  updateHomeLayout,
  updateNotificationSettings,
} from "@/lib/axon/axon-preferences";
import { requireAxonOperatorId } from "@/lib/axon/operator";

export async function GET() {
  try {
    const operatorId = await requireAxonOperatorId();
    const preferences = await getPreferences(operatorId);
    return NextResponse.json({ preferences });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load preferences";
    const status = message === "AXON access denied" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    const operatorId = await requireAxonOperatorId();
    const body = await req.json();

    if (body.homeLayout) {
      const preferences = await updateHomeLayout(body.homeLayout, operatorId);
      return NextResponse.json({ preferences });
    }

    if (body.notifications) {
      const preferences = await updateNotificationSettings(body.notifications, operatorId);
      return NextResponse.json({ preferences });
    }

    if (body.addNotification) {
      const preferences = await addNotification(body.addNotification, operatorId);
      return NextResponse.json({ preferences });
    }

    if (body.markReadId) {
      const preferences = await markNotificationRead(body.markReadId, operatorId);
      return NextResponse.json({ preferences });
    }

    return NextResponse.json({ error: "No valid preference action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Preference update failed";
    const status = message === "AXON access denied" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
