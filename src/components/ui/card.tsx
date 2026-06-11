import { cx } from "./cx";

// The single shared surface: one radius, one border, one padding.
export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cx("rounded-card border border-border p-4", className)}>
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
