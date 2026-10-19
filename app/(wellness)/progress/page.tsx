import { createClient } from "@/lib/supabase/server";
import { MoodChart } from "@/components/wellness/mood-chart";
import { InsightCard } from "@/components/wellness/insight-card";
import type { MoodLogRecord } from "@/types/wellness";

export default async function ProgressPage() {
  const supabase = createClient();

  const [{ data: logs }, { count: journalCount }, { count: sessionCount }] =
    await Promise.all([
      supabase
        .from("mood_logs")
        .select("id, mood, note, sleep_hours, created_at")
        .order("created_at", { ascending: false })
        .limit(60),
      supabase
        .from("journal_entries")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("mode", "wellness"),
    ]);

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-5 py-8">
      <div className="grid grid-cols-2 gap-4">
        <div className="glass rounded-2xl p-5 text-center" data-testid="wellness-progress-journalcount">
          <p className="font-display text-3xl font-semibold text-primary">
            {journalCount ?? 0}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">journal entries</p>
        </div>
        <div className="glass rounded-2xl p-5 text-center" data-testid="wellness-progress-sessioncount">
          <p className="font-display text-3xl font-semibold text-primary">
            {sessionCount ?? 0}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">talk sessions</p>
        </div>
      </div>
      <div className="glass rounded-2xl p-5">
        <h2 className="text-sm font-medium">Mood journey</h2>
        <MoodChart logs={(logs ?? []) as MoodLogRecord[]} />
      </div>
      <InsightCard
        title="Recurring themes this month"
        endpoint="/api/wellness/journal"
        field="themes"
        emptyHint="Kuch journal entries aur sessions ke baad themes dikhenge."
        testID="wellness-progress-themes"
      />
    </main>
  );
}
