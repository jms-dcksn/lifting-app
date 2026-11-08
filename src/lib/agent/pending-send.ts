import { z } from "zod";

const pending = z.object({ hash: z.string(), requestId: z.string().uuid() });

/** A lost acknowledgement must retry the same request, including its original context. */
export async function preparePendingSend(payload: object, stored: string | null) {
  let previous: unknown;
  try { previous = stored ? JSON.parse(stored) : null; } catch { previous = null; }
  const parsed = pending.safeParse(previous);
  const serialized = JSON.stringify(payload);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(serialized))), byte => byte.toString(16).padStart(2, "0")).join("");
  const requestId = parsed.success && parsed.data.hash === hash ? parsed.data.requestId : crypto.randomUUID();
  return { body: JSON.stringify({ ...payload, requestId }), stored: JSON.stringify({ hash, requestId }) };
}
