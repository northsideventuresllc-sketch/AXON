import { NextResponse } from 'next/server';
import {
  addNotification,
  archiveNotifications,
  declineNotification,
  deleteNotification,
  getPreferences,
  markNotificationRead,
  resolveNotification,
  reviveNotification,
  updateHomeLayout,
  updateNotificationSettings,
  updatePowerMode,
} from '@/lib/axon-preferences';
import { POWER_LEVEL_TO_COST_TIER_FLOOR, type PowerLevel } from '@/lib/axon-types';

const VALID_POWER_LEVELS = new Set(Object.keys(POWER_LEVEL_TO_COST_TIER_FLOOR));

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

    if (body.powerMode) {
      if (body.powerMode.level !== undefined && !VALID_POWER_LEVELS.has(body.powerMode.level)) {
        return NextResponse.json({ error: 'Invalid powerMode.level' }, { status: 400 });
      }
      if (body.powerMode.autoSwitchEnabled !== undefined && typeof body.powerMode.autoSwitchEnabled !== 'boolean') {
        return NextResponse.json({ error: 'Invalid powerMode.autoSwitchEnabled' }, { status: 400 });
      }
      const preferences = await updatePowerMode(
        body.powerMode as { autoSwitchEnabled?: boolean; level?: PowerLevel }
      );
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

    if (body.resolveId) {
      const preferences = await resolveNotification(body.resolveId);
      return NextResponse.json({ preferences });
    }

    if (body.declineId) {
      const preferences = await declineNotification(body.declineId);
      return NextResponse.json({ preferences });
    }

    if (body.deleteId) {
      const preferences = await deleteNotification(body.deleteId);
      return NextResponse.json({ preferences });
    }

    if (Array.isArray(body.archiveIds) && body.archiveIds.length > 0) {
      const preferences = await archiveNotifications(body.archiveIds);
      return NextResponse.json({ preferences });
    }

    if (body.reviveId) {
      const preferences = await reviveNotification(body.reviveId);
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
