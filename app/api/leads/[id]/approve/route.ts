import { NextResponse } from 'next/server';
import { loadConfig } from '@/lib/config.mjs';
import { parseNotes } from '@/lib/constants.mjs';
import { resendSend } from '@/lib/resend.mjs';
import { fetchLeadById, getClient, updateLeadStatus } from '@/lib/leads';
import { shortId } from '@/lib/constants.mjs';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const lead = await fetchLeadById(id);
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    const { sbSelect } = getClient();
    const cfg = await loadConfig(sbSelect);
    const meta = parseNotes(lead.notes);

    if (meta.channel === 'linkedin') {
      await updateLeadStatus(id, { status: 'approved' });
      return NextResponse.json({
        message: `Approved ${shortId(id)} (LinkedIn). Copy the DM and send manually, then mark as sent.`,
      });
    }

    const to = meta.contact_email;
    if (!to) {
      await updateLeadStatus(id, { status: 'approved' });
      return NextResponse.json({
        message: `Approved ${shortId(id)} but no contact email — send manually.`,
      });
    }

    if (!cfg.resendKey) {
      await updateLeadStatus(id, { status: 'approved' });
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
    return NextResponse.json({ message: `Email sent to ${to} for ${lead.handle}` });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Approve failed' },
      { status: 500 }
    );
  }
}
