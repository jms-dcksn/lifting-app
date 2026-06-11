import { flushSync } from "react-dom";

// Run a state update inside a View Transition so reorders animate positionally
// (elements carrying a `viewTransitionName` tween between their old/new spots).
// Falls back to a plain update when unsupported or reduced-motion is requested.
export function withViewTransition(update: () => void) {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => unknown;
  };
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!doc.startViewTransition || reduced) {
    update();
    return;
  }
  doc.startViewTransition(() => flushSync(update));
}
