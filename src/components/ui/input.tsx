import { cx } from "./cx";

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        "h-12 w-full rounded-control border border-border-strong bg-transparent px-3 text-base text-foreground placeholder:text-faint",
        className,
      )}
    />
  );
}
