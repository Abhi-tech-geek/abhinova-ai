import { redirect } from "next/navigation";

// Local-folder connections can't be deep-linked (browser handles are
// per-session). Reserved for future GitHub-connected projects.
export default function CodeProjectPage() {
  redirect("/code-studio");
}
