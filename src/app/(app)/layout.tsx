import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NavLinks } from "./nav-links";
import { signOut } from "./actions";

// Auth gate for the whole app. getClaims() is the trusted server-side check.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border px-4 py-1">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
          <NavLinks />
          <form action={signOut}>
            <button className="px-1 py-3 text-body text-muted hover:text-foreground">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
