import { SUPABASE_URL } from './constants.mjs';

const ENV_KEYS = [
  'AXON_GITHUB_PAT',
  'GITHUB_PAT',
  'GH_PAT',
  'NI_GITHUB_PAT',
  'GITHUB_TOKEN',
];

const BRAIN_KEYS = ['GH_PAT', 'GITHUB_PAT', 'AXON_GITHUB_PAT', 'NI_GITHUB_PAT'];

// GitHub PATs (classic or fine-grained) always start with one of these prefixes.
// ni_platform_secrets has held duplicate rows under the same key name before
// (e.g. a live Stripe sk_live_... key mis-stored under 'GH_PAT' — Learning #10379),
// and a plain single-row eq lookup has no way to tell which row is the real token.
const GITHUB_TOKEN_PATTERN = /^(ghp_|gho_|ghs_|ghr_|ghu_|github_pat_)/;

export function looksLikeGithubToken(value) {
  return typeof value === 'string' && GITHUB_TOKEN_PATTERN.test(value.trim());
}

/** Resolve GitHub PAT from env (sync). Matches outreach + research dispatch. */
export function getGithubPatFromEnv() {
  for (const key of ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return '';
}

/** Env first, then NI-Brain ni_platform_secrets. */
export async function resolveGithubPat() {
  const fromEnv = getGithubPatFromEnv();
  if (fromEnv) return fromEnv;

  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) return '';

  for (const key of BRAIN_KEYS) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/ni_platform_secrets?key=eq.${encodeURIComponent(key)}&select=value`,
        {
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            Accept: 'application/json',
          },
        },
      );
      if (!r.ok) continue;
      const rows = await r.json();
      for (const row of rows ?? []) {
        const value = row?.value?.trim();
        if (value && looksLikeGithubToken(value)) return value;
      }
    } catch {
      /* try next key */
    }
  }

  return '';
}

export const GITHUB_PAT_ENV_HINT =
  'Set AXON_GITHUB_PAT, GITHUB_PAT, or GH_PAT (env or ni_platform_secrets).';
