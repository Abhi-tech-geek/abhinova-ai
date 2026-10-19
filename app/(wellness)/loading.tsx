import { Skeleton } from "@/components/ui/skeleton";

export default function WellnessLoading() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-5 py-10" data-testid="wellness-loading">
      <Skeleton className="h-24 rounded-2xl" />
      <Skeleton className="h-48 rounded-2xl" />
      <Skeleton className="h-24 rounded-2xl" />
    </main>
  );
}
