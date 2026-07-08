import { SUPABASE_URL } from './constants.mjs';

const ENV_KEYS = [
  'AXON_GITHUB_PAT',
  'GITHUB_PAT',
  'GH_PAT',
  'NI_GITHUB_PAT',
  'GITHUB_TOKEN',
];

const BRAIN_KEYS = ['GH_PAT', 'GITHUB_PAT', 'AXON_GITHUB_PAT', 'NI_GITHUB_PAT'];

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
        `${SUPABASE_URL}/rest/v1/ni_platform_secrets?key=eq.${encodeURIComponent(key)}&select=value&limit=1`,
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
      const value = rows?.[0]?.value?.trim();
      if (value) return value;
    } catch {
      /* try next key */
    }
  }

  return '';
}

export const GITHUB_PAT_ENV_HINT =
  'Set AXON_GITHUB_PAT, GITHUB_PAT, or GH_PAT (env or ni_platform_secrets).';
