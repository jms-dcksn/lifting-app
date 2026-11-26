import { randomUUID } from "node:crypto";
import { test, expect, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import pg from "pg";

async function signInCoachOwner(db: pg.Client, context: BrowserContext, baseURL: string, remember: (owner: string) => void) {
  const client = createClient(process.env.E2E_SUPABASE_URL!, process.env.E2E_SUPABASE_KEY!, { auth: { persistSession: false } });
  const email = `coach-${randomUUID()}@example.test`, password = randomUUID() + "Aa1!";
  const signup = await client.auth.signUp({ email, password });
  if (signup.error || !signup.data.user) throw signup.error ?? Error("Signup failed");
  const owner = signup.data.user.id;
  remember(owner);
  await db.query("update auth.users set email_confirmed_at=now() where id=$1", [owner]);
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session) throw login.error ?? Error("Login failed");
  const cookies: Array<{ name: string; value: string }> = [];
  const server = createServerClient(process.env.E2E_SUPABASE_URL!, process.env.E2E_SUPABASE_KEY!, {
    cookies: { getAll: () => cookies, setAll: values => { cookies.splice(0, cookies.length, ...values); } },
  });
  await server.auth.setSession(login.data.session);
  await context.addCookies(cookies.map(cookie => ({ ...cookie, url: baseURL })));
}

