import { getOperatorProfile, updateOperatorProfile } from './axon-profile';
import { OPERATOR_ID } from './axon-types';

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export type SocialPlatform = 'linkedin' | 'twitter' | 'instagram';

export interface OutreachSocialAccount {
  id: string;
  platform: SocialPlatform;
  /** Canonical profile or page URL the operator connected (source of truth). */
  profileUrl: string;
  /** Slug parsed from profileUrl — not entered manually. */
  handle: string;
  label: string;
  isDefault: boolean;
  connectedAt?: string;
}

export interface ParsedSocialProfile {
  platform: SocialPlatform;
  profileUrl: string;
  handle: string;
  label: string;
}

const PLATFORM_HOSTS: Record<SocialPlatform, RegExp[]> = {
  linkedin: [/^(www\.)?linkedin\.com$/i],
  twitter: [/^(www\.)?(twitter|x)\.com$/i],
  instagram: [/^(www\.)?instagram\.com$/i],
};

const RESERVED_TWITTER = new Set(['home', 'i', 'intent', 'share', 'search', 'settings', 'messages']);
const RESERVED_INSTAGRAM = new Set(['p', 'reel', 'reels', 'explore', 'stories', 'accounts']);

export function detectSocialPlatform(hostname: string): SocialPlatform | null {
  const host = hostname.replace(/^www\./, '').toLowerCase();
  for (const [platform, patterns] of Object.entries(PLATFORM_HOSTS) as [SocialPlatform, RegExp[]][]) {
    if (patterns.some((re) => re.test(host) || re.test(`www.${host}`))) return platform;
  }
  return null;
}

export function parseSocialProfileUrl(
  input: string,
  expectedPlatform?: SocialPlatform
): ParsedSocialProfile | { error: string } {
  const raw = input.trim();
  if (!raw) return { error: 'Profile URL is required' };

  let url: URL;
  try {
    url = new URL(raw.includes('://') ? raw : `https://${raw}`);
  } catch {
    return { error: 'Enter a valid profile URL (e.g. https://linkedin.com/in/your-name)' };
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    return { error: 'Profile URL must use http or https' };
  }

  const platform = detectSocialPlatform(url.hostname);
  if (!platform) {
    return { error: 'Unsupported site — use LinkedIn, X/Twitter, or Instagram profile links' };
  }
  if (expectedPlatform && platform !== expectedPlatform) {
    return { error: `URL does not match selected platform (${expectedPlatform})` };
  }

  const segments = url.pathname.split('/').filter(Boolean);
  let handle = '';

  if (platform === 'linkedin') {
    const kind = segments[0]?.toLowerCase();
    if (kind !== 'in' && kind !== 'company') {
      return { error: 'LinkedIn URL must be a profile (/in/...) or company page (/company/...)' };
    }
    handle = segments[1] || '';
    if (!handle) return { error: 'LinkedIn URL is missing a profile or company slug' };
  } else if (platform === 'twitter') {
    handle = segments[0] || '';
    if (!handle || RESERVED_TWITTER.has(handle.toLowerCase())) {
      return { error: 'X/Twitter URL must be a profile link (e.g. https://x.com/username)' };
    }
  } else if (platform === 'instagram') {
    handle = segments[0] || '';
    if (!handle || RESERVED_INSTAGRAM.has(handle.toLowerCase())) {
      return { error: 'Instagram URL must be a profile link (e.g. https://instagram.com/username)' };
    }
  }

  const profileUrl = `${url.protocol}//${url.hostname}${url.pathname}`.replace(/\/$/, '');
  const label =
    platform === 'linkedin' && segments[0]?.toLowerCase() === 'company'
      ? `LinkedIn · ${handle}`
      : `${platform === 'twitter' ? 'X' : platform.charAt(0).toUpperCase() + platform.slice(1)} · @${handle}`;

  return { platform, profileUrl, handle, label };
}

export function formatSocialAccountSummary(account: OutreachSocialAccount): string {
  if (account.profileUrl) return account.profileUrl;
  return account.handle ? `${account.platform} · ${account.handle}` : account.label;
}

function normalizeSocialAccount(account: OutreachSocialAccount): OutreachSocialAccount {
  if (!account.profileUrl?.trim()) return account;
  const parsed = parseSocialProfileUrl(account.profileUrl, account.platform);
  if ('error' in parsed) return account;
  return {
    ...account,
    platform: parsed.platform,
    profileUrl: parsed.profileUrl,
    handle: parsed.handle,
    label: account.label?.trim() || parsed.label,
  };
}

