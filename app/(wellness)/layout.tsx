import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isGuest } from "@/lib/auth";
import { isOpenBeta } from "@/lib/beta/config";
import { LockedFeature } from "@/components/shared/locked-feature";
import { WellnessBanner } from "@/components/wellness/wellness-banner";

// Isolated Wellness Mode shell. The `wellness` class switches all design tokens
// to the calm theme (see globals.css). Wellness code must not leak outside this
// module — see "Wellness Mode Rules" in CLAUDE.md.
// Wellness Mode requires a real account — guests see a locked state.
export default async function WellnessLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (isGuest(user) && !isOpenBeta()) {
    return (
      <div className="wellness min-h-screen bg-background text-foreground">
        <LockedFeature
          feature="Wellness Mode"
          description="Wellness check-ins and journals are private and personal — they need an account so they're never lost."
          testID="wellness-locked-panel"
        />
      </div>
    );
  }

  return (
    <div className="wellness flex min-h-screen flex-col bg-background text-foreground">
      <WellnessBanner />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
