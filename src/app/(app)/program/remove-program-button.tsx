"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { IconTrash } from "@/components/ui/icons";
import { Sheet, useSheetDismiss } from "@/components/ui/sheet";
import { programIndexHref } from "@/lib/program-routes";
import { deleteProgram } from "./actions";

export function RemoveProgramButton({
  programId,
  name,
  variant,
}: {
  programId: string;
  name: string;
  variant: "icon" | "label";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function openSheet(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    setError(null);
    setOpen(true);
  }

  return (
    <>
      {variant === "icon" ? (
        <IconButton
          type="button"
          variant="ghost"
          className="relative z-10"
          aria-label={`Remove ${name}`}
          onClick={openSheet}
        >
          <IconTrash />
        </IconButton>
      ) : (
        <Button type="button" variant="ghost" size="sm" onClick={openSheet}>
          Remove
        </Button>
      )}
      {open && (
        <Sheet
          onClose={() => setOpen(false)}
          ariaLabel="Remove program"
          dismissible={!pending}
        >
          <RemoveProgramConfirm
            name={name}
            pending={pending}
            error={error}
            onConfirm={() => {
              setError(null);
              start(async () => {
                try {
                  await deleteProgram(programId);
                  router.replace(programIndexHref());
                } catch {
                  setError("Unable to remove this program.");
                }
              });
            }}
          />
        </Sheet>
      )}
    </>
  );
}

function RemoveProgramConfirm({
  name,
  pending,
  error,
  onConfirm,
}: {
  name: string;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
}) {
  const dismiss = useSheetDismiss();

  return (
    <div className="flex flex-col gap-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
      <h2 className="text-heading">Remove {name}?</h2>
      <p className="text-body text-muted">Logged workouts stay.</p>
      {error && (
        <p role="alert" className="text-body text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Button type="button" variant="destructive" pending={pending} onClick={onConfirm}>
          Remove
        </Button>
        <Button type="button" variant="secondary" disabled={pending} onClick={dismiss}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
