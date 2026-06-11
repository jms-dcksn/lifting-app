"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from "react";
import { cx } from "./cx";

// Must match the dialog.sheet transition duration in globals.css.
const EXIT_MS = 250;

const DismissContext = createContext<() => void>(() => {});

// Animated close for content inside a Sheet (e.g. a Cancel button).
export function useSheetDismiss() {
  return useContext(DismissContext);
}

// The app's one overlay: a native <dialog> bottom sheet. showModal() gives the
// focus trap; Escape (cancel event), scrim tap, and swipe-down on the handle all
// run the same animated dismiss. Parent unmounts it via onClose.
export function Sheet({
  onClose,
  className,
  children,
}: {
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closing = useRef(false);
  const dragStartY = useRef<number | null>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const dismiss = useCallback(() => {
    const dialog = ref.current;
    if (!dialog || closing.current) return;
    closing.current = true;
    dialog.setAttribute("data-closing", "");
    setTimeout(() => {
      dialog.close();
      onClose();
    }, EXIT_MS);
  }, [onClose]);

  function endDrag(e: React.PointerEvent, allowDismiss: boolean) {
    if (dragStartY.current == null) return;
    const dy = e.clientY - dragStartY.current;
    dragStartY.current = null;
    const dialog = ref.current;
    if (!dialog) return;
    dialog.style.transition = "";
    dialog.style.transform = "";
    if (allowDismiss && dy > 90) dismiss();
  }

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        dismiss();
      }}
      onClick={(e) => {
        if (e.target === ref.current) dismiss(); // scrim tap
      }}
      className={cx(
        "sheet fixed inset-x-0 top-auto bottom-0 mx-auto my-0 max-h-[90dvh] w-full max-w-page rounded-t-card border-t border-border bg-background p-0 text-foreground sm:border-x",
        className,
      )}
    >
      <DismissContext.Provider value={dismiss}>
        <div
          className="flex shrink-0 cursor-grab touch-none justify-center pb-2 pt-2.5"
          onPointerDown={(e) => {
            dragStartY.current = e.clientY;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (dragStartY.current == null) return;
            const dy = Math.max(0, e.clientY - dragStartY.current);
            const dialog = ref.current;
            if (!dialog) return;
            dialog.style.transition = "none";
            dialog.style.transform = `translateY(${dy}px)`;
          }}
          onPointerUp={(e) => endDrag(e, true)}
          onPointerCancel={(e) => endDrag(e, false)}
        >
          <span aria-hidden className="h-1 w-10 rounded-full bg-border-strong" />
        </div>
        {children}
      </DismissContext.Provider>
    </dialog>
  );
}
