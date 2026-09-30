import { supabase } from './momento';
import {
  createAnalyticsTracker, type AnalyticsEnvelope, type AnalyticsMode,
  type AnalyticsSource, type StorageLike,
} from './analytics-core';
export type { AnalyticsEvent, AnalyticsSource, EventMetadata } from './analytics-core';

function storage(): StorageLike | undefined {
  try { return window.localStorage; } catch { return undefined; }
}
async function send(event: AnalyticsEnvelope) {
  if (!supabase) return;
  // Run outside auth-state callbacks. The existing client supplies the matching JWT.
  const { data, error } = await supabase.auth.getSession();
  if (error) return;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5000);
  try {
    // No .select(): frontend roles are deliberately unable to read analytics rows.
    await supabase.from('analytics_events').insert({
      ...event, user_id: data.session?.user.id ?? null,
    }).abortSignal(controller.signal);
  } finally { window.clearTimeout(timeout); }
}

const disabled = navigator.doNotTrack === '1' ||
  (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
const tracker = createAnalyticsTracker({
  storage: storage(), search: window.location.search,
  now: () => Date.now(), uuid: () => crypto.randomUUID(),
  defer: task => { window.setTimeout(task, 0); }, send,
  disabled,
});
export const { trackEvent, trackPageView, rememberGuestMemory } = tracker;

type CreatedMemory = {
  mode: AnalyticsMode;
  photoCount: number;
  source: AnalyticsSource;
  memoryId: string;
  userId?: string;
  hadMemories: boolean;
};
export function recordMemoryCreated(info: CreatedMemory) {
  if (disabled) return;
  const metadata = { photo_count: info.photoCount, mode: info.mode, source: info.source };
  trackEvent('memory_created', metadata);
  if (info.photoCount > 0) {
    trackEvent('memory_created_with_photo', metadata);
    trackEvent('memory_photos_added', metadata);
  }
  if (info.mode === 'guest') {
    if (info.hadMemories) rememberGuestMemory();
    else tracker.trackGuestFirstMemory(metadata);
  } else if (!info.hadMemories && info.userId && supabase &&
    !tracker.hasRecordedCloudFirstMemory(info.userId)) {
    // Check only IDs, asynchronously after the save. A failed check never delays it.
    // This also handles a stale/failed journal refresh without calling existing
    // cloud memories a first conversion. SQL unique indexes deduplicate across devices.
    void (async () => {
      const { data: auth } = await supabase.auth.getSession();
      if (auth.session?.user.id !== info.userId) return;
      const { data, error } = await supabase.from('memories').select('id')
        .eq('user_id', info.userId).order('created_at', { ascending: true })
        .order('id', { ascending: true }).limit(1).maybeSingle();
      if (!error && data?.id === info.memoryId) tracker.trackCloudFirstMemory(info.userId!, metadata);
    })().catch(() => {});
  }
}