for (const openWorkout of [false, true]) test(`plateau review reuses its conversation and confirms once (${openWorkout ? "open workout keeps drafts" : "before workout"})`, async ({ page, context, baseURL }) => {
  test.setTimeout(240_000);
  const db = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL }); await db.connect();
  let owner: string | undefined;
  const program = randomUUID(), day = randomUUID(), slot = randomUUID();
  let modelPosts = 0;
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("request", r => { if (r.method() === "POST" && r.url().includes("/api/agent/chat")) modelPosts++; });
  try {
    await signInCoachOwner(db, context, baseURL!, id => { owner = id; });
    await db.query("update public.profile set bodyweight=180 where id=$1", [owner]);
    await db.query("insert into public.program(id,user_id,name,weeks,is_active,style) values($1,$2,'Coach Upper',12,true,'fluid')", [program, owner]);
    await db.query("insert into public.program_day(id,user_id,program_id,position,name) values($1,$2,$3,0,'Upper')", [day, owner, program]);
    await db.query("insert into public.program_slot(id,user_id,program_day_id,position,exercise_id,pattern,target_sets,rep_min,rep_max,target_rir) values($1,$2,$3,0,'db-bench','horizontal_press',3,6,10,2)", [slot, owner, day]);
    await db.query("insert into private.coach_command_key(key_id,key,valid_from,valid_until) values('browser-verification',decode(repeat('22',32),'hex'),now()-interval '1 hour',now()+interval '1 hour') on conflict(key_id) do update set valid_until=excluded.valid_until");
    for (let i = 0; i < 4; i++) {
      const session = randomUUID();
      const performed = new Date(Date.now() - (22 - i * 7) * 86400000).toISOString();
      await db.query("insert into public.workout_session(id,user_id,program_id,program_day_id,week_index,performed_at,finished_at) values($1,$2,$3,$4,$5,$6,$6)", [session, owner, program, day, i + 1, performed]);
      await db.query("insert into public.set_log(user_id,session_id,program_slot_id,exercise_id,weight,reps,rir,e1rm,set_index,is_warmup,is_deload,created_at) values($1,$2,$3,'db-bench',40,8,2,54,0,false,false,$4)", [owner, session, slot, performed]);
    }
    await page.route("**/api/agent/chat", async route => {
      if (route.request().method() !== "POST") return route.continue();
      const request = route.request().postDataJSON();
      expect(request.discuss).toBe(true);
      const seed = (await db.query("select id,role,parts,created_at from public.agent_message where user_id=$1 and thread_id=$2 order by created_at limit 1", [owner, request.threadId])).rows[0];
      const message = { id: seed.id, role: seed.role, parts: seed.parts, createdAt: seed.created_at.toISOString() };
      const answerId = randomUUID(), answer = "These comparable workouts support a plateau. Review the proposed 12–15 rep range.";
      await db.query("insert into public.agent_message(id,user_id,thread_id,role,parts) values($1,$2,$3,'assistant',$4)", [answerId, owner, request.threadId, JSON.stringify([{ type: "text", text: answer }])]);
      const reply = { id: answerId, role: "assistant", parts: [{ type: "text", text: answer }], createdAt: new Date().toISOString() };
      await route.fulfill({ contentType: "text/event-stream", body: [
        { type: "thread", thread: { id: request.threadId, title: "Coach review", updatedAt: message.createdAt }, userMessage: message },
        { type: "done", messages: [message, reply] },
      ].map(event => `data: ${JSON.stringify(event)}\n\n`).join("") });
    });
    await page.goto("/coach/inbox");
    await page.getByRole("link", { name: /plateau/i }).first().click();
    await expect(page).toHaveURL(/\/coach\/inbox\/[^/?]+$/);
    await expect(page.getByRole("button", { name: "Accept change", exact: true })).toBeVisible();
    const noticeURL = page.url();
    expect(modelPosts).toBe(0);
    await page.getByRole("button", { name: "Discuss with Coach", exact: true }).click();
    await expect(page.getByText("These comparable workouts support a plateau.", { exact: false })).toBeVisible();
    await expect(page).toHaveURL(/\/coach\?thread=/, { timeout: 45_000 });
    await expect(page.getByRole("link", { name: "See details and choices" })).toBeVisible();
    await page.getByRole("link", { name: "See details and choices" }).click();
    await expect(page).toHaveURL(/\/coach\/episodes\//);
    const reviewURL = page.url();
    await expect(page.getByRole("button", { name: /Switch rep range/ })).toBeVisible();
    await page.getByText("See details", { exact: true }).click();
    await expect(page.getByText(/40 lb × 8/).first()).toBeVisible();
    await page.getByRole("button", { name: "Discuss with Coach", exact: true }).click();
    await expect(page).toHaveURL(/\/coach\?thread=/);
    await expect(page.getByRole("link", { name: "See details and choices" })).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.has("discuss")).toBe(false);
    const threadURL = page.url();
    const threadId = new URL(threadURL).searchParams.get("thread")!;
    await page.goto("/analytics/coach?exercise=db-bench&month=2026-09");
    await expect.poll(() => new URL(page.url()).searchParams.get("thread")).toBe(threadId);
    expect(new URL(page.url()).searchParams.get("month")).toBe("2026-09");
    expect(new URL(page.url()).searchParams.get("exercise")).toBe("db-bench");
    await page.reload();
    await expect(page.getByRole("link", { name: "See details and choices" })).toBeVisible();
    expect(new URL(page.url()).searchParams.get("month")).toBe("2026-09");
    await page.goto("/settings?coachExercise=db-bench&month=2026-09");
    await expect.poll(() => new URL(page.url()).searchParams.get("thread")).toBe(threadId);
    // The server-rendered transcript starts at its top; hydration pins it to the latest message.
    // Clicking before that settles lets the jump retarget the click away from the link.
    const transcript = page.getByRole("region", { name: "Chat messages" });
    await expect.poll(() => transcript.evaluate(node => Math.abs(node.scrollHeight - node.clientHeight - node.scrollTop) < 4)).toBe(true);
    await page.getByRole("link", { name: "Report details", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Weekly report details", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Accept/ })).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get("month")).toBe("2026-09");

    await page.goto(reviewURL);
    await page.getByRole("button", { name: "Discuss with Coach", exact: true }).click();
    await expect(page).toHaveURL(threadURL);
    expect((await db.query("select count(*)::int n from public.coach_episode_thread where user_id=$1", [owner])).rows[0].n).toBe(1);
    expect((await db.query("select count(*)::int n from public.agent_message where user_id=$1", [owner])).rows[0].n).toBe(2);
    expect(modelPosts).toBe(1);
    await page.goto(reviewURL);
    await page.getByRole("button", { name: /Switch rep range/ }).click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    expect((await db.query("select count(*)::int n from public.movement_adaptation where user_id=$1", [owner])).rows[0].n).toBe(0);
    if (openWorkout) {
      await page.goto("/");
      await page.getByRole("button", { name: "Start next workout", exact: true }).click();
      await page.getByRole("textbox", { name: "Weight", exact: true }).fill("55");
      await page.getByRole("textbox", { name: "Reps", exact: true }).fill("9");
      await page.getByRole("button", { name: "Review with Coach", exact: true }).click();
    }
    if (openWorkout) {
      await page.getByRole("button", { name: /Switch rep range/ }).click();
      await page.getByRole("button", { name: "Confirm choice", exact: true }).click();
    } else {
      await page.goto(noticeURL);
      await expect(page.getByRole("button", { name: "Accept change", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Accept change", exact: true }).click();
    }
    await expect(page.getByText(/^Applied: 12–15 reps/)).toBeVisible();
    if (openWorkout) {
      await page.getByRole("button", { name: "Back to workout", exact: true }).click();
      await expect(page.getByRole("textbox", { name: "Weight", exact: true })).toHaveValue("55");
      await expect(page.getByRole("textbox", { name: "Reps", exact: true })).toHaveValue("9");
      await page.goto(reviewURL);
    } else await page.reload();
    await expect(page.getByText(/^Applied: 12–15 reps/)).toBeVisible();
    expect((await db.query("select count(*)::int n from public.movement_adaptation where user_id=$1", [owner])).rows[0].n).toBe(1);
    expect((await db.query("select count(*)::int n from public.coach_action_receipt where user_id=$1", [owner])).rows[0].n).toBe(1);
    expect((await db.query("select count(*)::int n from public.set_log where user_id=$1 and exercise_id='db-bench' and weight=40 and reps=8", [owner])).rows[0].n).toBe(4);
    expect((await db.query("select count(*)::int n from public.workout_session where user_id=$1", [owner])).rows[0].n).toBe(openWorkout ? 5 : 4);
    await page.setViewportSize({ width: 320, height: 750 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.goto("/coach?review=1&exercise=db-bench&month=2026-09");
    await expect.poll(() => new URL(page.url()).searchParams.get("thread")).toBe("new");
    expect(new URL(page.url()).searchParams.get("month")).toBe("2026-09");
    expect((await db.query("select count(*)::int n from public.agent_thread where user_id=$1", [owner])).rows[0].n).toBe(1);
    expect(modelPosts).toBe(1);
    expect(errors).toEqual([]);
  } finally { if (owner) await db.query("delete from auth.users where id=$1", [owner]); await db.end(); }
});

test("Coach chat uses the durable runtime from page and sheet", async ({ page, context, baseURL }) => {
  test.setTimeout(180_000);
  const db = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL });
  await db.connect();
  const requestBodies: Array<{ text: string; requestId: string }> = [];
  page.on("request", request => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/agent/chat") {
      requestBodies.push(request.postDataJSON());
    }
  });
  let owner: string | undefined;
  try {
    await db.query(`alter role coach_agent_runtime login password ${db.escapeLiteral(process.env.E2E_COACH_RUNTIME_PASSWORD!)}`);
    await signInCoachOwner(db, context, baseURL!, id => { owner = id; });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.setViewportSize({ width: 1100, height: 820 });
    await page.goto("/coach?thread=new");

    const composer = page.getByRole("textbox", { name: "Message" });
    await page.getByRole("button", { name: "How was my week?" }).click();
    await expect(composer).toBeFocused();
    await expect(composer).toHaveValue("How was my week?");
    const height = (await composer.boundingBox())!.height;
    await composer.press("End");
    await composer.press("Shift+Enter");
    await composer.pressSequentially("Focus on bench.");
    await expect(composer).toHaveValue("How was my week?\nFocus on bench.");
    await expect.poll(async () => (await composer.boundingBox())!.height).toBeGreaterThan(height);
    await composer.dispatchEvent("keydown", { key: "Enter", code: "Enter", isComposing: true });
    expect(requestBodies).toHaveLength(0);
    await composer.press("Enter");
    await expect(page.getByText("End of the Coach fixture.", { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(composer).toHaveValue("");
    expect(requestBodies).toHaveLength(1);
    expect(requestBodies[0].text).toBe("How was my week?\nFocus on bench.");

    const viewport = page.getByRole("region", { name: "Chat messages" });
    const atEnd = () => viewport.evaluate(node => Math.abs(node.scrollHeight - node.clientHeight - node.scrollTop) < 4);
    await expect.poll(atEnd).toBe(true);
    await viewport.evaluate(node => { node.scrollTop = 0; });
    await expect(page.getByRole("button", { name: "Jump to latest" })).toBeVisible();
    await page.getByRole("button", { name: "Jump to latest" }).click();
    await expect.poll(atEnd).toBe(true);
    await page.getByRole("button", { name: "Copy Coach message" }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("End of the Coach fixture.");

    await page.setViewportSize({ width: 320, height: 750 });
    await page.goto("/");
    const opener = page.getByRole("button", { name: "Coach", exact: true });
    await opener.click();
    const dialog = page.getByRole("dialog", { name: "Coach" });
    await expect(dialog.getByText("End of the Coach fixture.", { exact: true })).toBeVisible();
    const sheetComposer = dialog.getByRole("textbox", { name: "Message" });
    await sheetComposer.fill("And squat next?");
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await dialog.getByRole("button", { name: "Send", exact: true }).click();
    await expect(dialog.getByText("End of the Coach fixture.", { exact: true })).toHaveCount(2);
    await expect(dialog.getByRole("button", { name: "Copy Coach message" })).toHaveCount(2);
    await expect(sheetComposer).toHaveValue("");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    expect(requestBodies).toHaveLength(2);
    expect(new Set(requestBodies.map(request => request.requestId)).size).toBe(2);
    const turns = await db.query("select status from coach_runtime.turn where owner_id=$1", [owner]);
    expect(turns.rows).toEqual([{ status: "completed" }, { status: "completed" }]);
    const transcript = await db.query("select role, count(*)::int as count from public.agent_message where user_id=$1 group by role order by role", [owner]);
    expect(transcript.rows).toEqual([{ role: "assistant", count: 2 }, { role: "user", count: 2 }]);
  } finally {
    if (owner) await db.query("delete from auth.users where id=$1", [owner]);
    await db.query("alter role coach_agent_runtime nologin password null");
    await db.end();
  }
});
