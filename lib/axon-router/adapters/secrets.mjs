// lib/axon-router/adapters/secrets.mjs
//
// Secret loader for api-key adapters (anthropic-api, gemini-api). Matches the
// convention already used across the repo (lib/github-pat.mjs,
// lib/axon-v1-cloud-relay.mjs, lib/config.mjs): env wins, then a small inline
// fetch against NI-Brain `ni_platform_secrets`. No new npm dependency, no
// secret values ever logged.

const SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';

/** Env first, then NI-Brain `ni_platform_secrets` (by key name). */
export async function getSecret(key) {
  const fromEnv = process.env[key];
  if (fromEnv) return fromEnv;

  const serviceKey =
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return null;

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
    if (!r.ok) return null;
    const rows = await r.json();
    return rows?.[0]?.value?.trim() || null;
  } catch {
    return null;
  }
}
