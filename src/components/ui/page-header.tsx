import type { ReactNode } from "react";
import { CoachInboxButton } from "@/components/coach/coach-inbox-button";
import { cx } from "./cx";

/** One sticky title row; context stays with its screen, actions stay within reach. */
export function PageHeader({
  title,
  actions,
  context,
  back,
  className,
}: {
  title: ReactNode;
  actions?: ReactNode;
  context?: ReactNode;
  back?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cx(
      "sticky top-0 z-30 -mx-4 flex shrink-0 flex-col gap-2 border-b border-border/60 bg-background/95 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur",
      className,
    )}>
      {back ? <div className="text-caption text-muted [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center">{back}</div> : null}
      <div className="flex min-h-11 items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <h1 className="min-w-0 break-words text-display">{title}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {actions}
          <CoachInboxButton />
        </div>
      </div>
      {context ? <div className="min-w-0 space-y-2">{context}</div> : null}
    </header>
  );
}

export function PageHeaderSkeleton() {
  return <PageHeader title={
    <span className="block h-7 w-28 animate-pulse rounded-control bg-border">
      <span className="sr-only">Loading page</span>
    </span>
  } />;
}
