import {
  ICP,
  SCORE_RUBRIC,
  MIN_OUTREACH_SCORE,
  SERVICES_CATALOG,
} from './constants.mjs';
import { generateViaRouter } from './axon-generate.mjs';

function extractJson(text) {
  const cleaned = String(text || '')
    .replace(/```(?:json)?\s*/gi, '')
    .replace(/```/g, '')
    .trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in model response');
  return JSON.parse(match[0]);
}

const SCAN_PROMPT = (prospect) => `You research B2B prospects for Northside Intelligence services.

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
  "likely_pain": "specific ops pain point",
  "icp_fit": true or false,
  "icp_reject_reason": "short reason if icp_fit is false, else null"
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
    icp_fit: null,
    icp_reject_reason: null,
    _scan_source: 'serp_fallback',
  };
}

/**
 * ONE ROUTER (2026-09-06): prospect scanning walks the locked chain in
 * lib/axon-router-core.mjs (local -> RunPod -> OpenRouter free -> Gemini ->
 * Anthropic last), instead of the four hand-rolled tiers that used to live in
 * this file. `_scan_source` still names whichever lane actually answered, so
 * rows written from this scan keep their existing shape. When the whole chain
 * is unreachable the SERP metadata fallback still runs, exactly as before —
 * outreach can always queue a draft.
 */
export async function scanProspect(cfg, prospect, generate = generateViaRouter) {
  const system = 'You research B2B prospects for Northside Intelligence. Return valid JSON only.';
  try {
    const out = await generate(cfg.supabaseKey, {
      system,
      user: SCAN_PROMPT(prospect),
      kind: 'cheap_chat',
      agentName: 'axon-outreach-scan',
      maxTokens: 1200,
      jsonMode: true,
    });
    const scan = extractJson(out.text);
    scan._scan_source = out.source;
    if (out.model) scan._scan_model = out.model;
    return scan;
  } catch (err) {
    console.warn(`Prospect scan chain failed (${err.message}) — using SERP fallback`);
    return prospectFromSerp(prospect);
  }
}

export async function haikuScoreAndDraft(cfg, scan, prospect, trainingBlock = '', generate = generateViaRouter) {
  const trainingSection = trainingBlock?.trim()
    ? `\n\n${trainingBlock.trim()}`
    : '';

  const system = `You are AXON, Northside Intelligence's B2B outreach engine. Underground-premium voice. Never spammy.

${SERVICES_CATALOG}

${ICP}

${SCORE_RUBRIC}

Rules:
- Pick channel: "email" if a business email can be inferred or generic ops@ pattern is reasonable; else "linkedin"
- Score 0-100 fit for NI services using the rubric above
- If icp_fit would be false, set score below ${MIN_OUTREACH_SCORE}
- Email: under 150 words, personalized, one clear CTA to northsideintelligence.com/services
- LinkedIn DM: under 80 words, conversational, no hard sell
- Never claim you met them or know private facts not in the input
- Return valid JSON only${trainingSection}`;

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

  const out = await generate(cfg.supabaseKey, {
    system,
    user,
    kind: 'cheap_chat',
    agentName: 'axon-outreach-draft',
    maxTokens: 1200,
    jsonMode: true,
  });
  return extractJson(out.text);
}

export async function haikuFollowUp(cfg, lead, generate = generateViaRouter) {
  const system = `You draft a short B2B follow-up for Northside Intelligence. Underground-premium, direct. Under 100 words. JSON only.`;
  const user = `Lead: ${lead.handle} (${lead.niche})
Previous email:
${lead.comment_draft}
Return JSON: { "email_subject": "...", "email_body": "..." }`;
  const out = await generate(cfg.supabaseKey, {
    system,
    user,
    kind: 'cheap_chat',
    agentName: 'axon-outreach-followup',
    maxTokens: 600,
    jsonMode: true,
  });
  return extractJson(out.text);
}
