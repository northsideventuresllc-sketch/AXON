#!/usr/bin/env node
/**
 * Match Fit posting-confirmation webhook — payload validation.
 * Run: node tests/match-fit-posting-confirmation.test.mjs
 */
import assert from 'node:assert/strict';
import {
  buildPostingConfirmationNotification,
  validatePostingConfirmationPayload,
} from '../lib/match-fit-posting-confirmation.mjs';

// Valid payload passes and normalizes fields.
{
  const result = validatePostingConfirmationPayload({
    batchId: ' batch-123 ',
    posts: [
      { platform: 'instagram', url: 'https://instagram.com/p/abc', postedAt: '2026-07-23T14:00:00Z' },
      { platform: 'tiktok', url: 'https://tiktok.com/@x/video/1', postedAt: '2026-07-23T14:05:00.000Z' },
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.batchId, 'batch-123');
  assert.equal(result.data.posts.length, 2);
  assert.equal(result.data.posts[0].platform, 'instagram');
}

// Missing batchId is rejected.
{
  const result = validatePostingConfirmationPayload({
    posts: [{ platform: 'instagram', url: 'https://instagram.com/p/abc', postedAt: '2026-07-23T14:00:00Z' }],
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /batchId/);
}

// Empty posts array is rejected.
{
  const result = validatePostingConfirmationPayload({ batchId: 'b1', posts: [] });
  assert.equal(result.ok, false);
  assert.match(result.error, /posts/);
}

// Non-array body is rejected.
{
  assert.equal(validatePostingConfirmationPayload(null).ok, false);
  assert.equal(validatePostingConfirmationPayload('nope').ok, false);
  assert.equal(validatePostingConfirmationPayload([1, 2]).ok, false);
}

// Bad URL is rejected.
{
  const result = validatePostingConfirmationPayload({
    batchId: 'b1',
    posts: [{ platform: 'instagram', url: 'not-a-url', postedAt: '2026-07-23T14:00:00Z' }],
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /url/);
}

// Bad postedAt is rejected.
{
  const result = validatePostingConfirmationPayload({
    batchId: 'b1',
    posts: [{ platform: 'instagram', url: 'https://instagram.com/p/abc', postedAt: 'yesterday' }],
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /postedAt/);
}

// Missing platform is rejected.
{
  const result = validatePostingConfirmationPayload({
    batchId: 'b1',
    posts: [{ url: 'https://instagram.com/p/abc', postedAt: '2026-07-23T14:00:00Z' }],
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /platform/);
}

// Notification builder shapes a Match Fit-sourced AxonNotification.
{
  const { data } = validatePostingConfirmationPayload({
    batchId: 'batch-9',
    posts: [
      { platform: 'instagram', url: 'https://instagram.com/p/abc', postedAt: '2026-07-23T14:00:00Z' },
      { platform: 'tiktok', url: 'https://tiktok.com/@x/video/1', postedAt: '2026-07-23T14:05:00Z' },
    ],
  });
  const notification = buildPostingConfirmationNotification(data);
  assert.equal(notification.source, 'Match Fit');
  assert.match(notification.title, /2 posts went live/);
  assert.equal(notification.href, 'https://instagram.com/p/abc');
  assert.equal(notification.links.length, 2);
  assert.equal(notification.links[0].url, 'https://instagram.com/p/abc');
}

// Single-post title is singular.
{
  const { data } = validatePostingConfirmationPayload({
    batchId: 'batch-1',
    posts: [{ platform: 'instagram', url: 'https://instagram.com/p/abc', postedAt: '2026-07-23T14:00:00Z' }],
  });
  const notification = buildPostingConfirmationNotification(data);
  assert.match(notification.title, /^1 post went live on instagram$/);
}

console.log('match-fit-posting-confirmation.test.mjs: all assertions passed');
