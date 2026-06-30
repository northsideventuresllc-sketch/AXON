import { SUPABASE_URL } from './constants.mjs';

export function createSupabaseClient(key) {
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };

  async function sbSelect(table, filter = '') {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
      headers: { ...headers, Accept: 'application/json' },
    });
    if (!r.ok) throw new Error(`Supabase select ${table}: HTTP ${r.status}`);
    return r.json();
  }

  async function sbInsert(table, row) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify(row),
    });
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`Supabase insert ${table}: HTTP ${r.status} ${text}`);
    }
    const data = await r.json();
    return Array.isArray(data) ? data[0] : data;
  }

  async function sbPatch(table, filter, row) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify(row),
    });
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`Supabase patch ${table}: HTTP ${r.status} ${text}`);
    }
    const data = await r.json();
    return Array.isArray(data) ? data[0] : data;
  }

  async function sbUpsertSecret(key, value) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/ni_platform_secrets`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
    });
    if (!r.ok) throw new Error(`Supabase upsert secret ${key}: HTTP ${r.status}`);
  }

  return { sbSelect, sbInsert, sbPatch, sbUpsertSecret };
}
