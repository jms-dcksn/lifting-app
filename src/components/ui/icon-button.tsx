"use client";

import { useFormStatus } from "react-dom";
import {
  iconButtonClasses,
  type IconButtonVariant,
} from "./icon-button-styles";

export { iconButtonClasses, type IconButtonVariant };

export function IconButton({
  variant = "default",
  pending,
  className,
  children,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: IconButtonVariant;
  pending?: boolean;
  "aria-label": string;
}) {
  const { pending: formPending } = useFormStatus();
  const busy = pending ?? ((props.type ?? "submit") === "submit" && formPending);

  return (
    <button
      {...props}
      type={props.type ?? "button"}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={iconButtonClasses(variant, className)}
    >
      {busy ? (
        <span
          aria-hidden
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60"
        />
      ) : (
        children
      )}
    </button>
  );
}
