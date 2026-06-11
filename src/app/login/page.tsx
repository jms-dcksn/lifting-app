"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setStatus("error");
    } else {
      setStatus("sent");
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-display">Lifting Tracker</h1>
        <p className="mt-1 text-body text-muted">
          Sign in with a magic link.
        </p>

        {status === "sent" ? (
          <div className="mt-8 rounded-card border border-border-strong p-5 text-center">
            <div
              aria-hidden
              className="mx-auto flex size-10 items-center justify-center rounded-full bg-foreground text-lg text-background"
            >
              ✓
            </div>
            <p className="mt-3 text-heading">Check your email</p>
            <p className="mt-1 text-body text-muted">
              We sent a sign-in link to{" "}
              <span className="font-medium text-foreground">{email}</span>. Open it on this
              device to continue.
            </p>
            <button
              type="button"
              onClick={() => setStatus("idle")}
              className="mt-4 text-body text-muted underline underline-offset-2 hover:text-foreground"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-3">
            <Input
              type="email"
              required
              autoFocus
              autoComplete="email"
              inputMode="email"
              enterKeyHint="send"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button type="submit" size="lg" pending={status === "sending"}>
              Send magic link
            </Button>
            {error && <p className="text-body text-danger">{error}</p>}
          </form>
        )}
      </div>
    </main>
  );
}
