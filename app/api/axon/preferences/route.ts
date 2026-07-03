import { NextResponse } from 'next/server';
import {
  addNotification,
  getPreferences,
  markNotificationRead,
  updateHomeLayout,
  updateNotificationSettings,
} from '@/lib/axon-preferences';

export async function GET() {
  try {
    const preferences = await getPreferences();
    return NextResponse.json({ preferences });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load preferences' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();

    if (body.homeLayout) {
      const preferences = await updateHomeLayout(body.homeLayout);
      return NextResponse.json({ preferences });
    }

    if (body.notifications) {
      const preferences = await updateNotificationSettings(body.notifications);
      return NextResponse.json({ preferences });
    }

    if (body.addNotification) {
      const preferences = await addNotification(body.addNotification);
      return NextResponse.json({ preferences });
    }

    if (body.markReadId) {
      const preferences = await markNotificationRead(body.markReadId);
      return NextResponse.json({ preferences });
    }

    return NextResponse.json({ error: 'No valid preference action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Preference update failed' },
      { status: 500 }
    );
  }
}
