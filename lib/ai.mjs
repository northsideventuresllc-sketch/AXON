import { GEMINI_MODEL, HAIKU_MODEL, ICP, SERVICES_CATALOG } from './constants.mjs';

const GEMINI_MAX_RETRIES = 4;
const GEMINI_RETRY_BASE_MS = 2000;
const GEMINI_INTER_CALL_DELAY_MS = Number(process.env.AXON_GEMINI_DELAY_MS || 2500);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err) {
  const msg = String(err?.message || err);
  return msg.includes('429') || msg.toLowerCase().includes('rate');
}

async function callHaiku(apiKey, system, user, maxTokens = 1200) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: HAIKU_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!r.ok) throw new Error(`Anthropic HTTP ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return data.content?.map((c) => c.text || '').join('').trim();
}

async function callGeminiOnce(apiKey, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 800, temperature: 0.3 },
    }),
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`Gemini HTTP ${r.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }
  const data = await r.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('')?.trim();
  if (!text) throw new Error('Gemini empty response');
  return text;
}

async function callGemini(apiKey, prompt, backupKey) {
  const keys = [apiKey, backupKey].filter(Boolean);
  if (!keys.length) throw new Error('Gemini API key missing');

  let lastErr;
  for (const key of keys) {
    for (let attempt = 0; attempt < GEMINI_MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          const waitMs = GEMINI_RETRY_BASE_MS * 2 ** (attempt - 1);
          console.log(`Gemini retry ${attempt}/${GEMINI_MAX_RETRIES - 1} in ${waitMs}ms`);
          await sleep(waitMs);
        }
        return await callGeminiOnce(key, prompt);
      } catch (err) {
        lastErr = err;
        if (!isRateLimitError(err) || attempt >= GEMINI_MAX_RETRIES - 1) break;
      }
    }
  }
  throw lastErr || new Error('Gemini failed');
}

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in model response');
  return JSON.parse(match[0]);
}

const SCAN_PROMPT = (prospect) => `You research B2B prospects for NORTHSiDE Intelligence services.

${SERVICES_CATALOG}

${ICP}

Prospect from search:
- Title: ${prospect.title}
- Snippet: ${prospect.snippet}
- Link: ${prospect.link}

Return JSON only:
{
  "company": "company name",
  "contact_guess": "role or person if inferable",
  "industry": "niche",
  "segment": "smb" or "enterprise",
  "fit_summary": "1-2 sentences why they might need NI services",
  "likely_pain": "specific ops pain point"
}`;

export function prospectFromSerp(prospect) {
  const title = (prospect.title || '').trim();
  const company = title.split(/[|\-–—]/)[0]?.trim() || title || 'Unknown prospect';
  return {
    company,
    contact_guess: null,
    industry: prospect.source || 'general',
    segment: 'smb',
    fit_summary: prospect.snippet || 'Prospect surfaced via web search; manual review recommended.',
    likely_pain: prospect.snippet || '',
    _scan_source: 'serp_fallback',
  };
}

export async function geminiScanProspect(cfg, prospect) {
  const text = await callGemini(cfg.geminiKey, SCAN_PROMPT(prospect), cfg.geminiBackup);
  const scan = extractJson(text);
  scan._scan_source = 'gemini';
  return scan;
}

export async function haikuScanProspect(cfg, prospect) {
  const system = `You research B2B prospects for NORTHSiDE Intelligence. Return valid JSON only.`;
  const text = await callHaiku(cfg.anthropicKey, system, SCAN_PROMPT(prospect), 800);
  const scan = extractJson(text);
  scan._scan_source = 'haiku';
  return scan;
}

/** Gemini → Haiku → SERP metadata fallback so outreach can still queue drafts. */
export async function scanProspect(cfg, prospect) {
  if (cfg.geminiKey) {
    try {
      const scan = await geminiScanProspect(cfg, prospect);
      if (GEMINI_INTER_CALL_DELAY_MS > 0) await sleep(GEMINI_INTER_CALL_DELAY_MS);
      return scan;
    } catch (err) {
      console.warn(`Gemini scan failed (${err.message}) — trying Haiku fallback`);
    }
  } else {
    console.warn('GEMINI_API_KEY missing — using Haiku for prospect scan');
  }

  try {
    return await haikuScanProspect(cfg, prospect);
  } catch (err) {
    console.warn(`Haiku scan failed (${err.message}) — using SERP fallback`);
    return prospectFromSerp(prospect);
  }
}

export async function haikuScoreAndDraft(cfg, scan, prospect) {
  const system = `You are AXON, NORTHSiDE Intelligence's B2B outreach engine. Underground-premium voice. Never spammy.

${SERVICES_CATALOG}

${ICP}

Rules:
- Pick channel: "email" if a business email can be inferred or generic ops@ pattern is reasonable; else "linkedin"
- Score 0-100 fit for NI services
- Email: under 150 words, personalized, one clear CTA to northsideintelligence.com/services
- LinkedIn DM: under 80 words, conversational, no hard sell
- Never claim you met them or know private facts not in the input
- Return valid JSON only`;

  const user = `Prospect scan:
${JSON.stringify(scan, null, 2)}

Search result:
${JSON.stringify(prospect, null, 2)}

Return JSON:
{
  "score": 0-100,
  "target_group": "smb" or "enterprise",
  "recommended_service": "one service name",
  "channel": "email" or "linkedin",
  "contact_email": "email or null",
  "why_match_fit": "score + rationale",
  "email_subject": "subject line if email channel",
  "email_body": "full email if email channel else null",
  "linkedin_dm": "DM text if linkedin channel else null"
}`;

  const text = await callHaiku(cfg.anthropicKey, system, user);
  return extractJson(text);
}

export async function haikuFollowUp(cfg, lead) {
  const system = `You draft a short B2B follow-up for NORTHSiDE Intelligence. Underground-premium, direct. Under 100 words. JSON only.`;
  const user = `Lead: ${lead.handle} (${lead.niche})
Previous email:
${lead.comment_draft}
Return JSON: { "email_subject": "...", "email_body": "..." }`;
  const text = await callHaiku(cfg.anthropicKey, system, user, 600);
  return extractJson(text);
}