export interface OutreachEmailAccount {
  id: string;
  email: string;
  label: string;
  isDefaultSend: boolean;
  isDefaultReceive: boolean;
  /** Resend domain verification — synced automatically when email is connected. */
  domain?: string;
  domainStatus?: 'not_started' | 'pending' | 'verified' | 'failed' | 'temporary_failure' | 'partially_verified';
  resendDomainId?: string;
  domainSyncedAt?: string;
  domainError?: string;
}

export interface OutreachDnsRecord {
  record: string;
  type: string;
  name: string;
  value: string;
  priority?: number | null;
  status?: string;
  ttl?: string | null;
}

export interface OutreachEmailDomain {
  domain: string;
  resendDomainId?: string;
  status: OutreachEmailAccount['domainStatus'];
  records: OutreachDnsRecord[];
  syncedAt?: string;
  error?: string;
}

export interface OutreachEmailSignature {
  text: string;
  logoDataUrl: string | null;
}

export interface OutreachSettings {
  emails: OutreachEmailAccount[];
  socialAccounts: OutreachSocialAccount[];
  signature: OutreachEmailSignature;
  /** DNS / Resend status keyed by domain name */
  emailDomains: Record<string, OutreachEmailDomain>;
}

const DEFAULT_FROM = 'JB <jb@northsideintelligence.com>';
const DEFAULT_RECEIVE = 'jb@northsideintelligence.com';

export const DEFAULT_OUTREACH_SETTINGS: OutreachSettings = {
  emails: [
    {
      id: 'default-send',
      email: DEFAULT_FROM,
      label: 'JB · Send',
      isDefaultSend: true,
      isDefaultReceive: false,
      domain: 'northsideintelligence.com',
      domainStatus: 'not_started',
    },
    {
      id: 'default-receive',
      email: DEFAULT_RECEIVE,
      label: 'JB · Inbox',
      isDefaultSend: false,
      isDefaultReceive: true,
      domain: 'northsideintelligence.com',
      domainStatus: 'not_started',
    },
  ],
  socialAccounts: [],
  signature: {
    text: '— JB\nNORTHSiDE Intelligence',
    logoDataUrl: null,
  },
  emailDomains: {},
};

function parseOutreachSettings(contextData: Record<string, unknown> | null | undefined): OutreachSettings {
  const raw = contextData?.outreach_settings as Partial<OutreachSettings> | undefined;
  if (!raw) return structuredClone(DEFAULT_OUTREACH_SETTINGS);

  return {
    emails: Array.isArray(raw.emails) && raw.emails.length ? raw.emails : DEFAULT_OUTREACH_SETTINGS.emails,
    socialAccounts:
      Array.isArray(raw.socialAccounts) && raw.socialAccounts.length
        ? raw.socialAccounts.map((a) => normalizeSocialAccount(a as OutreachSocialAccount))
        : DEFAULT_OUTREACH_SETTINGS.socialAccounts,
    signature: {
      ...DEFAULT_OUTREACH_SETTINGS.signature,
      ...(raw.signature || {}),
    },
    emailDomains:
      raw.emailDomains && typeof raw.emailDomains === 'object'
        ? (raw.emailDomains as Record<string, OutreachEmailDomain>)
        : DEFAULT_OUTREACH_SETTINGS.emailDomains,
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
    socialAccounts: (patch.socialAccounts ?? current.socialAccounts).map((account) => {
      if (!account.profileUrl?.trim()) return account;
      const parsed = parseSocialProfileUrl(account.profileUrl, account.platform);
      if ('error' in parsed) return account;
      return normalizeSocialAccount({ ...account, ...parsed, label: account.label?.trim() || parsed.label });
    }),
    signature: { ...current.signature, ...(patch.signature || {}) },
    emailDomains: patch.emailDomains ?? current.emailDomains,
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

export function newSocialAccount(parsed: ParsedSocialProfile, label?: string): OutreachSocialAccount {
  return {
    id: newId(),
    platform: parsed.platform,
    profileUrl: parsed.profileUrl,
    handle: parsed.handle,
    label: label?.trim() || parsed.label,
    isDefault: false,
    connectedAt: new Date().toISOString(),
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

export function resolveSocialAccount(settings: OutreachSettings, accountId?: string): OutreachSocialAccount | null {
  if (accountId) {
    const found = settings.socialAccounts.find((a) => a.id === accountId && a.profileUrl);
    if (found) return found;
  }
  return settings.socialAccounts.find((a) => a.isDefault && a.profileUrl) || settings.socialAccounts.find((a) => a.profileUrl) || null;
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
