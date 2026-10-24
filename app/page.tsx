import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// No landing page (per the design): signed-in users land in the workspace,
// everyone else goes straight to the sign-in screen.
export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  redirect(user ? "/chat" : "/login");
}
