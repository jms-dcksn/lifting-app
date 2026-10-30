import { randomUUID } from "node:crypto";
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import pg from "pg";

async function checkLayout(page: Page, info: TestInfo, screen: string) {
  for (const width of [320, 390, 1280]) for (const colorScheme of ["light", "dark"] as const) {
    await page.setViewportSize({width, height:844}); await page.emulateMedia({colorScheme});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const small = await page.getByRole("main").locator("button").evaluateAll(buttons => buttons.flatMap(button => {
      const box=button.getBoundingClientRect();
      if (!button.getClientRects().length || getComputedStyle(button).visibility === "hidden") return [];
      return box.width < 43.9 || box.height < 43.9 ? [{name:button.getAttribute("aria-label") ?? button.textContent,width:box.width,height:box.height}] : [];
    }));
    expect(small, `${screen} ${width}px ${colorScheme}: buttons must be 44px`).toEqual([]);
    if (width === 390) await page.screenshot({path:info.outputPath(`${screen}-${colorScheme}.png`),fullPage:true});
  }
  await page.setViewportSize({width:390,height:844});
}

test("compact builder, read-only targets and out-of-order logging retain real saved data", async ({page,context,baseURL}, info) => {
  test.setTimeout(180_000);
  const db=new pg.Client({connectionString:process.env.E2E_DATABASE_URL});await db.connect();
  const client=createClient(process.env.E2E_SUPABASE_URL!,process.env.E2E_SUPABASE_KEY!,{auth:{persistSession:false}});
  let owner:string|undefined;const program=randomUUID(),day=randomUUID(),secondDay=randomUUID(),first=randomUUID(),second=randomUUID();
  const scriptErrors:string[]=[];page.on("pageerror",error=>scriptErrors.push(error.message));
  try {
    const email=`compact-${randomUUID()}@example.test`,password=randomUUID()+"aA1!";
    const signup=await client.auth.signUp({email,password});if(signup.error||!signup.data.user)throw signup.error??Error("signup failed");owner=signup.data.user.id;
    await db.query("update auth.users set email_confirmed_at=now() where id=$1",[owner]);
    const login=await client.auth.signInWithPassword({email,password});if(login.error||!login.data.session)throw login.error??Error("login failed");
    const cookies:Array<{name:string;value:string}>=[];
    const server=createServerClient(process.env.E2E_SUPABASE_URL!,process.env.E2E_SUPABASE_KEY!,{cookies:{getAll:()=>cookies,setAll:values=>{cookies.splice(0,cookies.length,...values);}}});
    await server.auth.setSession(login.data.session);await context.addCookies(cookies.map(cookie=>({...cookie,url:baseURL!})));
    await db.query("insert into public.program(id,user_id,name,weeks,is_active) values($1,$2,'Compact study',5,true)",[program,owner]);
    await db.query("insert into public.program_day(id,user_id,program_id,name,position) values($1,$2,$3,'Upper',0),($4,$2,$3,'Lower',1)",[day,owner,program,secondDay]);
    await db.query("insert into public.program_slot(id,user_id,program_day_id,position,exercise_id,pattern,target_sets,rep_min,rep_max,target_rir) values($1,$2,$3,0,'db-bench','horizontal_press',3,6,8,2),($4,$2,$3,1,'db-row','horizontal_pull',3,8,12,2)",[first,owner,day,second]);
    await db.query("insert into public.program_slot(id,user_id,program_day_id,position,exercise_id,pattern,target_sets,rep_min,rep_max,target_rir) values($1,$2,$3,0,'bb-rdl','hinge',3,8,12,2)",[randomUUID(),owner,secondDay]);
    await page.goto(`/program/${program}?mode=edit`);
    await checkLayout(page,info,"builder");
    await page.getByRole("button",{name:"Day 2 · Lower",exact:true}).click();await expect(page.getByLabel("Day name",{exact:true})).toHaveValue("Lower");
    await page.getByRole("button",{name:"Day 1 · Upper",exact:true}).click();
    await page.getByRole("button",{name:"Edit rep range for Dumbbell Bench Press",exact:true}).click();
    await page.getByLabel("Minimum reps",{exact:true}).fill("8");await page.getByLabel("Maximum reps",{exact:true}).fill("12");
    await page.getByRole("button",{name:"Cancel range",exact:true}).click();await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button",{name:"Edit rep range for Dumbbell Bench Press",exact:true})).toHaveText("6–8");
    await page.getByRole("button",{name:"More options for Dumbbell Bench Press",exact:true}).click();
    await page.getByLabel("Rest seconds",{exact:true}).fill("90");await page.getByRole("button",{name:"Apply options",exact:true}).click();await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button",{name:"Save changes",exact:true}).click();
    await expect.poll(async()=>(await db.query("select rest_seconds from public.program_slot where id=$1",[first])).rows[0]?.rest_seconds).toBe(90);
    await page.goto("/workout/next");
    await expect(page.getByRole("table",{name:"Exercise 1 working sets",exact:true})).toBeVisible();
    await expect(page.getByRole("table",{name:"Exercise 1 working sets",exact:true}).locator("tbody tr")).toHaveCount(3);
    await expect(page.getByRole("table").locator("input,button")).toHaveCount(0);
    await checkLayout(page,info,"plan");
    await page.getByRole("button",{name:"Start workout",exact:true}).click();await expect(page).toHaveURL(/\/session\//);
    const session=new URL(page.url()).pathname.split("/").at(-1)!;
    if (await page.getByRole("button",{name:"Skip",exact:true}).count()) await page.getByRole("button",{name:"Skip",exact:true}).click();
    const firstCard=page.locator("[data-workout-slot]").nth(0),secondCard=page.locator("[data-workout-slot]").nth(1);
    await firstCard.getByRole("textbox",{name:"Weight",exact:true}).fill("60");
    await secondCard.locator("[data-focus-exercise]").click();await expect(secondCard.getByRole("textbox",{name:"Weight",exact:true})).toBeFocused();
    await firstCard.locator("[data-focus-exercise]").click();await expect(firstCard.getByRole("textbox",{name:"Weight",exact:true})).toHaveValue("60");
    await checkLayout(page,info,"active");
    await firstCard.getByRole("button",{name:"Log set",exact:true}).click();
    await expect.poll(async()=>(await db.query("select count(*)::int n from public.set_log where session_id=$1",[session])).rows[0].n).toBe(1);
    await page.reload();await expect(firstCard.getByText(/60 lb ×/).first()).toBeVisible();
    await firstCard.getByRole("button",{name:/^Edit set 1 for /}).click();await expect(firstCard.getByRole("button",{name:"Delete",exact:true})).toBeVisible();
    await firstCard.getByRole("button",{name:"Cancel",exact:true}).click();
    expect((await db.query("select weight from public.set_log where session_id=$1",[session])).rows[0].weight).toBe("60");
    expect(scriptErrors).toEqual([]);
  } finally {if(owner)await db.query("delete from auth.users where id=$1",[owner]);await db.end();}
});
