import { NextResponse } from 'next/server';
import { loadConfig } from '@/lib/axon/config.mjs';
import { formatNotes, parseNotes, shortId } from '@/lib/axon/constants.mjs';
import { resendSend } from '@/lib/axon/resend.mjs';
import { fetchLeadById, getClient, updateLeadStatus } from '@/lib/axon/leads';
import { recordOutreachSend } from '@/lib/axon/outreach-learn';
import { assertFireAllowed, FireHoldError } from '@/lib/axon/axon-fire-gate';
import {
  getOutreachSettings,
  resolveReceiveEmail,
  resolveSendEmail,
  resolveSocialAccount,
} from '@/lib/axon/outreach-settings';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const lead = await fetchLeadById(id);
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    const body = await req.json();
    const meta = parseNotes(lead.notes);
    const channel = (body.channel || meta.channel || 'email') as 'email' | 'linkedin';
    const settings = await getOutreachSettings();

    if (channel === 'linkedin') {
      const account = resolveSocialAccount(settings, body.fromAccountId);
      if (!account) {
        return NextResponse.json(
          { error: 'Connect a social profile URL under Outreach Channels first' },
          { status: 400 }
        );
      }
      const message = String(body.message || lead.dm_draft || '').trim();
      if (!message) {
        return NextResponse.json({ error: 'DM message is required' }, { status: 400 });
      }

      const nextMeta = {
        ...meta,
        sent_from_account: account.profileUrl,
        sent_from_handle: account.handle,
        sent_at: new Date().toISOString(),
      };

      await updateLeadStatus(id, {
        status: 'sent',
        dm_sent: true,
        dm_draft: message,
        notes: formatNotes(nextMeta),
      });

      await recordOutreachSend(id, {
        channel: 'linkedin',
        payload: {
          from: account.profileUrl,
          handle: account.handle,
          platform: account.platform,
          message,
          to: lead.handle,
        },
      });

      return NextResponse.json({
        message: `LinkedIn DM marked sent for ${lead.handle} (${shortId(id)}) from ${account.profileUrl}`,
      });
    }

    const to = String(body.to || meta.contact_email || '').trim();
    if (!to) {
      return NextResponse.json({ error: 'Recipient email is required' }, { status: 400 });
    }

    const sendAccount = resolveSendEmail(settings, body.fromEmailId);
    const receiveAccount = resolveReceiveEmail(settings, body.replyToEmailId);
    const subject = String(body.subject || meta.email_subject || `NORTHSiDE Intelligence — ${lead.handle}`);
    const emailBody = String(body.body || lead.comment_draft || '');
    const includeSignature = body.includeSignature !== false;
    const signatureText = String(body.signatureText || settings.signature.text || '');
    const logoDataUrl = settings.signature.logoDataUrl;
    const signatureHtml = includeSignature
      ? (signatureText.replace(/\n/g, '<br>') +
          (logoDataUrl ? `<br><img src="${logoDataUrl}" alt="Logo" style="max-height:56px;margin-top:8px" />` : ''))
      : '';
    const html = `${emailBody.replace(/\n/g, '<br>')}${signatureHtml ? `<br><br>${signatureHtml}` : ''}`;

    const { sbSelect } = getClient();
    const cfg = await loadConfig(sbSelect);

    if (!cfg.resendKey) {
      return NextResponse.json({ error: 'Resend not configured' }, { status: 503 });
    }

    await assertFireAllowed('outreach.run');
    await resendSend(cfg, {
      to,
      subject,
      html,
      from: sendAccount.email,
      replyTo: receiveAccount.email,
    });

    const nextMeta = {
      ...meta,
      email_subject: subject,
      contact_email: to,
      sent_from_email: sendAccount.email,
      sent_reply_to: receiveAccount.email,
      sent_at: new Date().toISOString(),
    };

    await updateLeadStatus(id, {
      status: 'sent',
      dm_sent: true,
      comment_draft: emailBody,
      notes: formatNotes(nextMeta),
    });

    await recordOutreachSend(id, {
      channel: 'email',
      payload: {
        from: sendAccount.email,
        replyTo: receiveAccount.email,
        to,
        subject,
        body: emailBody,
        signature: includeSignature ? signatureText : null,
      },
    });

    return NextResponse.json({ message: `Email sent to ${to} for ${lead.handle}` });
  } catch (err) {
    if (err instanceof FireHoldError) {
      return NextResponse.json(
        { error: err.message, hold: true, action: err.action },
        { status: 423 }
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Send failed' },
      { status: 500 }
    );
  }
}
