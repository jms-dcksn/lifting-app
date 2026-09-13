"use client";
import { Button } from "@/components/ui/button";
export default function MonthError({ reset }: { reset: () => void }) {
  return <div className="mx-auto w-full max-w-page px-4 py-6" role="alert">
    <h2 className="text-heading">Month review could not load</h2>
    <p className="my-3 text-body text-muted">Your workout history has not changed. Please try again.</p>
    <Button onClick={reset}>Try again</Button>
  </div>;
}
