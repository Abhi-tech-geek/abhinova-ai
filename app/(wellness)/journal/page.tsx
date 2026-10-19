import { createClient } from "@/lib/supabase/server";
import { JournalEditor } from "@/components/wellness/journal-editor";
import type { JournalEntryRecord } from "@/types/wellness";
import { LocalTime } from "@/components/shared/local-time";

export default async function JournalPage() {
  const supabase = createClient();
  const { data: entries } = await supabase
    .from("journal_entries")
    .select("id, content, distortions, reframe, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  const past = (entries ?? []) as JournalEntryRecord[];

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-5 py-8">
      <JournalEditor />
      {past.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Past entries
          </h2>
          {past.map((entry) => (
            <div key={entry.id} className="glass rounded-2xl p-4" data-testid="wellness-journal-entry">
              <p className="text-[10px] text-muted-foreground">
                <LocalTime iso={entry.created_at} />
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{entry.content}</p>
              {entry.reframe && (
                <p className="mt-2 rounded-xl border border-primary/30 bg-primary/10 p-2.5 text-xs">
                  🌱 {entry.reframe}
                </p>
              )}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
