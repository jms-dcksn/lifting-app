import { cx } from "./cx";

// The single shared surface: one radius, one border, one padding. `tone` carries
// hierarchy without color — `active` reads as current, `done` recedes.
export type CardTone = "default" | "active" | "done";

const tones: Record<CardTone, string> = {
  default: "border-border",
  active: "border-border-strong",
  done: "border-border opacity-60",
};

export function Card({
  className,
  tone = "default",
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  tone?: CardTone;
  children: React.ReactNode;
}) {
  return (
    <section
      {...props}
      className={cx("rounded-card border p-4 transition-opacity", tones[tone], className)}
    >
      {children}
    </section>
  );
}

export function CardLabel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <h2
      className={cx(
        "text-caption font-semibold uppercase tracking-wide text-muted",
        className,
      )}
    >
      {children}
    </h2>
  );
}
