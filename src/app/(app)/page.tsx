import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email as string | undefined;

  return (
    <div className="flex flex-1 flex-col gap-2 px-6 py-10">
      <h1 className="text-xl font-semibold tracking-tight">
        {email ? `Signed in as ${email}` : "Signed in"}
      </h1>
      <p className="text-sm text-zinc-500">
        Phase 1 shell. Program builder and the active-session screen come next.
      </p>
    </div>
  );
}
