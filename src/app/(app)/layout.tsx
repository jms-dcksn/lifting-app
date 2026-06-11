import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
      <header className="flex items-center justify-between border-b border-border px-4 py-1">
        <nav className="flex items-center gap-2 text-body">
          <Link href="/" className="px-1 py-3 font-semibold tracking-tight">Lift</Link>
          <Link href="/program" className="px-2 py-3 text-muted hover:text-foreground">Program</Link>
          <Link href="/settings" className="px-2 py-3 text-muted hover:text-foreground">Settings</Link>
        </nav>
        <form action={signOut}>
          <button className="px-1 py-3 text-body text-muted hover:text-foreground">
            Sign out
          </button>
        </form>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
