import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { retryServerAction } from "./retry";

describe("retryServerAction", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns result on first success", async () => {
    const fn = vi.fn(async () => 42);
    const result = await retryServerAction(fn);
    expect(result).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on network error and succeeds on second attempt", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce("success");
    const onRetry = vi.fn();

    const promise = retryServerAction(fn, { onRetry });
    
    // First attempt fails, then delay ~250ms
    await vi.advanceTimersByTimeAsync(300);
    
    const result = await promise;
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Number));
  });

  it("exhausts all retries and throws final error", async () => {
    const error = new TypeError("network error");
    const fn = vi.fn().mockRejectedValue(error);
    const onRetry = vi.fn();

    const promise = retryServerAction(fn, { onRetry });
    
    // First retry after ~250ms
    await vi.advanceTimersByTimeAsync(300);
    // Second retry after ~1000ms
    await vi.advanceTimersByTimeAsync(1100);
    
    await expect(promise).rejects.toThrow(error);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it("does not retry on validation errors (4xx)", async () => {
    const error = Object.assign(new Error("Validation failed"), { status: 400 });
    const fn = vi.fn().mockRejectedValue(error);
    const onRetry = vi.fn();

    await expect(retryServerAction(fn, { onRetry })).rejects.toThrow(error);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("does not retry on auth errors (401)", async () => {
    const error = Object.assign(new Error("Unauthorized"), { status: 401 });
    const fn = vi.fn().mockRejectedValue(error);

    await expect(retryServerAction(fn)).rejects.toThrow(error);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on 408 timeout", async () => {
    const error = Object.assign(new Error("Request timeout"), { status: 408 });
    const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce("ok");

    const promise = retryServerAction(fn);
    await vi.advanceTimersByTimeAsync(300);
    
    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on 429 rate limit", async () => {
    const error = Object.assign(new Error("Too many requests"), { status: 429 });
    const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce("ok");

    const promise = retryServerAction(fn);
    await vi.advanceTimersByTimeAsync(300);
    
    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on 5xx server errors", async () => {
    const error = Object.assign(new Error("Internal server error"), { status: 500 });
    const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce("ok");

    const promise = retryServerAction(fn);
    await vi.advanceTimersByTimeAsync(300);
    
    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on AbortError", async () => {
    const error = new DOMException("Aborted", "AbortError");
    const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce("ok");

    const promise = retryServerAction(fn);
    await vi.advanceTimersByTimeAsync(300);
    
    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry on non-retryable errors", async () => {
    const error = new Error("Some other error");
    const fn = vi.fn().mockRejectedValue(error);

    await expect(retryServerAction(fn)).rejects.toThrow(error);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("respects max 3 attempts", async () => {
    const error = new TypeError("persistent network error");
    const fn = vi.fn().mockRejectedValue(error);

    const promise = retryServerAction(fn);
    await vi.advanceTimersByTimeAsync(300);
    await vi.advanceTimersByTimeAsync(1100);
    
    await expect(promise).rejects.toThrow(error);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("invokes onRetry callback with attempt number", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network error"))
      .mockRejectedValueOnce(new TypeError("network error"))
      .mockResolvedValueOnce("success");
    const onRetry = vi.fn();

    const promise = retryServerAction(fn, { onRetry });
    await vi.advanceTimersByTimeAsync(300);
    await vi.advanceTimersByTimeAsync(1100);
    
    await promise;
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(Number));
    expect(onRetry).toHaveBeenNthCalledWith(2, 2, expect.any(Number));
  });
});
