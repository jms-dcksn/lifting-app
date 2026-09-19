import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-page flex-1 flex-col gap-5 px-4 py-6">
      <Skeleton className="h-8 w-44" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
