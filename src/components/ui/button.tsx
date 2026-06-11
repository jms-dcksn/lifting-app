"use client";

import { useFormStatus } from "react-dom";
import {
  buttonClasses,
  type ButtonSize,
  type ButtonVariant,
} from "./button-styles";

export { buttonClasses, type ButtonSize, type ButtonVariant };

// Pending state: pass `pending` for useTransition flows; submit buttons inside a
// <form action> pick it up automatically via useFormStatus, so taps never feel ignored.
export function Button({
  variant = "primary",
  size = "md",
  pending,
  className,
  children,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  pending?: boolean;
}) {
  const { pending: formPending } = useFormStatus();
  const busy = pending ?? ((props.type ?? "submit") === "submit" && formPending);

  return (
    <button
      {...props}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={buttonClasses(variant, size, className)}
    >
      {busy && (
        <span
          aria-hidden
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60"
        />
      )}
      {children}
    </button>
  );
}
