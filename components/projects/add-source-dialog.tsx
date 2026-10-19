"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { isOpenBeta } from "@/lib/beta/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConnectDialog } from "@/components/connectors/connect-dialog";
import { CONNECTORS } from "@/lib/connectors/registry";
import type { ConnectorDefinition, ConnectorStatus } from "@/types/connectors";

type Tab = "url" | ConnectorDefinition["id"];

// Add a link or a connector feed to the project. Renders entirely from the
// connector registry — a new provider needs no UI changes here.
export function AddSourceDialog({
  projectId,
  statuses,
  open,
  onOpenChange,
}: {
  projectId: string;
  statuses: ConnectorStatus[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("url");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [config, setConfig] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);

  const connector = tab === "url" ? null : CONNECTORS.find((c) => c.id === tab) ?? null;
  const status = connector ? statuses.find((s) => s.id === connector.id) : undefined;

  function switchTab(next: Tab) {
    setTab(next);
    setTitle("");
    setConfig({});
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      const body =
        tab === "url"
          ? { type: "url", url: url.trim() }
          : { type: tab, title: title.trim() || connector?.label, config };
      const res = await fetch(`/api/projects/${projectId}/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const messages: Record<string, string> = {
          unsafe_url: data.message ?? "That link isn't allowed.",
          source_limit_reached: "This project already has 10 sources.",
          connector_not_connected: "Connect the tool first.",
          connector_not_configured: "This connector isn't set up on the server yet.",
          guest_not_allowed: isOpenBeta() ? "Links and connectors are off during the open beta." : "Links and connectors need a free account.",
          rate_limited: "Slow down — try again in a minute.",
        };
        toast.error(messages[data.error] ?? data.message ?? "Couldn't add the source.");
        return;
      }
      if (data.outcome?.status === "failed") {
        toast.error("Added, but the first sync failed", { description: data.outcome.message ?? undefined });
      } else {
        toast.success(`Added — ${data.outcome?.processed ?? 0} item(s) indexed`, {
          description: data.outcome?.message ?? undefined,
        });
      }
      setUrl("");
      setTitle("");
      setConfig({});
      onOpenChange(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="glass max-w-lg">
          <DialogHeader>
            <DialogTitle>Add knowledge</DialogTitle>
            <DialogDescription>Everything goes through the same search index as your files.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-1.5">
            {[{ id: "url" as Tab, label: "Link", icon: "🔗" }, ...CONNECTORS.map((c) => ({ id: c.id as Tab, label: c.label, icon: c.icon }))].map(
              (t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => switchTab(t.id)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    tab === t.id ? "border-primary/60 bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid={`projects-addsource-tab-${t.id}`}
                >
                  {t.icon} {t.label}
                </button>
              )
            )}
          </div>

          {tab === "url" ? (
            <div className="space-y-2">
              <Label htmlFor="source-url">Page URL</Label>
              <Input
                id="source-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://docs.example.com/spec"
                data-testid="projects-addsource-url"
              />
              <p className="text-[11px] text-muted-foreground">
                Docs pages, blogs, specs. Internal/private addresses are blocked for security.
              </p>
              <Button onClick={submit} disabled={busy || !url.trim()} className="brand-gradient w-full text-white" data-testid="projects-addsource-submit">
                {busy ? "Fetching & indexing…" : "Add link"}
              </Button>
            </div>
          ) : connector && !status?.configured ? (
            <p className="rounded-lg border border-border/60 bg-secondary/40 p-3 text-xs text-muted-foreground" data-testid="projects-addsource-not-configured">
              {connector.label} isn&apos;t set up on this server yet. The admin needs to create an OAuth app and add its
              client ID/secret to the environment (see README → Connectors).
            </p>
          ) : connector && !status?.connected ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{connector.description}</p>
              <Button onClick={() => setConnectOpen(true)} className="brand-gradient w-full text-white" data-testid="projects-addsource-connect">
                Connect {connector.label}
              </Button>
            </div>
          ) : connector ? (
            <div className="space-y-3">
              <p className="text-[11px] text-muted-foreground">
                Connected{status?.accountLabel ? ` as ${status.accountLabel}` : ""}.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="source-title">Name in this project</Label>
                <Input
                  id="source-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value.slice(0, 120))}
                  placeholder={`${connector.label} — main`}
                  data-testid="projects-addsource-title"
                />
              </div>
              {connector.configFields.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <Label htmlFor={`source-${field.key}`}>{field.label}</Label>
                  <Input
                    id={`source-${field.key}`}
                    value={config[field.key] ?? ""}
                    onChange={(e) => setConfig({ ...config, [field.key]: e.target.value.slice(0, 500) })}
                    placeholder={field.placeholder}
                    data-testid={`projects-addsource-field-${field.key}`}
                  />
                  {field.help && <p className="text-[11px] text-muted-foreground">{field.help}</p>}
                </div>
              ))}
              <Button onClick={submit} disabled={busy} className="brand-gradient w-full text-white" data-testid="projects-addsource-submit">
                {busy ? "Syncing…" : `Add & sync ${connector.label}`}
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <ConnectDialog
        connector={connector}
        open={connectOpen}
        onOpenChange={setConnectOpen}
        returnTo={`/projects/${projectId}`}
      />
    </>
  );
}
