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
        // Safari date controls need native appearance reset to respect the field width.
        props.type === "date" &&
          "block box-border min-w-0 max-w-full appearance-none [&::-webkit-date-and-time-value]:min-w-0 [&::-webkit-date-and-time-value]:text-left",
        className,
      )}
    />
  );
}
