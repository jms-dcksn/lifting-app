import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import pg from "pg";

for (const openWorkout of [false, true]) test(`plateau review reuses its conversation and confirms once (${openWorkout ? "open workout keeps drafts" : "before workout"})`, async ({ page, context, baseURL }) => {
  test.setTimeout(150_000);
  const db = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL }); await db.connect();
  const client = createClient(process.env.E2E_SUPABASE_URL!, process.env.E2E_SUPABASE_KEY!, { auth: { persistSession: false } });
  let owner: string | undefined;
  const program = randomUUID(), day = randomUUID(), slot = randomUUID();
  let modelPosts = 0;
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("request", r => { if (r.method() === "POST" && r.url().includes("/api/agent/chat")) modelPosts++; });
  try {
    const email = `coach-${randomUUID()}@example.test`, password = randomUUID() + "Aa1!";
    const signup = await client.auth.signUp({ email, password });
    if (signup.error || !signup.data.user) throw signup.error ?? Error("Signup failed");
    owner = signup.data.user.id;
    await db.query("update auth.users set email_confirmed_at=now() where id=$1", [owner]);
    const login = await client.auth.signInWithPassword({ email, password });
    if (login.error || !login.data.session) throw login.error ?? Error("Login failed");
    const cookies: Array<{ name: string; value: string }> = [];
    const server = createServerClient(process.env.E2E_SUPABASE_URL!, process.env.E2E_SUPABASE_KEY!, {
      cookies: { getAll: () => cookies, setAll: values => { cookies.splice(0, cookies.length, ...values); } },
    });
    await server.auth.setSession(login.data.session);
    await context.addCookies(cookies.map(cookie => ({ ...cookie, url: baseURL! })));
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
    const noticeURL = page.url();
    await expect(page.getByRole("button", { name: "Accept change", exact: true })).toBeVisible();
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
    expect(errors).toEqual([]);
  } finally { if (owner) await db.query("delete from auth.users where id=$1", [owner]); await db.end(); }
});
