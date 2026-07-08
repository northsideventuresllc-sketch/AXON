import { getOperatorProfile, updateOperatorProfile } from './axon-profile';
import { OPERATOR_ID } from './axon-types';

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export type SocialPlatform = 'linkedin' | 'twitter' | 'instagram';

export interface OutreachEmailAccount {
  id: string;
  email: string;
  label: string;
  isDefaultSend: boolean;
  isDefaultReceive: boolean;
}

export interface OutreachSocialAccount {
  id: string;
  platform: SocialPlatform;
  handle: string;
  label: string;
  isDefault: boolean;
}

export interface OutreachEmailSignature {
  text: string;
  logoDataUrl: string | null;
}

export interface OutreachSettings {
  emails: OutreachEmailAccount[];
  socialAccounts: OutreachSocialAccount[];
  signature: OutreachEmailSignature;
}

const DEFAULT_FROM = 'Jonny <northside@northsideintelligence.com>';

export const DEFAULT_OUTREACH_SETTINGS: OutreachSettings = {
  emails: [
    {
      id: 'default-send',
      email: DEFAULT_FROM,
      label: 'Primary',
      isDefaultSend: true,
      isDefaultReceive: false,
    },
    {
      id: 'default-receive',
      email: 'northside@northsideintelligence.com',
      label: 'Inbox',
      isDefaultSend: false,
      isDefaultReceive: true,
    },
  ],
  socialAccounts: [
    {
      id: 'default-linkedin',
      platform: 'linkedin',
      handle: 'Jonny B — NORTHSiDE',
      label: 'LinkedIn',
      isDefault: true,
    },
  ],
  signature: {
    text: '— JB\nNORTHSiDE Intelligence',
    logoDataUrl: null,
  },
};

function parseOutreachSettings(contextData: Record<string, unknown> | null | undefined): OutreachSettings {
  const raw = contextData?.outreach_settings as Partial<OutreachSettings> | undefined;
  if (!raw) return structuredClone(DEFAULT_OUTREACH_SETTINGS);

  return {
    emails: Array.isArray(raw.emails) && raw.emails.length ? raw.emails : DEFAULT_OUTREACH_SETTINGS.emails,
    socialAccounts:
      Array.isArray(raw.socialAccounts) && raw.socialAccounts.length
        ? raw.socialAccounts
        : DEFAULT_OUTREACH_SETTINGS.socialAccounts,
    signature: {
      ...DEFAULT_OUTREACH_SETTINGS.signature,
      ...(raw.signature || {}),
    },
  };
}

export async function getOutreachSettings(operatorId = OPERATOR_ID): Promise<OutreachSettings> {
  const profile = await getOperatorProfile(operatorId);
  return parseOutreachSettings(profile.context_data);
}

export async function saveOutreachSettings(
  patch: Partial<OutreachSettings>,
  operatorId = OPERATOR_ID
): Promise<OutreachSettings> {
  const profile = await getOperatorProfile(operatorId);
  const current = parseOutreachSettings(profile.context_data);
  const next: OutreachSettings = {
    emails: patch.emails ?? current.emails,
    socialAccounts: patch.socialAccounts ?? current.socialAccounts,
    signature: { ...current.signature, ...(patch.signature || {}) },
  };
  await updateOperatorProfile(operatorId, {
    context_data: {
      ...profile.context_data,
      outreach_settings: next,
    },
  });
  return next;
}

export function newEmailAccount(partial: Pick<OutreachEmailAccount, 'email' | 'label'>): OutreachEmailAccount {
  return {
    id: newId(),
    email: partial.email,
    label: partial.label,
    isDefaultSend: false,
    isDefaultReceive: false,
  };
}

export function newSocialAccount(
  partial: Pick<OutreachSocialAccount, 'platform' | 'handle' | 'label'>
): OutreachSocialAccount {
  return {
    id: newId(),
    platform: partial.platform,
    handle: partial.handle,
    label: partial.label,
    isDefault: false,
  };
}

export function resolveSendEmail(settings: OutreachSettings, emailId?: string): OutreachEmailAccount {
  if (emailId) {
    const found = settings.emails.find((e) => e.id === emailId);
    if (found) return found;
  }
  return settings.emails.find((e) => e.isDefaultSend) || settings.emails[0];
}

export function resolveReceiveEmail(settings: OutreachSettings, emailId?: string): OutreachEmailAccount {
  if (emailId) {
    const found = settings.emails.find((e) => e.id === emailId);
    if (found) return found;
  }
  return settings.emails.find((e) => e.isDefaultReceive) || settings.emails[0];
}

export function resolveSocialAccount(settings: OutreachSettings, accountId?: string): OutreachSocialAccount {
  if (accountId) {
    const found = settings.socialAccounts.find((a) => a.id === accountId);
    if (found) return found;
  }
  return settings.socialAccounts.find((a) => a.isDefault) || settings.socialAccounts[0];
}

export function buildSignatureHtml(signature: OutreachEmailSignature): string {
  const parts: string[] = [];
  if (signature.text?.trim()) {
    parts.push(signature.text.replace(/\n/g, '<br>'));
  }
  if (signature.logoDataUrl) {
    parts.push(`<img src="${signature.logoDataUrl}" alt="Logo" style="max-height:56px;margin-top:8px" />`);
  }
  if (!parts.length) return '';
  return `<br><br>${parts.join('<br>')}`;
}
