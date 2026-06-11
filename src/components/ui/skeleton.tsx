import { cx } from "./cx";

// Neutral placeholder block for loading.tsx skeletons. Pulses via the `.skeleton`
// keyframes in globals.css (honors prefers-reduced-motion).
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton rounded-control", className)} />;
}
