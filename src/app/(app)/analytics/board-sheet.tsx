"use client";

import { useState } from "react";
import { IconButton } from "@/components/ui/icon-button";
import { IconMore, IconSearch } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Sheet, useSheetDismiss } from "@/components/ui/sheet";

export function BoardSheet({
  label,
  icon,
  title,
  children,
}: {
  label: string;
  icon: "search" | "more";
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const Icon = icon === "search" ? IconSearch : IconMore;
  return (
    <>
      <IconButton variant="ghost" aria-label={label} onClick={() => setOpen(true)}>
        <Icon />
      </IconButton>
      {open && (
        <Sheet ariaLabel={title} onClose={() => setOpen(false)}>
          <BoardSheetBody title={title}>{children}</BoardSheetBody>
        </Sheet>
      )}
    </>
  );
}

function BoardSheetBody({ title, children }: { title: string; children: React.ReactNode }) {
  const dismiss = useSheetDismiss();
  return (
    <div className="flex flex-col gap-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
      <h2 className="text-heading">{title}</h2>
      {children}
      <Button type="button" variant="ghost" onClick={dismiss}>
        Done
      </Button>
    </div>
  );
}
