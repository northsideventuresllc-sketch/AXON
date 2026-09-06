#!/usr/bin/env node
/**
 * Match Fit outreach-event webhook — payload validation, message/keyboard formatting,
 * and callback / rewrite-command parsing.
 * Run: node tests/match-fit-outreach-event.test.mjs
 */
import assert from 'node:assert/strict';
import {
  buildLeadKeyboard,
  buildLeadMessage,
  parseOutreachCallback,
  parseRewriteCommand,
  rewriteCommandTemplate,
  validateOutreachEventPayload,
} from '../lib/match-fit-outreach-event.mjs';

// Valid new_leads payload passes and normalizes.
{
  const result = validateOutreachEventPayload({
    eventType: 'new_leads',
    leads: [
      {
        platform: 'instagram',
        leadId: ' lead_abc ',
        handle: '@fitcoach',
        contact: 'https://instagram.com/fitcoach',
        summary: 'ATL trainer, 12k followers, strong fit',
      },
    ],
    meta: { batch: 'today' },
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.eventType, 'new_leads');
  assert.equal(result.data.leads.length, 1);
  assert.equal(result.data.leads[0].leadId, 'lead_abc');
  assert.equal(result.data.leads[0].handle, '@fitcoach');
  assert.deepEqual(result.data.meta, { batch: 'today' });
}

// Lead with only the required fields (platform + leadId) is valid; optionals become undefined.
{
  const result = validateOutreachEventPayload({
    eventType: 'follow_up_due',
    leads: [{ platform: 'email', leadId: 'x1' }],
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.leads[0].handle, undefined);
  assert.equal(result.data.leads[0].contact, undefined);
}

// Bad eventType rejected.
{
  const r = validateOutreachEventPayload({ eventType: 'nope', leads: [{ platform: 'email', leadId: 'x' }] });
  assert.equal(r.ok, false);
  assert.match(r.error, /eventType/);
}

// Missing leads rejected.
{
  const r = validateOutreachEventPayload({ eventType: 'new_leads', leads: [] });
  assert.equal(r.ok, false);
  assert.match(r.error, /leads/);
}

// Bad platform rejected.
{
  const r = validateOutreachEventPayload({
    eventType: 'new_leads',
    leads: [{ platform: 'linkedin', leadId: 'x' }],
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /platform/);
}

// Missing leadId rejected.
{
  const r = validateOutreachEventPayload({
    eventType: 'new_leads',
    leads: [{ platform: 'instagram' }],
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /leadId/);
}

// Non-object / array body rejected.
{
  assert.equal(validateOutreachEventPayload(null).ok, false);
  assert.equal(validateOutreachEventPayload('nope').ok, false);
  assert.equal(validateOutreachEventPayload([1, 2]).ok, false);
}

// Non-string optional field rejected.
{
  const r = validateOutreachEventPayload({
    eventType: 'new_leads',
    leads: [{ platform: 'instagram', leadId: 'x', handle: 123 }],
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /handle/);
}

// Instagram new_leads message includes profile link + why-fit summary.
{
  const lead = {
    platform: 'instagram',
    leadId: 'lead_abc',
    handle: '@fitcoach',
    contact: 'https://instagram.com/fitcoach',
    summary: 'ATL trainer, strong fit',
  };
  const msg = buildLeadMessage('new_leads', lead, {});
  assert.match(msg, /New lead/);
  assert.match(msg, /Profile: https:\/\/instagram\.com\/fitcoach/);
  assert.match(msg, /Why they fit/);
  assert.match(msg, /ATL trainer, strong fit/);
}

// follow_up_due message is a reminder with the stage.
{
  const msg = buildLeadMessage(
    'follow_up_due',
    { platform: 'email', leadId: 'e1', handle: 'Coach K' },
    { followUpStage: 'follow_up_2' },
  );
  assert.match(msg, /Follow-up due/);
  assert.match(msg, /follow_up_2/);
}

// pending_response message includes the drafted response.
{
  const msg = buildLeadMessage(
    'pending_response',
    { platform: 'instagram', leadId: 'p1', handle: '@lead', summary: 'Yes, tell me more!' },
    {},
  );
  assert.match(msg, /needs a response/);
  assert.match(msg, /Yes, tell me more!/);
}

// Keyboard has Approve / Delete / Rewrite with mf: callback_data under 64 bytes.
{
  const kb = buildLeadKeyboard({ platform: 'instagram', leadId: 'lead_abc' });
  const row = kb.inline_keyboard[0];
  assert.equal(row.length, 3);
  assert.equal(row[0].callback_data, 'mf:ap:ig:lead_abc');
  assert.equal(row[1].callback_data, 'mf:dl:ig:lead_abc');
  assert.equal(row[2].callback_data, 'mf:rw:ig:lead_abc');
  for (const btn of row) {
    assert.ok(Buffer.byteLength(btn.callback_data, 'utf8') <= 64);
  }
}

// Callback parsing round-trips.
{
  assert.deepEqual(parseOutreachCallback('mf:ap:ig:lead_abc'), {
    action: 'ap',
    platform: 'instagram',
    leadId: 'lead_abc',
  });
  assert.deepEqual(parseOutreachCallback('mf:dl:fb:XYZ'), {
    action: 'dl',
    platform: 'facebook',
    leadId: 'XYZ',
  });
  assert.equal(parseOutreachCallback('cm:ap:xyz'), null);
  assert.equal(parseOutreachCallback('mf:zz:ig:x'), null);
  assert.equal(parseOutreachCallback('mf:ap:zz:x'), null);
  assert.equal(parseOutreachCallback('mf:ap:ig'), null);
}

// Rewrite command template + parse preserve case-sensitive leadId.
{
  assert.equal(rewriteCommandTemplate('instagram', 'Lead_AbC'), '/mf_rewrite ig:Lead_AbC ');
  const rw = parseRewriteCommand('/mf_rewrite ig:Lead_AbC Here is my new DM copy');
  assert.deepEqual(rw, { platform: 'instagram', leadId: 'Lead_AbC', text: 'Here is my new DM copy' });
  assert.equal(parseRewriteCommand('/mf_rewrite ig:Lead_AbC'), null); // no text
  assert.equal(parseRewriteCommand('/mf_rewrite bogus'), null);
}

console.log('match-fit-outreach-event.test.mjs: all assertions passed');
