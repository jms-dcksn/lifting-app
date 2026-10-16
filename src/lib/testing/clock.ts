import { beforeEach, afterEach, vi } from "vitest";

/** Freeze Date only: async IO and real concurrency keep their own timers. */
export function registerFixedClock(instant = "2026-10-15T12:00:00.000Z") {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(instant)); });
  afterEach(() => vi.useRealTimers());
}
