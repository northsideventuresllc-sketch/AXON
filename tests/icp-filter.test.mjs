#!/usr/bin/env node
/**
 * Minimal ICP filter smoke tests — run: node tests/icp-filter.test.mjs
 */
import assert from 'node:assert/strict';
import {
  preScanRejectReason,
  postScanRejectReason,
  scanIcpRejectReason,
  matchesAggregatePattern,
} from '../lib/icp-filter.mjs';

assert.equal(
  preScanRejectReason({
    title: 'Indeed Jobs in Austin',
    snippet: 'Find jobs near you',
    link: 'https://www.indeed.com/viewjob',
  }),
  'job-board domain: indeed.com'
);

assert.equal(
  preScanRejectReason({
    title: 'Acme Logistics LLC',
    snippet: '25 best trucking jobs in Texas hiring now',
    link: 'https://acmelogistics.example.com',
  }),
  'aggregate-post snippet: 25 best trucking jobs in Texas hiring now'
);

assert.equal(
  preScanRejectReason(
    {
      title: 'Beta Manufacturing',
      snippet: 'Family-owned logistics firm seeking ops automation',
      link: 'https://beta.example.com',
    },
    { operatorAvoidPatterns: ['wrong icp'] }
  ),
  null
);

assert.equal(
  preScanRejectReason(
    {
      title: 'Beta Manufacturing',
      snippet: 'wrong icp — not our target segment',
      link: 'https://x.com',
    },
    { operatorAvoidPatterns: ['wrong icp'] }
  ),
  'operator avoid: wrong icp'
);

assert.equal(scanIcpRejectReason({ icp_fit: false, icp_reject_reason: 'staffing agency' }), 'staffing agency');
assert.equal(scanIcpRejectReason({ icp_fit: true }), null);

assert.equal(
  postScanRejectReason({
    company: 'ZipRecruiter',
    sourceLink: 'https://company.example.com',
    scan: { icp_fit: true },
  }),
  'job-board company: ZipRecruiter'
);

assert.ok(matchesAggregatePattern('Now hiring warehouse associates'));

console.log('icp-filter tests passed');
