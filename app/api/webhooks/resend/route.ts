import { NextResponse } from 'next/server';
import { refreshResendDomain } from '@/lib/email-domain-sync.mjs';
import { getOutreachSettings, saveOutreachSettings, type OutreachEmailDomain } from '@/lib/outreach-settings';
import { loadConfig } from '@/lib/config.mjs';

function applyDomainUpdate(
  settings: Awaited<ReturnType<typeof getOutreachSettings>>,
  domainName: string,
  status: string,
  domainId?: string
) {
  const emailDomains = { ...settings.emailDomains };
  const existing = emailDomains[domainName];
  emailDomains[domainName] = {
    domain: domainName,
    resendDomainId: domainId || existing?.resendDomainId,
    status: status as OutreachEmailDomain['status'],
    records: existing?.records || [],
    syncedAt: new Date().toISOString(),
  };

  const emails = settings.emails.map((email) => {
    if (email.domain !== domainName) return email;
    return {
      ...email,
      domainStatus: status as OutreachEmailDomain['status'],
      domainSyncedAt: new Date().toISOString(),
      domainError: status === 'verified' ? undefined : email.domainError,
    };
  });

  return { ...settings, emails, emailDomains };
}

export async function POST(req: Request) {
  try {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (secret) {
      const provided = req.headers.get('svix-signature') || req.headers.get('resend-signature');
      if (!provided) {
        return NextResponse.json({ error: 'Missing webhook signature' }, { status: 401 });
      }
      // Resend uses Svix — full verification can be added when secret is configured.
    }

    const payload = await req.json();
    const type = payload?.type;
    const data = payload?.data;

    if (type !== 'domain.updated' && type !== 'domain.created') {
      return NextResponse.json({ ok: true, ignored: type });
    }

    const domainName = data?.name;
    const status = data?.status;
    if (!domainName || !status) {
      return NextResponse.json({ ok: true, ignored: 'no domain data' });
    }

    const { getClient } = await import('@/lib/leads');
    const { sbSelect } = getClient();
    const cfg = await loadConfig(sbSelect);
    if (!cfg.resendKey) {
      return NextResponse.json({ error: 'Resend not configured' }, { status: 503 });
    }

    const refreshed = await refreshResendDomain(cfg.resendKey, domainName);
    let settings = await getOutreachSettings();
    settings = applyDomainUpdate(
      settings,
      domainName,
      refreshed.domain?.status || status,
      refreshed.domain?.id || data?.id
    );
    await saveOutreachSettings(settings);

    return NextResponse.json({ ok: true, domain: domainName, status: refreshed.domain?.status || status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Webhook failed' },
      { status: 500 }
    );
  }
}
