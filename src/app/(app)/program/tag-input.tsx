"use client";

import { useState } from "react";
import { normalizeTags } from "@/lib/program-tags";

// Chip input: type a tag and press Enter or comma to add; × removes; Backspace on an empty
// field removes the last chip. Values are normalized (trim/dedupe) on every change.
export function TagInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
}) {
  const [text, setText] = useState("");

  function commit(raw: string) {
    const next = normalizeTags([...value, raw]);
    onChange(next);
    setText("");
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-control border border-border-strong bg-transparent p-2">
      {value.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 rounded-full border border-border-strong px-2 py-1 text-caption font-medium"
        >
          {tag}
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            onClick={() => onChange(value.filter((t) => t !== tag))}
            className="text-muted active:text-foreground"
          >
            ✕
          </button>
        </span>
      ))}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            if (text.trim()) commit(text);
          } else if (e.key === "Backspace" && !text && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => text.trim() && commit(text)}
        placeholder={value.length ? "Add tag" : "Add tags (e.g. hypertrophy)"}
        enterKeyHint="done"
        autoComplete="off"
        className="h-8 min-w-24 flex-1 bg-transparent px-1 text-body outline-none"
      />
    </div>
  );
}
