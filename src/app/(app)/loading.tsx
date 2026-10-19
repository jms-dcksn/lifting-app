import { Skeleton } from "@/components/ui/skeleton";
import { PageHeaderSkeleton } from "@/components/ui/page-header";

// Fallback for home and any (app) segment without its own skeleton, so server
// navigations never flash a dead white screen.
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-page flex-1 flex-col gap-5 px-4 pb-6">
      <PageHeaderSkeleton />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-1.5 w-full" />
      </div>
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
