import { Skeleton } from "@/components/ui/skeleton";
import { PageHeaderSkeleton } from "@/components/ui/page-header";

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-page flex-1 flex-col gap-5 px-4 pb-6">
      <PageHeaderSkeleton />
      <Skeleton className="h-72 w-full" />
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-44 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
