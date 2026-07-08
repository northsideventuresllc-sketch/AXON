import { parseEmailAddress } from '../lib/email-domain-sync.mjs';
import { isDomainVerified, parseResendDomainError } from '../lib/resend-domains.mjs';
import assert from 'node:assert/strict';

assert.equal(parseEmailAddress('JB <jb@northsideintelligence.com>').domain, 'northsideintelligence.com');
assert.equal(parseEmailAddress('jb@northsideintelligence.com').formatted, 'jb@northsideintelligence.com');
assert.ok(parseEmailAddress('bad').error);

const planErr = parseResendDomainError({ message: 'Your plan includes 1 domain. Upgrade to add more.' });
assert.equal(planErr.code, 'domain_plan_limit');
assert.equal(planErr.canReplace, true);

assert.equal(isDomainVerified('verified'), true);
assert.equal(isDomainVerified('pending'), false);

console.log('email-domain-sync tests passed');
