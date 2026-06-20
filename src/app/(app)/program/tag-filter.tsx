"use client";

// Single-select chip filter. "All" clears; tapping a tag filters the gallery to programs
// carrying it. Renders nothing when there are no tags.
export function TagFilter({
  tags,
  active,
  onSelect,
}: {
  tags: string[];
  active: string | null;
  onSelect: (tag: string | null) => void;
}) {
  if (tags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      <Chip selected={active === null} onClick={() => onSelect(null)}>
        All
      </Chip>
      {tags.map((tag) => (
        <Chip key={tag} selected={active === tag} onClick={() => onSelect(tag)}>
          {tag}
        </Chip>
      ))}
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
