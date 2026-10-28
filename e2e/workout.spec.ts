import { randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import pg from "pg";
import { prerequisite } from "../scripts/verification-plan.mjs";

// Phone width. The 44px action row, 8px column gap, and 4px summary margin
// sit between the label and the prescription (about 70px). `basis-64` on the
// column axis made that distance 262px.
const PHONE_VIEWPORT = { width: 390, height: 844 };
const HEADER_TO_SUMMARY_GAP = 96;

async function expectCompactExerciseHeader(page: Page, card: Locator) {
  await page.setViewportSize(PHONE_VIEWPORT);
  await expect(card).toBeVisible();
  const measured = await card.evaluate((node) => {
    const heading = node.querySelector("h2");
    const summary = [...node.querySelectorAll("span")].find((el) => {
      const text = el.textContent ?? "";
      return text.includes("×") && text.includes("RIR");
    })?.parentElement;
    const visual = node.querySelector("[data-exercise-visual]");
    if (!(heading instanceof HTMLElement) || !(summary instanceof HTMLElement) || !(visual instanceof HTMLElement)) return null;
    return {
      gap: summary.getBoundingClientRect().top - heading.getBoundingClientRect().bottom,
      visualHeight: visual.getBoundingClientRect().height,
    };
  });
  expect(measured, "exercise card header and set summary were not measurable").not.toBeNull();
  if (measured == null) return;
  expect(measured.gap).toBeLessThanOrEqual(HEADER_TO_SUMMARY_GAP);
  expect(measured.visualHeight).toBeLessThanOrEqual(80);
}

test("anonymous users must sign in", async ({ page }) => {
  await page.goto("/coach/inbox");
  await expect(page).toHaveURL(/\/login$/);
});

test("saved sets survive reload and scoped swaps; a finished pain review opens and acknowledges", async ({ page, context, baseURL }) => {
  const blocked = prerequisite("browser", process.env);
  if (blocked) throw Error(blocked);
  const db = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL });
  await db.connect();
  const client = createClient(process.env.E2E_SUPABASE_URL!, process.env.E2E_SUPABASE_KEY!, { auth: { persistSession: false } });
  let owner: string | undefined;
  const program = randomUUID(), day = randomUUID(), slot = randomUUID();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    // Local Auth issues the real session. Only this synthetic owner's rows are seeded/deleted.
    const email = `verification-${randomUUID()}@example.test`;
    const password = randomUUID() + "aA1!";
    const signup = await client.auth.signUp({ email, password });
    if (signup.error || !signup.data.user) throw signup.error ?? Error("Local Auth signup failed.");
    owner = signup.data.user.id;
    await db.query("update auth.users set email_confirmed_at=now() where id=$1", [owner]);
    const login = await client.auth.signInWithPassword({ email, password });
    if (login.error || !login.data.session) throw login.error ?? Error("Local Auth login failed.");
    const cookies: Array<{ name: string; value: string }> = [];
    const server = createServerClient(process.env.E2E_SUPABASE_URL!, process.env.E2E_SUPABASE_KEY!, {
      cookies: { getAll: () => cookies, setAll: values => { cookies.splice(0, cookies.length, ...values); } },
    });
    const session = await server.auth.setSession(login.data.session);
    if (session.error) throw session.error;
    await context.addCookies(cookies.map(cookie => ({ ...cookie, url: baseURL! })));
    await db.query("update public.profile set bodyweight=180 where id=$1", [owner]);
    await db.query("insert into public.program(id,user_id,name,weeks,is_active) values($1,$2,'Verification Upper',4,true)", [program, owner]);
    await db.query("insert into public.program_day(id,user_id,program_id,position,name) values($1,$2,$3,0,'Upper')", [day, owner, program]);
    await db.query("insert into public.program_slot(id,user_id,program_day_id,position,exercise_id,pattern,target_sets,rep_min,rep_max,target_rir) values($1,$2,$3,0,'db-bench','horizontal_press',2,6,10,2)", [slot, owner, day]);
    await db.query("insert into private.coach_command_key(key_id,key,valid_from,valid_until) values('browser-verification',decode(repeat('22',32),'hex'),now()-interval '1 hour',now()+interval '1 hour') on conflict(key_id) do update set key=excluded.key,valid_from=excluded.valid_from,valid_until=excluded.valid_until");

    await page.goto("/");
    await page.getByRole("button", { name: "Start next workout", exact: true }).click();
    await expect(page).toHaveURL(/\/session\//);
    const sessionId = new URL(page.url()).pathname.split("/").at(-1)!;
    const exerciseCard = page.locator("section").filter({ has: page.getByRole("button", { name: /^Swap .+ for another exercise$/ }) });
    await expectCompactExerciseHeader(page, exerciseCard);
    await page.getByRole("textbox", { name: "Weight", exact: true }).fill("40");
    await page.getByRole("textbox", { name: "Reps", exact: true }).fill("8");
    await page.getByRole("button", { name: "Log set", exact: true }).click();
    await expect.poll(async () => (await db.query("select count(*)::int n from public.set_log where session_id=$1 and user_id=$2", [sessionId, owner])).rows[0].n).toBe(1);
    await page.reload();
    await expect(page.getByText(/40 lb × 8/).first()).toBeVisible();

    await page.getByRole("button", { name: /^Swap .* for another exercise$/ }).click();
    await page.getByPlaceholder("Search exercises…").fill("Dumbbell Incline Bench");
    await page.getByRole("button", { name: /Incline Bench/ }).click();
    await page.getByRole("button", { name: "This workout only", exact: true }).click();
    await expect.poll(async () => (await db.query("select exercise_swaps->$1 as choice from public.workout_session where id=$2", [slot, sessionId])).rows[0].choice).toBe("db-incline-bench");
    expect((await db.query("select exercise_id from public.program_slot where id=$1", [slot])).rows[0].exercise_id).toBe("db-bench");

    await page.getByRole("button", { name: /^Swap .* for another exercise$/ }).click();
    await page.getByPlaceholder("Search exercises…").fill("Weighted Dip");
    await page.getByRole("button", { name: /Dip/ }).click();
    await page.getByRole("button", { name: "Remainder of program", exact: true }).click();
    await expect.poll(async () => (await db.query("select exercise_id from public.program_slot where id=$1", [slot])).rows[0].exercise_id).toBe("weighted-dip");
    const saved = (await db.query("select exercise_id,weight,reps from public.set_log where session_id=$1 and user_id=$2", [sessionId, owner])).rows[0];
    expect(saved).toMatchObject({ exercise_id: "db-bench", weight: "40", reps: 8 });

    // Logged rest ticks every 250ms and can move Finish between pointerdown and click.
    const pageFinish = page.locator('xpath=//button[normalize-space()="Finish workout" and not(ancestor::dialog)]');
    const confirmFinish = page.getByRole("dialog").getByRole("button", { name: "Finish workout", exact: true });
    await expect(async () => {
      if (await confirmFinish.count() === 0) await pageFinish.click({ timeout: 2_000 });
      await expect(page.getByRole("button", { name: "significant", exact: true })).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
    await page.getByRole("button", { name: "significant", exact: true }).click();
    await confirmFinish.click();
    await expect.poll(async () => (await db.query("select finished_at is not null as done from public.workout_session where id=$1", [sessionId])).rows[0].done).toBe(true);
    await expect(page).toHaveURL(new RegExp(`/session/${sessionId}/recap$`));
    await page.getByRole("link", { name: "View workout", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/session/${sessionId}$`));
    await expect(page.getByRole("link", { name: "View recap", exact: true })).toBeVisible();
    await expectCompactExerciseHeader(page, exerciseCard);
    await page.goto("/coach/inbox");
    await page.getByRole("link", { name: /Pain review/ }).click();
    await expect(page.getByRole("heading", { name: "Pain review", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Acknowledge", exact: true }).click();
    await expect(page.getByRole("button", { name: "Acknowledged", exact: true })).toBeDisabled();
    await page.reload();
    await expect(page.getByRole("button", { name: "Acknowledged", exact: true })).toBeDisabled();
    expect((await db.query("select state from public.coach_episode where user_id=$1 and family='session_pain'", [owner])).rows[0].state).toBe("open");
    expect(errors).toEqual([]);
  } finally {
    if (owner) await db.query("delete from auth.users where id=$1", [owner]);
    await db.end();
  }
});
