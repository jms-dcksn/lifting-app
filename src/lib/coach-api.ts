import { createHash, timingSafeEqual } from "node:crypto";
import type { CoachCheckInReport } from "./coach-check-in";
import type { CoachRecommendation } from "./coach-recommendations";

export const COACH_API_VERSION = "1" as const;

export interface CoachWeeklyResponse {
  apiVersion: typeof COACH_API_VERSION;
  report: CoachCheckInReport;
  recommendations: CoachRecommendation[];
}

export interface CoachApiDependencies {
  expectedToken: () => string | undefined;
  userId: () => string | undefined;
  loadWeekly: (userId: string) => Promise<CoachWeeklyResponse>;
}

const RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Content-Type": "application/json; charset=utf-8",
  Pragma: "no-cache",
  Vary: "Authorization",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

export function createCoachWeeklyHandler(dependencies: CoachApiDependencies) {
  return async function GET(request: Request): Promise<Response> {
    const expectedToken = dependencies.expectedToken();
    const userId = dependencies.userId();

    if (
      !expectedToken
      || expectedToken.length < 32
      || !userId
      || !isUuid(userId)
    ) {
      return jsonResponse({ error: "Service unavailable" }, 503);
    }

    const suppliedToken = requestToken(request);
    if (!suppliedToken || !constantTimeTokenEqual(suppliedToken, expectedToken)) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    try {
      return jsonResponse(await dependencies.loadWeekly(userId), 200);
    } catch {
      return jsonResponse({ error: "Service unavailable" }, 503);
    }
  };
}

export function weeklyResponse(
  report: CoachCheckInReport,
  recommendations: CoachRecommendation[],
): CoachWeeklyResponse {
  return {
    apiVersion: COACH_API_VERSION,
    report,
    recommendations,
  };
}

export function constantTimeTokenEqual(candidate: string, expected: string): boolean {
  const candidateDigest = createHash("sha256").update(candidate).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}

function requestToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization != null) {
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    return match?.[1]?.trim() || null;
  }

  // ChatGPT scheduled tasks do not currently expose a custom-header control, so the
  // capability URL is the scoped fallback. Never log or echo this query parameter.
  return new URL(request.url).searchParams.get("token");
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: RESPONSE_HEADERS,
  });
}
