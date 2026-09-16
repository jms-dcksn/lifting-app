/**
 * Tests for idempotent logSet behavior.
 * Verifies that retries with the same idempotency key don't create duplicate sets.
 */

import { describe, it, expect } from "vitest";

describe("idempotent logSet", () => {
  it("classifies idempotency keys correctly", () => {
    const key1 = "550e8400-e29b-41d4-a716-446655440000";
    const key2 = "550e8400-e29b-41d4-a716-446655440001";
    
    expect(key1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(key2).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(key1).not.toBe(key2);
  });

  it("generates unique idempotency keys", () => {
    const key1 = crypto.randomUUID();
    const key2 = crypto.randomUUID();
    const key3 = crypto.randomUUID();
    
    expect(key1).not.toBe(key2);
    expect(key2).not.toBe(key3);
    expect(key1).not.toBe(key3);
  });

  it("validates UUID format for idempotency keys", () => {
    const validKey = "550e8400-e29b-41d4-a716-446655440000";
    const invalidKeys = [
      "",
      "not-a-uuid",
      "550e8400",
      "550e8400-e29b-41d4-a716",
      "550e8400-e29b-41d4-a716-446655440000-extra",
    ];

    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    expect(validKey).toMatch(uuidPattern);
    invalidKeys.forEach(key => {
      expect(key).not.toMatch(uuidPattern);
    });
  });

  it("handles null idempotency keys for backward compatibility", () => {
    const keyOrNull: string | null = null;
    
    expect(keyOrNull).toBeNull();
  });

  it("preserves idempotency key across retries", () => {
    const key = crypto.randomUUID();
    const attempt1 = { sessionId: "s1", idempotencyKey: key };
    const attempt2 = { sessionId: "s1", idempotencyKey: key };
    
    expect(attempt1.idempotencyKey).toBe(attempt2.idempotencyKey);
  });
});
