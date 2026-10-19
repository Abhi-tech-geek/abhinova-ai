import { createClient } from "@/lib/supabase/server";
import { MoodCheckIn } from "@/components/wellness/mood-check-in";
import { MoodChart } from "@/components/wellness/mood-chart";
import { InsightCard } from "@/components/wellness/insight-card";
import { MusicPlayer } from "@/components/wellness/music-player";
import type { MoodLogRecord } from "@/types/wellness";

export default async function MoodPage() {
  const supabase = createClient();
  const { data: logs } = await supabase
    .from("mood_logs")
    .select("id, mood, note, sleep_hours, created_at")
    .order("created_at", { ascending: false })
    .limit(30);

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-5 py-8">
      <MoodCheckIn />
      <div className="glass rounded-2xl p-5">
        <h2 className="text-sm font-medium">Your mood over time</h2>
        <MoodChart logs={(logs ?? []) as MoodLogRecord[]} />
      </div>
      <InsightCard
        title="This week's gentle insights"
        endpoint="/api/wellness/mood"
        field="insight"
        emptyHint="Kam se kam 3 check-ins ke baad insights milenge."
        testID="wellness-mood-insights"
      />
      <MusicPlayer />
    </main>
  );
}
