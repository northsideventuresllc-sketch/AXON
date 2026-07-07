import { NextResponse } from 'next/server';
import { loadConfig } from '@/lib/axon/config.mjs';
import { parseNotes, shortId } from '@/lib/axon/constants.mjs';
import { resendSend } from '@/lib/axon/resend.mjs';
import { fetchLeadById, getClient, updateLeadStatus } from '@/lib/axon/leads';
import { recordOutreachApproval } from '@/lib/axon/outreach-learn';
import { requireAxonOperatorId } from '@/lib/axon/operator';

async function logApproval(id: string, operatorId: string) {
  try {
    await recordOutreachApproval(id, { operatorId });
  } catch {
    /* training signal is best-effort */
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const operatorId = await requireAxonOperatorId();
    const { id } = await params;
    const lead = await fetchLeadById(id);
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    let send = true;
    try {
      const body = await req.json();
      if (body && typeof body.send === 'boolean') send = body.send;
    } catch {
      /* no JSON body */
    }

    const { sbSelect } = getClient();
    const cfg = await loadConfig(sbSelect);
    const meta = parseNotes(lead.notes);

    if (meta.channel === 'linkedin' || !send) {
      await updateLeadStatus(id, { status: 'approved' });
      await logApproval(id, operatorId);
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
      await logApproval(id, operatorId);
      return NextResponse.json({
        message: `Approved ${shortId(id)} but no contact email — send manually.`,
      });
    }

    if (!cfg.resendKey) {
      await updateLeadStatus(id, { status: 'approved' });
      await logApproval(id, operatorId);
      return NextResponse.json({
        message: `Approved ${shortId(id)} but Resend not configured — send manually.`,
      });
    }

    const subject = meta.email_subject || `NORTHSiDE Intelligence — ${lead.handle}`;
    await resendSend(cfg, {
      to,
      subject,
      html: lead.comment_draft || '',
    });

    await updateLeadStatus(id, { status: 'sent', dm_sent: true });
    await logApproval(id, operatorId);
    return NextResponse.json({ message: `Email sent to ${to} for ${lead.handle}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Approve failed';
    const status = message === 'AXON access denied' ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
