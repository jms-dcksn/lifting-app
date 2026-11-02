import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import pg from "pg";

test("create a custom exercise, save and reload Plan, and reject stale saves promptly", async ({ page, context, baseURL }) => {
  test.setTimeout(120_000);
  const db = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL });
  await db.connect();
  const client = createClient(process.env.E2E_SUPABASE_URL!, process.env.E2E_SUPABASE_KEY!, { auth: { persistSession: false } });
  let owner: string | undefined;
  try {
    const email = `custom-plan-${randomUUID()}@example.test`, password = randomUUID() + "aA1!";
    const signed = await client.auth.signUp({ email, password });
    if (signed.error || !signed.data.user) throw signed.error ?? Error("signup failed");
    owner = signed.data.user.id;
    await db.query("update auth.users set email_confirmed_at=now() where id=$1", [owner]);
    const login = await client.auth.signInWithPassword({ email, password });
    if (login.error || !login.data.session) throw login.error ?? Error("login failed");
    const cookies: Array<{ name: string; value: string }> = [];
    const server = createServerClient(process.env.E2E_SUPABASE_URL!, process.env.E2E_SUPABASE_KEY!, {
      cookies: { getAll: () => cookies, setAll: values => { cookies.splice(0, cookies.length, ...values); } },
    });
    await server.auth.setSession(login.data.session);
    await context.addCookies(cookies.map(c => ({ ...c, url: baseURL! })));
    const program = randomUUID(), day = randomUUID(), slot = randomUUID();
    await db.query("insert into public.program(id,user_id,name,weeks,is_active) values($1,$2,'Custom plan',5,true)", [program, owner]);
    await db.query("insert into public.program_day(id,user_id,program_id,name,position) values($1,$2,$3,'Upper',0)", [day, owner, program]);
    await db.query("insert into public.program_slot(id,user_id,program_day_id,position,exercise_id,pattern,target_sets,rep_min,rep_max,target_rir) values($1,$2,$3,0,'db-bench','horizontal_press',3,5,8,2)", [slot, owner, day]);
    const revision = async () => Number((await db.query("select source_revision from public.coach_refresh_state where user_id=$1", [owner])).rows[0].source_revision);
    await page.goto("/workout/next");
    const source = await revision();
    await page.getByRole("button", { name: "Edit workout", exact: true }).click();
    await page.getByRole("button", { name: "Change exercise", exact: true }).click();
    await page.getByRole("button", { name: "Add custom exercise", exact: true }).click();
    const name = `Garage Press ${randomUUID()}`;
    await page.getByRole("textbox", { name: "Name", exact: true }).fill(name);
    await page.getByRole("combobox", { name: "Equipment", exact: true }).selectOption("dumbbell");
    await page.getByRole("button", { name: "Create exercise", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await revision()).toBe(source + 1);
    const custom = (await db.query("select id from public.exercise where user_id=$1 and name=$2", [owner, name])).rows[0].id;
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(page.getByText("Workout changes saved.", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    const saved = (await db.query("select * from public.workout_plan where user_id=$1", [owner])).rows[0];
    expect(saved.plan.slots[0].exerciseId).toBe(custom);
    const conflict = await client.rpc("save_workout_plan", {
      p_program: program, p_day: day, p_completed: 0, p_source: source,
      p_revision: saved.revision, p_scope: "workout", p_plan: saved.plan, p_request: randomUUID(),
    }).abortSignal(AbortSignal.timeout(10_000));
    expect(conflict.status).toBe(409);
    expect(conflict.error?.message).toContain("Your workout changed");
    expect((await db.query("select revision from public.workout_plan where user_id=$1", [owner])).rows[0].revision).toBe(saved.revision);
  } finally {
    if (owner) await db.query("delete from auth.users where id=$1", [owner]);
    await db.end();
  }
});
