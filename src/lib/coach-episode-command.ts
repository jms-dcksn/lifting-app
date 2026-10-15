import "server-only";
import { createHmac } from "node:crypto";
import { EPISODE_DEFAULTS_VERSION } from "./coach-episodes";
import { COACH_EXCEPTION_POLICY_VERSION } from "./coach-exceptions";

// The exact UTF-8 bytes signed here are passed unchanged to PostgreSQL pgcrypto.
export function signCoachCommand(
  command: Record<string, unknown>,
  now = new Date(),
) {
  const key = process.env.COACH_COMMAND_SIGNING_KEY;
  const keyId = process.env.COACH_COMMAND_SIGNING_KEY_ID;
  if (!key || !/^[a-f0-9]{64}$/i.test(key) || !keyId)
    throw new Error("Coach refresh is not configured.");
  const payload = JSON.stringify({
    ...command,
    version: EPISODE_DEFAULTS_VERSION,
    policyVersion: COACH_EXCEPTION_POLICY_VERSION,
    keyId,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 60_000).toISOString(),
  });
  return {
    p_payload: payload,
    p_mac: createHmac("sha256", Buffer.from(key, "hex"))
      .update(payload, "utf8")
      .digest("hex"),
  };
}
