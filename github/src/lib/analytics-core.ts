// The only values accepted by the analytics API. Keep the SQL constraints in sync.
export const EVENT_NAMES = [
  'page_view', 'hero_start_journal_clicked', 'journal_opened', 'memory_editor_opened',
  'memory_created', 'memory_created_with_photo', 'memory_photos_added', 'memory_edited',
  'memory_deleted', 'signup_started', 'signup_completed', 'login_completed', 'logout',
  'guest_memories_import_started', 'guest_memories_import_completed',
  'beta_feedback_submitted', 'returning_visitor', 'first_memory_created',
] as const;
export type AnalyticsEvent = typeof EVENT_NAMES[number];
export const SOURCES = [
  'hero', 'navigation', 'menu', 'intro', 'how_it_works', 'end', 'footer',
  'beta', 'account', 'journal', 'memory_detail', 'composer', 'import',
] as const;
export type AnalyticsSource = typeof SOURCES[number];
export type AnalyticsMode = 'guest' | 'cloud';
export type EventMetadata = {
  source?: AnalyticsSource;
  mode?: AnalyticsMode;
  photo_count?: number;
  memory_count?: number;
  confirmation_required?: boolean;
};
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'] as const;
type Attribution = Partial<Record<typeof UTM_KEYS[number], string>>;
export type AnalyticsEnvelope = {
  id: string;
  event_name: AnalyticsEvent;
  session_id: string;
  metadata: EventMetadata & Attribution;
};
export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
export type AnalyticsEnvironment = {
  storage?: StorageLike;
  search: string;
  now: () => number;
  uuid: () => string;
  defer: (task: () => void) => void;
  send: (event: AnalyticsEnvelope) => Promise<void>;
  disabled?: boolean;
};
const SESSION_KEY = 'momento_session_id';
const ATTRIBUTION_KEY = 'momento_first_touch_v1';
const VISITED_KEY = 'momento_has_visited';
const ACTIVITY_KEY = 'momento_last_activity_at';
const FIRST_MEMORY_KEY = 'momento_first_memory_created';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CAMPAIGN_SLUG = /^[a-z0-9][a-z0-9._-]{0,79}$/i;
const VISIT_GAP = 30 * 60 * 1000;

function attributionFrom(value: unknown): Attribution {
  const clean: Attribution = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return clean;
  for (const key of UTM_KEYS) {
    const v = (value as Record<string, unknown>)[key];
    // Campaign slugs only: URLs, emails, whitespace and arbitrary query data are discarded.
    if (typeof v === 'string' && CAMPAIGN_SLUG.test(v)) clean[key] = v.toLowerCase();
  }
  return clean;
}

export function sanitizeMetadata(value: unknown): EventMetadata {
  const clean: EventMetadata = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return clean;
  const v = value as Record<string, unknown>;
  if (typeof v.source === 'string' && (SOURCES as readonly string[]).includes(v.source)) clean.source = v.source as AnalyticsSource;
  if (v.mode === 'guest' || v.mode === 'cloud') clean.mode = v.mode;
  if (typeof v.photo_count === 'number' && Number.isInteger(v.photo_count) && v.photo_count >= 0 && v.photo_count <= 5) clean.photo_count = v.photo_count;
  if (typeof v.memory_count === 'number' && Number.isInteger(v.memory_count) && v.memory_count >= 0 && v.memory_count <= 100000) clean.memory_count = v.memory_count;
  if (typeof v.confirmation_required === 'boolean') clean.confirmation_required = v.confirmation_required;
  return clean;
}

// A small pure core lets tests exercise storage failure, deduplication and privacy
// without network access, a second Supabase client, or real accounts.
export function createAnalyticsTracker(env: AnalyticsEnvironment) {
  let context: { sessionId: string; attribution: Attribution; hadStoredId: boolean } | undefined;
  let pageTracked = false;
  let guestFirstRecorded = false;
  const cloudFirstRecorded = new Set<string>();
  function read(key: string) { try { return env.storage?.getItem(key) ?? null; } catch { return null; } }
  function write(key: string, value: string) { try { env.storage?.setItem(key, value); } catch { /* Storage is optional. */ } }
  function getContext() {
    if (context) return context;
    const stored = read(SESSION_KEY);
    const hadStoredId = !!stored && UUID.test(stored);
    const sessionId = hadStoredId ? stored : env.uuid();
    write(SESSION_KEY, sessionId);
    let attribution: Attribution;
    const original = read(ATTRIBUTION_KEY);
    if (original !== null) {
      // A direct first visit is also a first touch; later campaigns must not overwrite it.
      try { attribution = attributionFrom(JSON.parse(original)); } catch { attribution = {}; }
    } else {
      const params = new URLSearchParams(env.search);
      attribution = attributionFrom(Object.fromEntries(UTM_KEYS.map(k => [k, params.get(k)])));
    }
    write(ATTRIBUTION_KEY, JSON.stringify(attribution));
    context = { sessionId, attribution, hadStoredId };
    return context;
  }
  function trackEvent(eventName: AnalyticsEvent, metadata?: EventMetadata) {
    if (env.disabled) return;
    try {
      if (!(EVENT_NAMES as readonly string[]).includes(eventName)) return;
      const { sessionId, attribution } = getContext();
      const envelope: AnalyticsEnvelope = {
        id: env.uuid(), event_name: eventName, session_id: sessionId,
        metadata: { ...sanitizeMetadata(metadata), ...attribution },
      };
      write(ACTIVITY_KEY, String(env.now()));
      // Neither transport errors nor a slow connection can affect the caller.
      env.defer(() => {
        try { void env.send(envelope).catch(() => {}); } catch { /* Best effort. */ }
      });
    } catch { /* Analytics is never required to use the journal. */ }
  }
  function trackPageView() {
    if (env.disabled || pageTracked) return;
    try {
      const { hadStoredId } = getContext();
      const lastActivity = Number(read(ACTIVITY_KEY));
      const returning = hadStoredId && read(VISITED_KEY) === 'true' &&
        (!lastActivity || env.now() - lastActivity >= VISIT_GAP);
      pageTracked = true;
      write(VISITED_KEY, 'true');
      trackEvent('page_view');
      if (returning) trackEvent('returning_visitor');
    } catch { /* Best effort. */ }
  }
  function rememberGuestMemory() {
    if (env.disabled) return;
    guestFirstRecorded = true;
    write(FIRST_MEMORY_KEY, 'true');
  }
  function trackGuestFirstMemory(metadata: EventMetadata) {
    if (env.disabled || guestFirstRecorded || read(FIRST_MEMORY_KEY) === 'true') return;
    rememberGuestMemory();
    trackEvent('first_memory_created', { ...metadata, mode: 'guest' });
  }
  function hasRecordedCloudFirstMemory(userId: string) {
    return env.disabled || cloudFirstRecorded.has(userId) ||
      read(`momento_first_cloud_memory_v1:${userId}`) === 'true';
  }
  function trackCloudFirstMemory(userId: string, metadata: EventMetadata) {
    if (!UUID.test(userId) || hasRecordedCloudFirstMemory(userId)) return;
    cloudFirstRecorded.add(userId);
    write(`momento_first_cloud_memory_v1:${userId}`, 'true');
    trackEvent('first_memory_created', { ...metadata, mode: 'cloud' });
  }
  return { trackEvent, trackPageView, trackGuestFirstMemory, rememberGuestMemory,
    hasRecordedCloudFirstMemory, trackCloudFirstMemory };
}
