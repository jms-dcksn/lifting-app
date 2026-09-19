import { afterEach, describe, expect, it } from "vitest";
import {
  readRestEndsAt,
  restRemainingSeconds,
  restTimerStorageKey,
  subscribeRestTimer,
  writeRestEndsAt,
  type RestTimerStore,
} from "./rest-timer-state";

function memoryStore(initial: Record<string, string> = {}): RestTimerStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

afterEach(() => {
  writeRestEndsAt(null, "workout-1", null);
  writeRestEndsAt(null, "a", null);
  writeRestEndsAt(null, "b", null);
});

describe("rest timer persistence", () => {
  const sessionId = "workout-1";
  const now = 1_000_000;

  it("round-trips an absolute end timestamp", () => {
    const store = memoryStore();
    const endsAt = now + 90_000;
    writeRestEndsAt(store, sessionId, endsAt);
    expect(store.data[restTimerStorageKey(sessionId)]).toBe(String(endsAt));
    expect(readRestEndsAt(store, sessionId, now)).toBe(endsAt);
    expect(restRemainingSeconds(endsAt, now)).toBe(90);
  });

  it("does not restore an expired countdown", () => {
    const store = memoryStore({ [restTimerStorageKey(sessionId)]: String(now - 1) });
    expect(readRestEndsAt(store, sessionId, now)).toBeNull();
  });

  it("clears storage when the timer is skipped or completed", () => {
    const store = memoryStore();
    writeRestEndsAt(store, sessionId, now + 30_000);
    writeRestEndsAt(store, sessionId, null);
    expect(readRestEndsAt(store, sessionId, now)).toBeNull();
    expect(store.data).toEqual({});
  });

  it("keeps a countdown in memory when sessionStorage is unavailable", () => {
    const endsAt = now + 45_000;
    writeRestEndsAt(null, sessionId, endsAt);
    expect(readRestEndsAt(null, sessionId, now)).toBe(endsAt);
    writeRestEndsAt(null, sessionId, null);
    expect(readRestEndsAt(null, sessionId, now)).toBeNull();
  });

  it("notifies subscribers in the same tab when the end timestamp changes", () => {
    const store = memoryStore();
    let calls = 0;
    const stop = subscribeRestTimer(sessionId, () => {
      calls += 1;
    });
    writeRestEndsAt(store, sessionId, now + 10_000);
    writeRestEndsAt(store, sessionId, null);
    expect(calls).toBe(2);
    stop();
  });

  it("keeps workouts isolated by session id", () => {
    const store = memoryStore();
    writeRestEndsAt(store, "a", now + 10_000);
    writeRestEndsAt(store, "b", now + 20_000);
    expect(readRestEndsAt(store, "a", now)).toBe(now + 10_000);
    writeRestEndsAt(store, "a", null);
    expect(readRestEndsAt(store, "b", now)).toBe(now + 20_000);
  });
});
