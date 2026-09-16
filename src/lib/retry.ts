/**
 * Client-side retry helper for Server Actions on transient failures.
 *
 * Retries network errors, timeouts, and HTTP 408/429/5xx responses with
 * exponential backoff and jitter. Never retries validation/auth 4xx errors
 * (except 408/429). Max 3 attempts total.
 *
 * Backoff schedule: ~250ms → 1s → 2s with ±25% jitter.
 */

export interface RetryOptions {
  /**
   * Callback invoked after first failure and before each retry attempt.
   * Use for UI feedback like "Retrying…"
   */
  onRetry?: (attempt: number, delay: number) => void;
}

/**
 * Classification of errors for retry eligibility.
 */
function isRetryableError(error: unknown): boolean {
  // Network/fetch failures (no response received)
  if (error instanceof TypeError) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("fetch") ||
      msg.includes("network") ||
      msg.includes("timeout") ||
      msg.includes("connection")
    );
  }

  // HTTP status codes
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: number }).status;
    // Retry 408 (timeout), 429 (rate limit), 5xx (server errors)
    return status === 408 || status === 429 || (status >= 500 && status < 600);
  }

  // Abort/timeout errors
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }

  return false;
}

/**
 * Calculate delay for a retry attempt with exponential backoff and jitter.
 * @param attempt - Retry attempt number (1-based)
 * @returns Delay in milliseconds
 */
function calculateDelay(attempt: number): number {
  const baseDelays = [250, 1000, 2000];
  const base = baseDelays[attempt - 1] ?? 2000;
  // Add ±25% jitter
  const jitter = base * 0.25 * (Math.random() * 2 - 1);
  return Math.round(base + jitter);
}

/**
 * Retry a Server Action call on transient failures.
 *
 * @param fn - Async function to retry (typically a Server Action)
 * @param options - Retry configuration
 * @returns Promise resolving to the function's result
 * @throws The final error if all retries are exhausted
 *
 * @example
 * ```ts
 * const result = await retryServerAction(
 *   () => logSet({ sessionId, exerciseId, weight, reps, rir }),
 *   { onRetry: (attempt) => setStatus(`Retrying (${attempt}/2)…`) }
 * );
 * ```
 */
export async function retryServerAction<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // If not retryable or last attempt, fail immediately
      if (!isRetryableError(error) || attempt === maxAttempts) {
        throw error;
      }

      // Calculate delay and notify
      const delay = calculateDelay(attempt);
      options.onRetry?.(attempt, delay);

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Unreachable: loop always throws or returns
  throw lastError;
}
