import { guardRoute, isGuest } from "@/lib/auth";
import { profileUpdateSchema } from "@/lib/validators/profile";
import { createClient } from "@/lib/supabase/server";

// PATCH the caller's profile (Settings, the Wellness toggle). Guests can only
// switch Wellness Mode — Settings stay off for them (see CLAUDE.md open beta).
export async function PATCH(request: Request): Promise<Response> {
  const guard = await guardRoute({ rateKey: "profile", maxPerMinute: 20 });
  if ("response" in guard) return guard.response;
  const parsed = profileUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const p = parsed.data;
  if (isGuest(guard.user) && Object.keys(p).some((k) => k !== "wellnessEnabled")) {
    return Response.json({ error: "guest_not_allowed" }, { status: 403 });
  }
  const update = {
    ...(p.displayName !== undefined ? { display_name: p.displayName || null } : {}),
    ...(p.avatarUrl !== undefined ? { avatar_url: p.avatarUrl || null } : {}),
    ...(p.themePref !== undefined ? { theme_pref: p.themePref } : {}),
    ...(p.voiceLangPref !== undefined ? { voice_lang_pref: p.voiceLangPref } : {}),
    ...(p.wellnessEnabled !== undefined ? { wellness_enabled: p.wellnessEnabled } : {}),
  };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update(update).eq("id", guard.user.id);
  if (error) return Response.json({ error: "update_failed" }, { status: 500 });
  return Response.json({ ok: true });
}
