import { NextResponse } from 'next/server';
import { getClient, enrichLead, updateLeadNotes } from '@/lib/leads';
import { SOURCE, parseNotes } from '@/lib/constants.mjs';
import type { Lead } from '@/lib/types';

/** Fetch sent leads that need follow-up (no follow_up_sent_at yet). */
export async function GET() {
  try {
    const { sbSelect } = getClient();
    const rows = (await sbSelect(
      'ni_brain_outreach',
      `source=eq.${SOURCE}&status=eq.sent&select=*&order=created_at.desc&limit=200`
    )) as Lead[];

    const leads = (rows || []).map(enrichLead);

    // Split into pending follow-up vs done
    const pending = leads.filter((l) => !l.meta.follow_up_sent_at);
    const done = leads.filter((l) => !!l.meta.follow_up_sent_at);

    return NextResponse.json({ pending, done, total: leads.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load follow-up leads' },
      { status: 500 }
    );
  }
}

/** Draft or regenerate a follow-up message for a sent lead. */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { leadId, action } = body as { leadId?: string; action?: string };

    if (!leadId) {
      return NextResponse.json({ error: 'leadId required' }, { status: 400 });
    }

    const { sbSelect } = getClient();
    const rows = (await sbSelect(
      'ni_brain_outreach',
      `source=eq.${SOURCE}&id=eq.${leadId}&select=*&limit=1`
    )) as Lead[];

    const lead = rows?.[0];
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    if (lead.status !== 'sent') {
      return NextResponse.json({ error: 'Lead must have status=sent' }, { status: 422 });
    }

    const meta = parseNotes(lead.notes);

    // Mark follow-up as sent
    if (action === 'mark_sent') {
      const updatedMeta = {
        ...meta,
        follow_up_sent_at: new Date().toISOString(),
      };
      await updateLeadNotes(leadId, updatedMeta);
      return NextResponse.json({ ok: true, action: 'marked_sent' });
    }

    // Generate follow-up draft
    const draft = buildFollowUpDraft({
      handle: lead.handle,
      recommendedService: meta.recommended_service as string | undefined,
      whyMatchFit: lead.why_match_fit,
      channel: (meta.channel as string | undefined) || 'email',
      originalSubject: meta.email_subject as string | undefined,
    });

    const updatedMeta = {
      ...meta,
      follow_up_draft: draft,
      follow_up_drafted_at: new Date().toISOString(),
    };

    await updateLeadNotes(leadId, updatedMeta);

    return NextResponse.json({ ok: true, draft, leadId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Draft failed' },
      { status: 500 }
    );
  }
}

interface DraftParams {
  handle: string;
  recommendedService?: string;
  whyMatchFit?: string | null;
  channel: string;
  originalSubject?: string | null;
}

function buildFollowUpDraft({
  handle,
  recommendedService,
  whyMatchFit,
  channel,
  originalSubject,
}: DraftParams): string {
  const service = recommendedService || 'AI workflow automation';
  const companyName = handle.replace(/@/g, '').replace(/_/g, ' ');

  const matchLine = whyMatchFit
    ? whyMatchFit.length > 120
      ? whyMatchFit.slice(0, 120).trimEnd() + '...'
      : whyMatchFit
    : `${companyName} looks like a strong fit for ${service}`;

  if (channel === 'linkedin') {
    return [
      `Hey — just circling back on my earlier message about ${service}.`,
      ``,
      `${matchLine}`,
      ``,
      `Happy to share a quick overview of how we'd approach this for your team. Worth a 20-minute call?`,
      ``,
      `— JB`,
    ].join('\n');
  }

  // Email follow-up
  const subjectRef = originalSubject
    ? `Re: ${originalSubject}`
    : `Following up — ${service} for ${companyName}`;

  return [
    `Subject: ${subjectRef}`,
    ``,
    `Hey,`,
    ``,
    `Following up on my note from last week — wanted to make sure it didn't get buried.`,
    ``,
    `${matchLine}`,
    ``,
    `Our ${service} engagements typically run ${getServiceRange(service)}. Happy to send over a one-pager or jump on a quick call — whichever is easier.`,
    ``,
    `Best,`,
    `JB`,
  ].join('\n');
}

function getServiceRange(service: string): string {
  const s = service.toLowerCase();
  if (s.includes('enterprise') || s.includes('governance') || s.includes('strategy')) {
    return '$12,000–$100,000+';
  }
  if (s.includes('server') || s.includes('tailored')) {
    return '$12,000–$100,000+';
  }
  return '$4,500–$15,000';
}

