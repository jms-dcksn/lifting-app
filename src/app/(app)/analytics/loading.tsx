import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-page flex-1 flex-col gap-5 px-4 py-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-56" />
      </div>
      <Skeleton className="h-72 w-full" />
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-44 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
