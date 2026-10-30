import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import pg from "pg";

for (const entry of ["home", "planner"] as const) {
  test(`${entry} starts an untouched program before equipment selection`, async ({ page, context, baseURL }) => {
    const db = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL });
    await db.connect();
    const client = createClient(process.env.E2E_SUPABASE_URL!, process.env.E2E_SUPABASE_KEY!, { auth: { persistSession: false } });
    let owner: string | undefined;
    const program = randomUUID(), day = randomUUID(), bench = randomUUID(), cable = randomUUID();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
      const email = `start-${randomUUID()}@example.test`, password = randomUUID() + "aA1!";
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
      await db.query("insert into public.program(id,user_id,name,weeks,is_active) values($1,$2,'Legacy equipment',5,true)", [program, owner]);
      await db.query("insert into public.program_day(id,user_id,program_id,name,position) values($1,$2,$3,'Upper',0)", [day, owner, program]);
      await db.query("insert into public.program_slot(id,user_id,program_day_id,position,exercise_id,pattern,target_sets,rep_min,rep_max,target_rir) values($1,$2,$3,0,'bb-bench','horizontal_press',3,5,8,2),($4,$2,$3,1,'lat-pulldown','vertical_pull',3,8,12,2)", [bench, owner, day, cable]);

      await page.goto(entry === "home" ? "/" : "/workout/next");
      await page.getByRole("button", { name: entry === "home" ? "Start next workout" : "Start workout", exact: true }).click();
      await expect(page).toHaveURL(/\/session\//);
      const session = new URL(page.url()).pathname.split("/").at(-1)!;
      await expect(page.getByRole("button", { name: "Log set", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Choose cable to edit setup for Lat Pulldown (Cable)", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Choose bench for Barbell Bench Press", exact: true }).click();
      await page.getByRole("combobox", { name: "Brand", exact: true }).selectOption("Life Fitness");
      await page.getByRole("button", { name: "Use this bench", exact: true }).click();
      await page.getByRole("button", { name: "This workout only", exact: true }).click();
      await expect(page.getByRole("button", { name: "Log set", exact: true })).toHaveCount(1);
      await page.getByRole("textbox", { name: "Weight", exact: true }).fill("100");
      await page.getByRole("button", { name: "Log set", exact: true }).click();
      await expect.poll(async () => (await db.query("select count(*)::integer n from public.set_log where session_id=$1", [session])).rows[0].n).toBe(1);
      const logged = (await db.query("select exercise_id,planned_set_id from public.set_log where session_id=$1", [session])).rows[0];
      expect(logged.exercise_id).not.toBe("bb-bench");
      expect(logged.planned_set_id).toBeTruthy();
      const cableCard=page.locator('[data-workout-slot]').nth(1);
      await cableCard.getByRole('button',{name:/^Choose cable to edit setup/}).click();
      await page.getByRole('combobox',{name:'Brand',exact:true}).selectOption('Life Fitness');
      await page.getByRole('button',{name:'Use this cable',exact:true}).click();
      await page.getByRole('button',{name:'This workout only',exact:true}).click();
      await cableCard.getByRole('button',{name:/^Edit machine or cable setup/}).click();
      const setup=page.getByRole('dialog',{name:'Machine / cable setup',exact:true});
      await setup.getByRole('textbox',{name:'Setup for this workout',exact:true}).fill('Pulley 12, neutral handles');
      await setup.getByRole('button',{name:'Save',exact:true}).click();
      await expect.poll(async()=>(await db.query('select setup from public.workout_exercise_detail where session_id=$1',[session])).rows[0]?.setup).toBe('Pulley 12, neutral handles');
      await page.reload();
      await expect(cableCard.getByText('Pulley 12, neutral handles',{exact:true})).toBeVisible();
      await expect(page.getByRole("button", { name: "Log set", exact: true })).toHaveCount(1);
      expect((await db.query("select count(*)::integer n from public.workout_session where user_id=$1", [owner])).rows[0].n).toBe(1);
      expect(errors).toEqual([]);
    } finally {
      if (owner) await db.query("delete from auth.users where id=$1", [owner]);
      await db.end();
    }
  });
}
