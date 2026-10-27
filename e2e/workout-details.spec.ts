import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import pg from "pg";

test("prescribed and performed tempo survive program, plan, workout and history", async ({page,context,baseURL}) => {
  test.setTimeout(180_000);
  const db = new pg.Client({connectionString:process.env.E2E_DATABASE_URL}); await db.connect();
  const client = createClient(process.env.E2E_SUPABASE_URL!,process.env.E2E_SUPABASE_KEY!,{auth:{persistSession:false}});
  let owner: string | undefined;
  const program=randomUUID(),day=randomUUID(),slot=randomUUID();
  try {
    const email=`details-${randomUUID()}@example.test`,password=randomUUID()+"aA1!";
    const signed=await client.auth.signUp({email,password}); if(signed.error || !signed.data.user) throw signed.error ?? Error("signup failed"); owner=signed.data.user.id;
    await db.query("update auth.users set email_confirmed_at=now() where id=$1",[owner]);
    const login=await client.auth.signInWithPassword({email,password}); if(login.error || !login.data.session) throw login.error ?? Error("login failed");
    const cookies: Array<{name:string;value:string}>=[];
    const server=createServerClient(process.env.E2E_SUPABASE_URL!,process.env.E2E_SUPABASE_KEY!,{cookies:{getAll:()=>cookies,setAll:values=>{cookies.splice(0,cookies.length,...values);}}});
    await server.auth.setSession(login.data.session); await context.addCookies(cookies.map(c=>({...c,url:baseURL!})));
    await db.query("insert into public.program(id,user_id,name,weeks,is_active) values($1,$2,'Tempo program',5,true)",[program,owner]);
    await db.query("insert into public.program_day(id,user_id,program_id,name,position) values($1,$2,$3,'Upper',0)",[day,owner,program]);
    await db.query("insert into public.program_slot(id,user_id,program_day_id,position,exercise_id,pattern,target_sets,rep_min,rep_max,target_rir) values($1,$2,$3,0,'db-bench','horizontal_press',3,5,8,2)",[slot,owner,day]);
    await page.goto(`/program/${program}?mode=edit`);
    await page.getByLabel('Lower',{exact:true}).fill('2');
    await page.getByLabel('Bottom pause',{exact:true}).fill('1');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await expect.poll(async()=>(await db.query('select tempo from public.program_slot where id=$1',[slot])).rows[0].tempo).toEqual([2,1,1,0]);
    await page.goto('/workout/next'); await expect(page.getByText('Tempo 2-1-1-0',{exact:false})).toBeVisible();
    await page.getByRole('button',{name:'Start workout',exact:true}).click(); await expect(page).toHaveURL(/\/session\//);
    const session=new URL(page.url()).pathname.split('/').at(-1)!;
    await expect(page.getByText('Tempo 2-1-1-0',{exact:false}).first()).toBeVisible();
    await page.getByRole('button',{name:'Skip',exact:true}).click();
    await page.locator('summary').filter({hasText:'Set details'}).click();
    await page.getByLabel('Lower',{exact:true}).fill('4');
    await page.getByRole('button',{name:'Log set',exact:true}).click();
    await expect.poll(async()=>(await db.query('select tempo from public.set_log where session_id=$1',[session])).rows[0]?.tempo).toEqual([4,1,1,0]);
    await expect(page.getByRole('listitem').getByText('Tempo 4-1-1-0',{exact:true})).toBeVisible();
    // A new set returns to the prescription, rather than inheriting the last override.
    await page.locator('summary').filter({hasText:'Set details'}).click();
    await expect(page.getByLabel('Lower',{exact:true})).toHaveValue('2');
    await page.reload(); await expect(page.getByRole('listitem').getByText('Tempo 4-1-1-0',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Edit',exact:true}).click();
    await page.getByRole('textbox',{name:'Reps',exact:true}).fill('7');
    await page.getByRole('button',{name:'Save',exact:true}).click();
    await expect.poll(async()=>(await db.query('select reps,tempo from public.set_log where session_id=$1',[session])).rows[0]).toMatchObject({reps:7,tempo:[4,1,1,0]});
    await db.query("update public.program_slot set tempo='[1,0,1,0]' where id=$1",[slot]);
    await page.reload(); await expect(page.getByText('Tempo 2-1-1-0',{exact:false}).first()).toBeVisible();
    await page.setViewportSize({width:1280,height:900});
    await page.getByRole('button',{name:'Finish workout',exact:true}).click();
    await page.getByRole('button',{name:'Finish workout',exact:true}).last().click();
    await expect.poll(async()=>(await db.query('select finished_at is not null as done from public.workout_session where id=$1',[session])).rows[0].done).toBe(true);
    await expect(page).toHaveURL(new RegExp(`/session/${session}/recap$`));
    await page.goto(`/session/${session}`); await expect(page.getByRole('listitem').getByText('Tempo 4-1-1-0',{exact:true})).toBeVisible();
    await page.goto('/history/db-bench'); await expect(page.getByRole('listitem').getByText('Tempo 4-1-1-0',{exact:true}).first()).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  } finally { if(owner) await db.query('delete from auth.users where id=$1',[owner]); await db.end(); }
});
