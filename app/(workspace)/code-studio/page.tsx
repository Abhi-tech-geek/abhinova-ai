import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isGuest } from "@/lib/auth";
import { isOpenBeta } from "@/lib/beta/config";
import { LockedFeature } from "@/components/shared/locked-feature";
import { CodeStudioWorkspace } from "@/components/code-studio/code-studio-workspace";

export default async function CodeStudioPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Code Studio touches local files + code execution — real accounts only.
  if (isGuest(user) && !isOpenBeta()) {
    return (
      <LockedFeature
        feature="Code Studio"
        description="Working with your local code and API keys needs a real account."
        testID="codestudio-locked-panel"
      />
    );
  }

  return (
    <main className="h-full">
      <CodeStudioWorkspace />
    </main>
  );
}
