import { GEMINI_MODEL, HAIKU_MODEL, ICP, SERVICES_CATALOG } from './constants.mjs';

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

async function callGemini(apiKey, prompt, backupKey) {
  const keys = [apiKey, backupKey].filter(Boolean);
  let lastErr;
  for (const key of keys) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 800, temperature: 0.3 },
        }),
      });
      if (!r.ok) throw new Error(`Gemini HTTP ${r.status}`);
      const data = await r.json();
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('')?.trim();
      if (!text) throw new Error('Gemini empty response');
      return text;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Gemini failed');
}

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in model response');
  return JSON.parse(match[0]);
}

export async function geminiScanProspect(cfg, prospect) {
  const prompt = scanPrompt(prospect);
  try {
    const text = await callGemini(cfg.geminiKey, prompt, cfg.geminiBackup);
    return extractJson(text);
  } catch (err) {
    console.warn(`Gemini scan fallback (${err.message})`);
    return haikuScanProspect(cfg, prospect);
  }
}

function scanPrompt(prospect) {
  return `You research B2B prospects for NORTHSiDE Intelligence services.

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
}

export async function haikuScanProspect(cfg, prospect) {
  const system = 'Return valid JSON only. No markdown.';
  const text = await callHaiku(cfg.anthropicKey, system, scanPrompt(prospect), 600);
  return extractJson(text);
}

/** Minimal scan when all AI fails — still allows draft step */
export function fallbackScan(prospect) {
  const title = prospect.title || 'Unknown';
  return {
    company: title.split('|')[0].split(' - ')[0].trim().slice(0, 120),
    contact_guess: null,
    industry: 'general',
    segment: 'smb',
    fit_summary: prospect.snippet || title,
    likely_pain: 'manual ops / workflow friction',
  };
}

export async function scanProspect(cfg, prospect) {
  try {
    return await geminiScanProspect(cfg, prospect);
  } catch {
    try {
      return await haikuScanProspect(cfg, prospect);
    } catch {
      return fallbackScan(prospect);
    }
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
