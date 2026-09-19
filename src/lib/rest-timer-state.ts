export type RestTimerStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const memory = new Map<string, number>();
const listeners = new Map<string, Set<() => void>>();

export function restTimerStorageKey(sessionId: string) {
  return `lifting-rest-timer:${sessionId}`;
}

export function restRemainingSeconds(endsAt: number, now = Date.now()) {
  return Math.round((endsAt - now) / 1000);
}

export function browserRestTimerStore(): RestTimerStore | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

export function subscribeRestTimer(sessionId: string, onStoreChange: () => void) {
  if (!sessionId) return () => {};
  let set = listeners.get(sessionId);
  if (!set) {
    set = new Set();
    listeners.set(sessionId, set);
  }
  set.add(onStoreChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key === restTimerStorageKey(sessionId)) onStoreChange();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    set.delete(onStoreChange);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

function emitRestTimer(sessionId: string) {
  listeners.get(sessionId)?.forEach((fn) => fn());
}

function readStore(store: RestTimerStore | null, sessionId: string): number | null {
  if (!store) return null;
  try {
    const raw = store.getItem(restTimerStorageKey(sessionId));
    if (!raw) return null;
    const endsAt = Number(raw);
    return Number.isFinite(endsAt) ? endsAt : null;
  } catch {
    return null;
  }
}

export function readRestEndsAt(
  store: RestTimerStore | null,
  sessionId: string,
  now = Date.now(),
): number | null {
  if (!sessionId) return null;
  const endsAt = readStore(store, sessionId) ?? memory.get(sessionId) ?? null;
  if (endsAt == null || restRemainingSeconds(endsAt, now) <= 0) return null;
  return endsAt;
}

export function writeRestEndsAt(
  store: RestTimerStore | null,
  sessionId: string,
  endsAt: number | null,
) {
  if (!sessionId) return;
  if (endsAt == null) memory.delete(sessionId);
  else memory.set(sessionId, endsAt);
  if (store) {
    try {
      const key = restTimerStorageKey(sessionId);
      if (endsAt == null) store.removeItem(key);
      else store.setItem(key, String(endsAt));
    } catch {
      // private mode / quota — in-memory listeners still update
    }
  }
  emitRestTimer(sessionId);
}
