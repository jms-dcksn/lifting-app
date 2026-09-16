"use client";

import { useState } from "react";
import { Button } from "./button";
import { cx } from "./cx";
import { Sheet, useSheetDismiss } from "./sheet";

export function InfoButton({
  title,
  children,
  label,
}: {
  title: string;
  children: React.ReactNode;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label={label ?? `About ${title}`}
        onClick={() => setOpen(true)}
        className={cx(
          "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center text-muted",
          "active:text-foreground focus-visible:text-foreground",
          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground",
        )}
      >
        <CircleI />
      </button>
      {open && (
        <Sheet ariaLabel={title} onClose={() => setOpen(false)}>
          <InfoSheetBody title={title}>{children}</InfoSheetBody>
        </Sheet>
      )}
    </>
  );
}

function InfoSheetBody({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const dismiss = useSheetDismiss();

  return (
    <div className="flex flex-col gap-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2 sm:px-6">
      <h2 className="text-heading">{title}</h2>
      <div className="text-body text-muted">{children}</div>
      <Button type="button" variant="ghost" onClick={dismiss}>
        Done
      </Button>
    </div>
  );
}

function CircleI() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
    >
      <circle
        cx="8"
        cy="8"
        r="6.5"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <circle cx="8" cy="5" r="1" fill="currentColor" />
      <rect x="7.25" y="7.25" width="1.5" height="5" rx="0.75" fill="currentColor" />
    </svg>
  );
}
