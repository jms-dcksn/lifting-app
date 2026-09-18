import { cx } from "./cx";

// Plain module (no "use client") so Server Components can style <Link>s as icon buttons.
export type IconButtonVariant = "default" | "ghost";

const base =
  "inline-flex size-11 shrink-0 select-none items-center justify-center rounded-control transition-[transform,opacity,background-color,color] duration-150 ease-out active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground";

const variants: Record<IconButtonVariant, string> = {
  default: "border border-border-strong text-foreground active:bg-surface",
  ghost: "text-muted active:bg-surface active:text-foreground",
};

export function iconButtonClasses(
  variant: IconButtonVariant = "default",
  className?: string,
) {
  return cx(base, variants[variant], className);
}
