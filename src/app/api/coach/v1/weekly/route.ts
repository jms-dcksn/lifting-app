import { createCoachWeeklyHandler } from "@/lib/coach-api";
import { loadCoachWeekly } from "@/lib/coach-weekly-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createCoachWeeklyHandler({
  expectedToken: () => process.env.COACH_API_TOKEN,
  userId: () => process.env.COACH_API_USER_ID,
  loadWeekly: loadCoachWeekly,
});
