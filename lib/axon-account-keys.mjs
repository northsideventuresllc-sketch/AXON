/**
 * Per-account provider key store (axon_account_provider_keys).
 *
 * Lets one account hand AXON its OWN OpenRouter / Gemini / Anthropic / RunPod key so calls
 * for that account bill against the account's key instead of the NVG platform key — without
 * ever exposing that key anywhere else. Keys are stored AES-256-GCM encrypted; only last4
 * ever comes back out through the read paths meant for a UI.
 *
 * Plain .mjs, same convention as lib/axon-router-core.mjs — importable from raw `node`
 * scripts with no TS loader.
 */
import crypto from 'node:crypto';

const SUPABASE_URL = 'https://kxijunwgbrlfzvgkhklo.supabase.co';

export const CHAIN_PROVIDERS = ['openrouter', 'gemini', 'anthropic', 'runpod'];

function hdrs(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

const ALGO = 'aes-256-gcm';

/** Derives a 32-byte key from AXON_KEYSTORE_SECRET. Returns null if that secret isn't set —
 *  callers must fail closed (never fall back to storing plaintext). */
function derivedKey() {
  const secret = process.env.AXON_KEYSTORE_SECRET;
  if (!secret) return null;
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptProviderKey(plaintext) {
  const key = derivedKey();
  if (!key) throw new Error('AXON_KEYSTORE_SECRET is not set — cannot store an account API key');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptProviderKey(ciphertextB64) {
  const key = derivedKey();
  if (!key || !ciphertextB64) return null;
  try {
    const buf = Buffer.from(ciphertextB64, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    return null; // wrong secret, corrupted row, or rotated AXON_KEYSTORE_SECRET
  }
}

export function last4Of(plaintext) {
  const s = String(plaintext || '');
  return s.length >= 4 ? s.slice(-4) : s || null;
}

/** @returns {Promise<{key: string, last4: string}|null>} the decrypted key for one provider, or
 *  null if the account has none set (or it fails to decrypt). Never throws. */
export async function getAccountKey(supabaseKey, accountId, provider) {
  if (!accountId || !provider) return null;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/axon_account_provider_keys?select=key_ciphertext,last4&account_id=eq.${accountId}&provider=eq.${provider}`,
      { headers: hdrs(supabaseKey) },
    );
    if (!r.ok) return null;
    const rows = await r.json();
    const row = rows?.[0];
    if (!row?.key_ciphertext) return null;
    const plain = decryptProviderKey(row.key_ciphertext);
    return plain ? { key: plain, last4: row.last4 || last4Of(plain) } : null;
  } catch {
    return null;
  }
}

/** Upserts one account's key for one provider. Returns {last4} — never the plaintext back. */
export async function setAccountKey(supabaseKey, accountId, provider, plaintextKey) {
  if (!accountId) throw new Error('accountId required');
  if (!CHAIN_PROVIDERS.includes(provider)) throw new Error(`unknown provider: ${provider}`);
  if (!plaintextKey || !String(plaintextKey).trim()) throw new Error('key required');
  const key_ciphertext = encryptProviderKey(String(plaintextKey).trim());
  const last4 = last4Of(plaintextKey);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/axon_account_provider_keys`, {
    method: 'POST',
    headers: { ...hdrs(supabaseKey), Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      account_id: accountId,
      provider,
      key_ciphertext,
      last4,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!r.ok) throw new Error('could not save that key');
  return { last4 };
}

export async function deleteAccountKey(supabaseKey, accountId, provider) {
  if (!accountId || !provider) return false;
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/axon_account_provider_keys?account_id=eq.${accountId}&provider=eq.${provider}`,
    { method: 'DELETE', headers: hdrs(supabaseKey) },
  );
  return r.ok;
}

/** { openrouter: {last4, updatedAt}, ... } — for a Settings panel. Never the key itself. */
export async function listAccountKeyStatus(supabaseKey, accountId) {
  if (!accountId) return {};
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/axon_account_provider_keys?select=provider,last4,updated_at&account_id=eq.${accountId}`,
      { headers: hdrs(supabaseKey) },
    );
    if (!r.ok) return {};
    const rows = await r.json();
    return Object.fromEntries(rows.map((row) => [row.provider, { last4: row.last4, updatedAt: row.updated_at }]));
  } catch {
    return {};
  }
}
