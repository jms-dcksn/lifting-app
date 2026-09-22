"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, useSheetDismiss } from "@/components/ui/sheet";

// My programs toolbar: heading, optional Filter Sheet, quiet active-tag line.
// Chips are not always-on. The control hides when no program has tags.
export function TagFilter({
  tags,
  active,
  onSelect,
}: {
  tags: string[];
  active: string | null;
  onSelect: (tag: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-heading">My programs</h2>
        {tags.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={open}
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
          >
            Filter
          </Button>
        )}
      </div>
      {active && (
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            className="min-h-11 text-left text-caption text-muted"
            onClick={() => tags.length > 0 && setOpen(true)}
          >
            Filtered · {active}
          </button>
          <button
            type="button"
            className="min-h-11 text-caption text-muted"
            onClick={() => onSelect(null)}
          >
            Clear
          </button>
        </div>
      )}
      {open && tags.length > 0 && (
        <Sheet ariaLabel="Filter programs" onClose={() => setOpen(false)}>
          <TagFilterBody tags={tags} active={active} onSelect={onSelect} />
        </Sheet>
      )}
    </div>
  );
}

function TagFilterBody({
  tags,
  active,
  onSelect,
}: {
  tags: string[];
  active: string | null;
  onSelect: (tag: string | null) => void;
}) {
  const dismiss = useSheetDismiss();

  function choose(tag: string | null) {
    onSelect(tag);
    dismiss();
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
      <h2 className="text-heading">Filter</h2>
      <div className="flex flex-wrap gap-2">
        <Chip selected={active === null} onClick={() => choose(null)}>
          All
        </Chip>
        {tags.map((tag) => (
          <Chip key={tag} selected={active === tag} onClick={() => choose(tag)}>
            {tag}
          </Chip>
        ))}
      </div>
      <Button type="button" variant="ghost" onClick={dismiss}>
        Done
      </Button>
    </div>
  );
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={
        "rounded-full border px-3 py-1 text-caption font-medium transition-colors " +
        (selected
          ? "border-foreground bg-foreground text-background"
          : "border-border-strong text-muted active:bg-surface")
      }
    >
      {children}
    </button>
  );
}
