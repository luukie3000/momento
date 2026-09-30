import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnalyticsTracker, sanitizeMetadata } from '../src/lib/analytics-core.ts';

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
function harness(options = {}) {
  const sent = [], queued = [];
  let sequence = 0;
  const env = {
    storage: storage(), search: '', now: () => 1801300000000,
    uuid: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    defer: task => queued.push(task), send: async event => { sent.push(event); }, ...options,
  };
  const tracker = createAnalyticsTracker(env);
  const flush = async () => { while (queued.length) queued.shift()(); await Promise.resolve(); };
  return { tracker, env, sent, flush };
}

test('allowlist strips private content and rejects malformed safe values', () => {
  assert.deepEqual(sanitizeMetadata({ source: 'hero', mode: 'guest', photo_count: 3,
    memory_count: 4, confirmation_required: true, text: 'PRIVATE', title: 'PRIVATE',
    location: 'PRIVATE', email: 'PRIVATE', photo_url: 'PRIVATE', filename: 'PRIVATE',
    password: 'PRIVATE', bio: 'PRIVATE', utm_source: 'override' }),
    { source: 'hero', mode: 'guest', photo_count: 3, memory_count: 4, confirmation_required: true });
  for (const value of [null, [], 'PRIVATE', { source: 'PRIVATE', mode: 'PRIVATE',
    photo_count: 6, memory_count: 1.5, confirmation_required: 'true' }])
    assert.deepEqual(sanitizeMetadata(value), {});
});

test('delivery is deferred, failure is silent, and invalid events are ignored', async () => {
  const h = harness({ send: async () => { throw new Error('offline'); } });
  assert.equal(h.tracker.trackEvent('page_view'), undefined);
  await h.flush();
  h.tracker.trackEvent('PRIVATE');
  await h.flush();
  const sync = harness({ send: () => { throw new Error('sync failure'); } });
  sync.tracker.trackEvent('page_view');
  await sync.flush();
  const deferred = harness();
  deferred.tracker.trackEvent('page_view');
  assert.equal(deferred.sent.length, 0);
  await deferred.flush();
  assert.equal(deferred.sent.length, 1);
});

test('persistent browser UUID survives reload and event IDs are distinct', async () => {
  const h = harness();
  h.tracker.trackPageView(); h.tracker.trackEvent('journal_opened'); await h.flush();
  const next = harness({ storage: h.env.storage });
  next.tracker.trackPageView(); await next.flush();
  assert.equal(h.sent[0].session_id, next.sent[0].session_id);
  assert.notEqual(h.sent[0].id, h.sent[1].id);
});

test('blocked storage uses one in-memory UUID and does not block events', async () => {
  const h = harness({ storage: { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } } });
  h.tracker.trackPageView(); h.tracker.trackEvent('memory_created'); await h.flush();
  assert.equal(h.sent.length, 2);
  assert.equal(h.sent[0].session_id, h.sent[1].session_id);
});

test('first-touch Pinterest attribution persists and unsafe query data is omitted', async () => {
  const h = harness({ search: '?utm_source=Pinterest&utm_medium=organic&utm_campaign=launch&utm_content=journal_video&email=private@example.com&location=PRIVATE' });
  h.tracker.trackPageView(); await h.flush();
  const next = harness({ storage: h.env.storage, search: '?utm_source=other&utm_campaign=other' });
  next.tracker.trackEvent('signup_completed', { source: 'account' }); await next.flush();
  assert.deepEqual(next.sent[0].metadata, { source: 'account', utm_source: 'pinterest',
    utm_medium: 'organic', utm_campaign: 'launch', utm_content: 'journal_video' });
  const unsafe = harness({ search: '?utm_source=private@example.com&utm_campaign=https%3A%2F%2Fexample.com&utm_content=a%20private%20story&utm_medium=' + 'x'.repeat(81) });
  unsafe.tracker.trackPageView(); await unsafe.flush();
  assert.deepEqual(unsafe.sent[0].metadata, {});
});

test('a direct first touch stays direct on later campaign visits', async () => {
  const h = harness(); h.tracker.trackPageView(); await h.flush();
  const next = harness({ storage: h.env.storage, search: '?utm_source=pinterest' });
  next.tracker.trackPageView(); await next.flush();
  assert.deepEqual(next.sent[0].metadata, {});
});

test('one page_view in StrictMode; active-visit refresh is not a return', async () => {
  const h = harness(); h.tracker.trackPageView(); h.tracker.trackPageView(); await h.flush();
  assert.deepEqual(h.sent.map(e => e.event_name), ['page_view']);
  const next = harness({ storage: h.env.storage, now: () => h.env.now() + 1000 });
  next.tracker.trackPageView(); await next.flush();
  assert.deepEqual(next.sent.map(e => e.event_name), ['page_view']);
});

test('an existing browser returning after 30 minutes fires returning_visitor', async () => {
  const h = harness(); h.tracker.trackPageView(); await h.flush();
  const next = harness({ storage: h.env.storage, now: () => h.env.now() + 30 * 60 * 1000 });
  next.tracker.trackPageView(); next.tracker.trackPageView(); await next.flush();
  assert.deepEqual(next.sent.map(e => e.event_name), ['page_view', 'returning_visitor']);
});

test('first guest memory fires once across reload and is suppressed for existing journals', async () => {
  const h = harness();
  h.tracker.trackGuestFirstMemory({ photo_count: 2 });
  h.tracker.trackGuestFirstMemory({ photo_count: 0 }); await h.flush();
  assert.deepEqual(h.sent.map(e => e.event_name), ['first_memory_created']);
  assert.equal(h.sent[0].metadata.mode, 'guest');
  const next = harness({ storage: h.env.storage });
  next.tracker.trackGuestFirstMemory({}); await next.flush();
  assert.equal(next.sent.length, 0);
  const existing = harness(); existing.tracker.rememberGuestMemory();
  existing.tracker.trackGuestFirstMemory({}); await existing.flush();
  assert.equal(existing.sent.length, 0);
});

test('DNT/GPC opt out generates no browser identity or events', async () => {
  const h = harness({ disabled: true });
  h.tracker.trackPageView(); h.tracker.trackEvent('journal_opened');
  h.tracker.trackGuestFirstMemory({}); h.tracker.rememberGuestMemory(); await h.flush();
  assert.equal(h.sent.length, 0);
  assert.equal(h.env.storage.getItem('momento_session_id'), null);
  assert.equal(h.env.storage.getItem('momento_first_memory_created'), null);
});

test('first cloud conversion is remembered per account across reloads and with blocked storage', async () => {
  const userA = '10000000-0000-4000-8000-000000000001';
  const userB = '10000000-0000-4000-8000-000000000002';
  const h = harness();
  h.tracker.trackCloudFirstMemory(userA, {});
  h.tracker.trackCloudFirstMemory(userA, {});
  h.tracker.trackCloudFirstMemory(userB, {}); await h.flush();
  assert.equal(h.sent.length, 2);
  assert.ok(h.sent.every(e => e.metadata.mode === 'cloud'));
  const next = harness({ storage: h.env.storage });
  assert.equal(next.tracker.hasRecordedCloudFirstMemory(userA), true);
  next.tracker.trackCloudFirstMemory(userA, {}); await next.flush();
  assert.equal(next.sent.length, 0);
  const blocked = harness({ storage: undefined });
  blocked.tracker.trackCloudFirstMemory(userA, {});
  blocked.tracker.trackCloudFirstMemory(userA, {}); await blocked.flush();
  assert.equal(blocked.sent.length, 1);
});
