import { NextResponse } from 'next/server';
import { loadConfig } from '@/lib/config.mjs';
import { parseNotes, shortId } from '@/lib/constants.mjs';
import { resendSend } from '@/lib/resend.mjs';
import { fetchLeadById, getClient, updateLeadStatus } from '@/lib/leads';
import { recordOutreachApproval } from '@/lib/outreach-learn';
import { learnStep } from '@/lib/axon-step-learn';
import { assertFireAllowed, FireHoldError } from '@/lib/axon-fire-gate';

async function logApproval(id: string) {
  try {
    await recordOutreachApproval(id);
  } catch {
    /* training signal is best-effort */
  }
  // Cross-tool one-line learning (feeds AX-WISDOM-LOOP) — fire-and-forget.
  learnStep({
    tool: 'ni-outreach',
    step: 'approve',
    after: 'approved',
    venture: 'NI Outreach',
    resourceId: id,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const lead = await fetchLeadById(id);
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    let send = true;
    try {
      const body = await req.json();
      if (body && typeof body.send === 'boolean') send = body.send;
    } catch {
      /* no JSON body — default send=true for backward compatibility */
    }

    const { sbSelect } = getClient();
    const cfg = await loadConfig(sbSelect);
    const meta = parseNotes(lead.notes);

    if (meta.channel === 'linkedin' || !send) {
      await updateLeadStatus(id, { status: 'approved' });
      await logApproval(id);
      const suffix =
        meta.channel === 'linkedin'
          ? ' (LinkedIn). Copy the DM and send manually, then mark as sent.'
          : '. Send manually when ready.';
      return NextResponse.json({
        message: `Approved ${shortId(id)}${suffix}`,
      });
    }

    const to = meta.contact_email;
    if (!to) {
      await updateLeadStatus(id, { status: 'approved' });
      await logApproval(id);
      return NextResponse.json({
        message: `Approved ${shortId(id)} but no contact email — send manually.`,
      });
    }

    if (!cfg.resendKey) {
      await updateLeadStatus(id, { status: 'approved' });
      await logApproval(id);
      return NextResponse.json({
        message: `Approved ${shortId(id)} but Resend not configured — send manually.`,
      });
    }

    const subject = meta.email_subject || `NORTHSiDE Intelligence — ${lead.handle}`;
    await assertFireAllowed('outreach.run');
    await resendSend(cfg, {
      to,
      subject,
      html: lead.comment_draft || '',
    });

    await updateLeadStatus(id, { status: 'sent', dm_sent: true });
    await logApproval(id);
    return NextResponse.json({ message: `Email sent to ${to} for ${lead.handle}` });
  } catch (err) {
    if (err instanceof FireHoldError) {
      return NextResponse.json(
        { error: err.message, hold: true, action: err.action },
        { status: 423 }
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Approve failed' },
      { status: 500 }
    );
  }
}
