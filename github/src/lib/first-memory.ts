type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

// Onboarding is independent of analytics opt-outs and never stores journal content.
export function createFirstMemoryState(storage?: StorageLike) {
  const kept = new Set<string>();
  const keyFor = (userId?: string) => `momento_first_memory_kept_v1:${userId || 'guest'}`;
  function has(userId?: string) {
    const key = keyFor(userId);
    if (kept.has(key)) return true;
    try { return storage?.getItem(key) === 'true'; } catch { return false; }
  }
  function remember(userId?: string) {
    const key = keyFor(userId);
    kept.add(key);
    try { storage?.setItem(key, 'true'); } catch { /* The current page still remembers. */ }
  }
  return { has, remember };
}

function browserStorage(): StorageLike | undefined {
  try { return typeof window === 'undefined' ? undefined : window.localStorage; }
  catch { return undefined; }
}
export const firstMemoryState = createFirstMemoryState(browserStorage());
