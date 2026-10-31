"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VOICE_LANGS, type VoiceLang } from "@/lib/voice/useSpeechRecognition";

interface ProfileData {
  display_name: string | null;
  avatar_url: string | null;
  theme_pref: string;
  voice_lang_pref: string;
  wellness_enabled: boolean;
}

export function ProfileSettings({
  profile,
  deleteAccount,
}: {
  profile: ProfileData;
  deleteAccount: () => Promise<void>;
}) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? "");
  const [themePref, setThemePref] = useState(profile.theme_pref);
  const [voiceLang, setVoiceLang] = useState(profile.voice_lang_pref);
  const [wellnessEnabled, setWellnessEnabled] = useState(profile.wellness_enabled);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: displayName.trim() || null,
        avatarUrl: avatarUrl.trim() || null,
        themePref,
        voiceLangPref: voiceLang,
        wellnessEnabled,
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      toast.error("Couldn't save settings.");
      return;
    }
    setTheme(themePref);
    toast.success("Settings saved.");
    router.refresh();
  }

  return (
    <>
      <section className="glass space-y-4 rounded-lg p-5" data-testid="settings-profile-section">
        <h2 className="font-display text-base font-semibold">Profile &amp; preferences</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="display-name" className="text-xs">Display name</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value.slice(0, 60))}
              placeholder="Your name"
              className="mt-1 h-9 text-sm"
              data-testid="settings-profile-name"
            />
          </div>
          <div>
            <Label htmlFor="avatar-url" className="text-xs">Avatar URL</Label>
            <Input
              id="avatar-url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value.slice(0, 500))}
              placeholder="https://…"
              className="mt-1 h-9 text-sm"
              data-testid="settings-profile-avatar"
            />
          </div>
          <div>
            <Label htmlFor="theme-pref" className="text-xs">Theme</Label>
            <select
              id="theme-pref"
              value={themePref}
              onChange={(e) => setThemePref(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              data-testid="settings-profile-theme"
            >
              <option value="dark">Dark (default)</option>
              <option value="light">Light</option>
              <option value="wellness">Wellness</option>
            </select>
          </div>
          <div>
            <Label htmlFor="voice-lang" className="text-xs">Voice language</Label>
            <select
              id="voice-lang"
              value={voiceLang}
              onChange={(e) => setVoiceLang(e.target.value as VoiceLang)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              data-testid="settings-profile-voicelang"
            >
              {VOICE_LANGS.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2">
          <div>
            <p className="text-sm">Wellness Mode</p>
            <p className="text-[11px] text-muted-foreground">The optional calm space — talk, mood, journal.</p>
          </div>
          <Switch
            checked={wellnessEnabled}
            onCheckedChange={setWellnessEnabled}
            data-testid="settings-profile-wellness"
          />
        </div>
        <Button size="sm" onClick={save} disabled={saving} data-testid="settings-profile-save">
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </section>

      <section className="order-last rounded-lg border border-destructive/40 bg-destructive/5 p-5" data-testid="settings-danger-section">
        <h2 className="font-display text-base font-semibold text-destructive">Danger zone</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Deleting your account permanently removes everything: conversations,
          documents and their files, embeddings, mood logs, journals, QA
          history, generated docs, and API keys. This cannot be undone.
        </p>
        <Button
          size="sm"
          variant="destructive"
          className="mt-4"
          onClick={() => setDeleteOpen(true)}
          data-testid="settings-delete-account"
        >
          Delete my account
        </Button>
      </section>

      <Dialog open={deleteOpen} onOpenChange={(open) => !open && setDeleteOpen(false)}>
        <DialogContent className="glass max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete account — forever?</DialogTitle>
            <DialogDescription>
              Type <span className="font-mono font-semibold">DELETE</span> to confirm.
              All your data is wiped immediately.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            className="font-mono"
            data-testid="settings-delete-confirm-input"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} data-testid="settings-delete-cancel">
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={confirmText !== "DELETE" || deleting}
              onClick={async () => {
                setDeleting(true);
                try {
                  await deleteAccount();
                } catch {
                  setDeleting(false);
                  toast.error("Account deletion failed. Please try again.");
                }
              }}
              data-testid="settings-delete-confirm"
            >
              {deleting ? "Deleting…" : "Delete everything"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
