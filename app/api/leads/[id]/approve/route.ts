import { NextResponse } from 'next/server';
import { loadConfig } from '@/lib/config.mjs';
import { parseNotes, shortId } from '@/lib/constants.mjs';
import { ensureEmailCanSend } from '@/lib/email-domain-sync.mjs';
import { resendSend } from '@/lib/resend.mjs';
import { fetchLeadById, getClient, updateLeadStatus } from '@/lib/leads';
import { recordOutreachApproval } from '@/lib/outreach-learn';
import { getOutreachSettings, resolveSendEmail } from '@/lib/outreach-settings';

async function logApproval(id: string) {
  try {
    await recordOutreachApproval(id);
  } catch {
    /* training signal is best-effort */
  }
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

    const settings = await getOutreachSettings();
    const sendAccount = resolveSendEmail(settings);
    const domainCheck = await ensureEmailCanSend(cfg.resendKey, sendAccount.email);
    if (!domainCheck.ok) {
      return NextResponse.json(
        {
          error: domainCheck.message,
          code: domainCheck.code || 'domain_not_verified',
          canReplace: domainCheck.canReplace,
        },
        { status: 409 }
      );
    }

    const subject = meta.email_subject || `NORTHSiDE Intelligence — ${lead.handle}`;
    await resendSend(cfg, {
      to,
      subject,
      html: lead.comment_draft || '',
      from: sendAccount.email,
      replyTo: settings.emails.find((e) => e.isDefaultReceive)?.email,
    });

    await updateLeadStatus(id, { status: 'sent', dm_sent: true });
    await logApproval(id);
    return NextResponse.json({ message: `Email sent to ${to} for ${lead.handle}` });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Approve failed' },
      { status: 500 }
    );
  }
}
