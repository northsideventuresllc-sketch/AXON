import { NextResponse } from 'next/server';
import { loadConfig } from '@/lib/axon/config.mjs';
import {
  ensureEmailCanSend,
  parseEmailAddress,
  refreshResendDomain,
  syncResendDomain,
  triggerDomainVerification,
} from '@/lib/axon/email-domain-sync.mjs';
import {
  getOutreachSettings,
  saveOutreachSettings,
  type OutreachEmailDomain,
  type OutreachSettings,
} from '@/lib/axon/outreach-settings';
import { requireAxonOperatorId } from '@/lib/axon/operator';

function domainFromSettings(settings: OutreachSettings, domain: string): OutreachEmailDomain | undefined {
  return settings.emailDomains[domain];
}

function applyDomainToSettings(
  settings: OutreachSettings,
  domainName: string,
  domain: {
    id?: string;
    status?: string;
    records?: OutreachEmailDomain['records'];
  } | null,
  error?: string
): OutreachSettings {
  const emailDomains = { ...settings.emailDomains };
  if (domain) {
    emailDomains[domainName] = {
      domain: domainName,
      resendDomainId: domain.id,
      status: (domain.status as OutreachEmailDomain['status']) || 'pending',
      records: domain.records || [],
      syncedAt: new Date().toISOString(),
      error: error || undefined,
    };
  } else if (error) {
    emailDomains[domainName] = {
      domain: domainName,
      status: 'failed',
      records: emailDomains[domainName]?.records || [],
      syncedAt: new Date().toISOString(),
      error,
    };
  }

  const emails = settings.emails.map((email) => {
    const parsed = parseEmailAddress(email.email);
    if (parsed.error || parsed.domain !== domainName) return email;
    const entry = emailDomains[domainName];
    return {
      ...email,
      domain: domainName,
      domainStatus: entry?.status,
      resendDomainId: entry?.resendDomainId,
      domainSyncedAt: entry?.syncedAt,
      domainError: entry?.error,
    };
  });

  return { ...settings, emails, emailDomains };
}

async function loadResendKey() {
  const { getClient } = await import('@/lib/axon/leads');
  const { sbSelect } = getClient();
  const cfg = await loadConfig(sbSelect);
  if (!cfg.resendKey) {
    throw new Error('Resend API key is not configured');
  }
  return cfg.resendKey;
}

export async function GET() {
  try {
    const operatorId = await requireAxonOperatorId();
    const apiKey = await loadResendKey();
    let settings = await getOutreachSettings(operatorId);
    const domains = new Set<string>();

    for (const email of settings.emails) {
      const parsed = parseEmailAddress(email.email);
      if (!parsed.error) domains.add(parsed.domain);
    }

    for (const domainName of domains) {
      const refreshed = await refreshResendDomain(apiKey, domainName);
      if (refreshed.domain) {
        settings = applyDomainToSettings(settings, domainName, refreshed.domain);
      }
    }

    if (domains.size > 0) {
      settings = await saveOutreachSettings(settings, operatorId);
    }

    return NextResponse.json({ settings });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Domain sync failed';
    const status = message === 'AXON access denied' ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const operatorId = await requireAxonOperatorId();
    const body = await req.json();
    const email = String(body.email || '').trim();
    const replaceExisting = body.replaceExisting === true;

    const parsed = parseEmailAddress(email);
    if (parsed.error) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const apiKey = await loadResendKey();
    let settings = await getOutreachSettings(operatorId);

    const sync = await syncResendDomain(apiKey, parsed.domain, { replaceExisting });

    if (sync.action === 'blocked') {
      return NextResponse.json(
        {
          error: sync.error,
          code: sync.code,
          canReplace: sync.canReplace,
          currentDomains: sync.currentDomains,
          settings,
        },
        { status: 409 }
      );
    }

    if (!sync.domain) {
      return NextResponse.json({ error: 'Failed to register domain with Resend' }, { status: 502 });
    }

    settings = applyDomainToSettings(settings, parsed.domain, sync.domain, sync.notice);

    const exists = settings.emails.some((e) => e.email.toLowerCase() === parsed.formatted.toLowerCase());
    if (!exists) {
      settings.emails.push({
        id: crypto.randomUUID(),
        email: parsed.formatted,
        label: parsed.displayName || parsed.address,
        isDefaultSend: settings.emails.length === 0,
        isDefaultReceive: false,
        domain: parsed.domain,
        domainStatus: sync.domain.status,
        resendDomainId: sync.domain.id,
        domainSyncedAt: new Date().toISOString(),
      });
    }

    settings = await saveOutreachSettings(settings, operatorId);

    if (sync.domain.status !== 'verified') {
      try {
        await triggerDomainVerification(apiKey, parsed.domain);
        const refreshed = await refreshResendDomain(apiKey, parsed.domain);
        if (refreshed.domain) {
          settings = applyDomainToSettings(settings, parsed.domain, refreshed.domain);
          settings = await saveOutreachSettings(settings, operatorId);
        }
      } catch {
        /* DNS may still be propagating */
      }
    }

    return NextResponse.json({
      settings,
      domain: domainFromSettings(settings, parsed.domain),
      action: sync.action,
      notice: sync.notice || null,
      replaced: sync.replaced || null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Connect failed';
    const status = message === 'AXON access denied' ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(req: Request) {
  try {
    const operatorId = await requireAxonOperatorId();
    const body = await req.json();
    const domainName = String(body.domain || '').trim().toLowerCase();
    if (!domainName) {
      return NextResponse.json({ error: 'domain is required' }, { status: 400 });
    }

    const apiKey = await loadResendKey();
    const result = await triggerDomainVerification(apiKey, domainName);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    let settings = await getOutreachSettings(operatorId);
    settings = applyDomainToSettings(settings, domainName, result.domain);
    settings = await saveOutreachSettings(settings, operatorId);

    return NextResponse.json({
      settings,
      domain: domainFromSettings(settings, domainName),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Verify failed';
    const status = message === 'AXON access denied' ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAxonOperatorId();
    const body = await req.json();
    const fromEmail = String(body.fromEmail || '').trim();
    const apiKey = await loadResendKey();
    const check = await ensureEmailCanSend(apiKey, fromEmail, { replaceExisting: body.replaceExisting === true });
    return NextResponse.json(check, { status: check.ok ? 200 : 409 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Check failed';
    const status = message === 'AXON access denied' ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
