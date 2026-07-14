#!/usr/bin/env node
/**
 * Match Fit Ad Tracker helpers — run: node tests/mf-ad-tracker.test.mjs
 */
import assert from 'node:assert/strict';
import {
  attributionRowsToPlatformSnapshots,
  easternDayKey,
  easternDayWindow,
  parseMetaConversions,
} from '../lib/mf-ad-tracker.mjs';

assert.equal(
  parseMetaConversions([
    { action_type: 'link_click', value: '9' },
    { action_type: 'lead', value: '2' },
    { action_type: 'offsite_conversion.fb_pixel_subscribe', value: '1' },
  ]),
  3,
);

assert.equal(parseMetaConversions(null), 0);
assert.equal(parseMetaConversions('x'), 0);

const day = easternDayKey(new Date('2026-07-14T16:00:00Z'));
assert.match(day, /^\d{4}-\d{2}-\d{2}$/);

const window = easternDayWindow(3, new Date('2026-07-14T16:00:00Z'));
assert.equal(window.length, 3);
assert.equal(window[0], easternDayKey(new Date('2026-07-14T16:00:00Z')));

const snaps = attributionRowsToPlatformSnapshots([
  {
    day_et: '2026-07-13',
    utm_source: 'fb',
    utm_medium: 'paid',
    utm_campaign: '120245634588600227',
    page_views: 38,
    unique_visitors: 33,
  },
  {
    day_et: '2026-07-13',
    utm_source: 'ig',
    utm_medium: 'paid',
    utm_campaign: '120245711272900227',
    page_views: 5,
    unique_visitors: 5,
  },
  {
    day_et: '2026-07-13',
    utm_source: 'tiktok',
    utm_medium: 'paid',
    utm_campaign: 'boost_1',
    page_views: 2,
    unique_visitors: 2,
  },
  {
    day_et: '2026-07-13',
    utm_source: 'newsletter',
    utm_medium: 'email',
    utm_campaign: 'x',
    page_views: 9,
    unique_visitors: 9,
  },
]);

assert.equal(snaps.length, 2);
const meta = snaps.find((s) => s.platform === 'meta');
const tiktok = snaps.find((s) => s.platform === 'tiktok');
assert.ok(meta);
assert.ok(tiktok);
assert.equal(meta.clicks, 43);
assert.equal(meta.spendCents, 0);
assert.equal(tiktok.clicks, 2);
assert.equal(meta.rawJson.source, 'site_attribution');
assert.equal(meta.rawJson.campaigns.length, 2);

console.log('mf-ad-tracker.test.mjs OK');
