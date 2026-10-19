"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PROVIDERS, type Provider } from "@/lib/models/registry";

interface KeyRow {
  id: string;
  provider: Provider;
  key_masked: string;
  label: string | null;
}

// Settings → "Models & API Keys". Keys display masked ONLY; the raw key exists
// client-side just inside the add form until submit, never after.
export function ApiKeyManager() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [provider, setProvider] = useState<Provider>("openai");
  const [apiKey, setApiKey] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const res = await fetch("/api/models/keys");
    if (res.ok) {
      const data = await res.json();
      setKeys(data.keys ?? []);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);

  async function addKey(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/models/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey: apiKey.trim(),
          ...(label.trim() ? { label: label.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(
          data.error === "key_validation_failed"
            ? "That key didn't pass a test call — double-check it."
            : "Couldn't save the key. Try again."
        );
        return;
      }
      toast.success("Key validated & saved (encrypted at rest).");
      setApiKey("");
      setLabel("");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeKey(keyId: string) {
    const res = await fetch("/api/models/keys", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyId }),
    });
    if (res.ok) {
      toast.success("Key removed.");
      await refresh();
    } else {
      toast.error("Couldn't remove the key.");
    }
  }

  return (
    <section className="glass rounded-lg p-5" data-testid="settings-apikeys-section">
      <h2 className="font-display text-base font-semibold">Models &amp; API Keys</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Built-in models work without any setup. Add your own provider keys to
        unlock more models — keys are validated, encrypted at rest, and only
        ever shown masked.
      </p>

      {keys.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {keys.map((k) => (
            <li
              key={k.id}
              className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2"
              data-testid="settings-apikey-row"
            >
              <span className="text-xs">
                <span className="font-medium">{PROVIDERS[k.provider].label}</span>
                {k.label && <span className="text-muted-foreground"> · {k.label}</span>}
                <span className="ml-2 font-mono text-muted-foreground">{k.key_masked}</span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => removeKey(k.id)}
                data-testid="settings-apikey-delete"
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={addKey} className="mt-4 grid gap-3 sm:grid-cols-[140px_1fr_120px_auto]">
        <div>
          <Label htmlFor="key-provider" className="text-xs">Provider</Label>
          <select
            id="key-provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value as Provider)}
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
            data-testid="settings-apikey-provider"
          >
            {Object.values(PROVIDERS).map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="key-value" className="text-xs">API key</Label>
          <Input
            id="key-value"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={PROVIDERS[provider].keyHint}
            className="mt-1 h-9 text-xs"
            data-testid="settings-apikey-input"
          />
        </div>
        <div>
          <Label htmlFor="key-label" className="text-xs">Label (optional)</Label>
          <Input
            id="key-label"
            value={label}
            onChange={(e) => setLabel(e.target.value.slice(0, 60))}
            placeholder="Personal"
            className="mt-1 h-9 text-xs"
            data-testid="settings-apikey-label"
          />
        </div>
        <div className="flex items-end">
          <Button
            type="submit"
            size="sm"
            disabled={busy || !apiKey.trim()}
            data-testid="settings-apikey-add"
          >
            {busy ? "Validating…" : "Add key"}
          </Button>
        </div>
      </form>
    </section>
  );
}
