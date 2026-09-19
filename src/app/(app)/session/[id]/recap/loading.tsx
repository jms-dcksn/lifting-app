import { Skeleton } from "@/components/ui/skeleton";

export default function RecapLoading() {
  return (
    <div className="mx-auto flex w-full max-w-page flex-1 flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-10 w-40" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
      <div className="mt-auto flex flex-col gap-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}
