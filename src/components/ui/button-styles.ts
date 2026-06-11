import { cx } from "./cx";

// Plain module (no "use client") so Server Components can style <Link>s as buttons.
export type ButtonVariant = "primary" | "secondary" | "destructive" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex select-none items-center justify-center gap-2 rounded-control font-semibold transition-[transform,opacity,background-color] duration-150 ease-out active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-foreground active:opacity-90",
  secondary: "border border-border-strong text-foreground active:bg-surface",
  destructive: "text-danger active:bg-surface",
  ghost: "text-muted active:bg-surface",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-4 text-base",
};

export function buttonClasses(
  variant: ButtonVariant,
  size: ButtonSize,
  className?: string,
) {
  return cx(base, variants[variant], sizes[size], className);
}
