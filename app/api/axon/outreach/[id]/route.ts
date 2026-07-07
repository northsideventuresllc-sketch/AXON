import { NextResponse } from 'next/server';
import { patchOutreachDraft } from '@/lib/outreach-edit';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json()) as {
      email_subject?: string | null;
      comment_draft?: string | null;
      dm_draft?: string | null;
    };

    const hasField =
      body.email_subject !== undefined ||
      body.comment_draft !== undefined ||
      body.dm_draft !== undefined;

    if (!hasField) {
      return NextResponse.json({ error: 'No draft fields to update' }, { status: 400 });
    }

    const result = await patchOutreachDraft(id, {
      email_subject: body.email_subject,
      comment_draft: body.comment_draft,
      dm_draft: body.dm_draft,
    });

    if (!result) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    return NextResponse.json({
      lead: result.lead,
      changed: result.changed,
      fields: result.fields,
      message: result.changed ? 'Draft saved' : 'No changes',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Draft update failed' },
      { status: 500 }
    );
  }
}
