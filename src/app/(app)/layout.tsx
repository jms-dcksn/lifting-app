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
      <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/" className="font-semibold tracking-tight">Lift</Link>
          <Link href="/program" className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">Program</Link>
          <Link href="/settings" className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">Settings</Link>
        </nav>
        <form action={signOut}>
          <button className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            Sign out
          </button>
        </form>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
