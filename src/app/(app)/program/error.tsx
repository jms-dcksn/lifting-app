"use client";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function ProgramError({ reset }: { reset: () => void }) {
  return (
    <div className="mx-auto w-full max-w-page px-4 py-6" role="alert">
      <h2 className="text-heading">Program could not load</h2>
      <p className="my-3 text-body text-muted">
        Your programs have not changed. Please try again.
      </p>
      <div className="flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-lg border border-border bg-card px-4 py-2 text-label font-medium text-foreground transition-colors hover:bg-muted/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
        >
          Home
        </Link>
      </div>
    </div>
  );
}
