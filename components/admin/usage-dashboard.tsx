"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AiRepliesChart, PeopleChart, RankedBars, shortDay } from "@/components/admin/usage-charts";
import { LocalTime } from "@/components/shared/local-time";
import { Logo } from "@/components/shared/logo";
import { getQaTool } from "@/lib/qa-tools";
import { BETA_LIMITS } from "@/lib/beta/config";
import { DASHBOARD_RANGES, type UsageStats } from "@/types/admin";

const FEEDBACK_ICON = { bug: "🐞", idea: "💡", praise: "❤️", other: "💭" } as const;

function sum<T>(rows: T[], pick: (r: T) => number) {
  return rows.reduce((n, r) => n + pick(r), 0);
}

function StatTile({ label, value, hint, testID }: { label: string; value: number | string; hint?: string; testID: string }) {
  return (
    <div className="glass rounded-2xl p-4" data-testid={testID}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1.5 font-sans text-3xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Card({ title, subtitle, children, className = "", testID }: { title: string; subtitle?: string; children: React.ReactNode; className?: string; testID: string }) {
  return (
    <section className={`glass min-w-0 rounded-2xl p-5 ${className}`} data-testid={testID}>
      <h2 className="text-sm font-semibold">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Today's site-wide AI budget. Severity: accent → warning → danger, always with an icon + words. */
function SiteMeter({ used, cap }: { used: number; cap: number }) {
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  const level = pct >= 90 ? "critical" : pct >= 70 ? "warning" : "ok";
  const fill = level === "critical" ? "bg-destructive" : level === "warning" ? "bg-warning" : "brand-gradient";
  const status = {
    ok: { icon: "✅", text: "Plenty of room" },
    warning: { icon: "⚠️", text: "Getting busy" },
    critical: { icon: "⛔", text: "Almost at today's cap" },
  }[level];
  return (
    <div className="glass rounded-2xl p-4 sm:col-span-2" data-testid="admin-site-meter">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs text-muted-foreground">Site AI budget today</p>
        <p className="text-xs text-muted-foreground">
          {status.icon} {status.text}
        </p>
      </div>
      <p className="mt-1.5 font-sans text-3xl font-semibold tracking-tight">
        {used.toLocaleString("en-IN")}
        <span className="text-base font-normal text-muted-foreground"> / {cap.toLocaleString("en-IN")} replies</span>
      </p>
      <div
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={cap}
        aria-valuenow={used}
        aria-label="Site AI replies used today"
      >
        <div className={`h-full rounded-full ${fill}`} style={{ width: `${Math.max(pct, used > 0 ? 2 : 0)}%` }} />
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">{pct}% used · resets at 05:30 IST (00:00 UTC)</p>
    </div>
  );
}

export function UsageDashboard({ stats }: { stats: UsageStats }) {
  const router = useRouter();
  const [showTable, setShowTable] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { daily, totals, features, limitsToday: lt } = stats;
  const today = daily[daily.length - 1];

  const periodVisitors = sum(daily, (d) => d.newVisitors);
  const periodAi = sum(daily, (d) => d.aiReplies);
  const periodMessages = sum(daily, (d) => d.messages);

  const featureRows = [
    { label: "💬 Chats", value: features.chat },
    { label: "📁 Project chats", value: features.projects },
    { label: "🧪 QA Studio runs", value: features.qaStudio },
    { label: "📄 Documents", value: features.documents },
    { label: "📎 Project files", value: features.projectFiles },
    { label: "⌨️ Code Studio docs", value: features.codeStudio },
    { label: "🌿 Wellness messages", value: features.wellness },
  ].sort((a, b) => b.value - a.value);

  const qaRows = stats.qaTools.map((t) => {
    const tool = getQaTool(t.tool);
    return { label: tool ? `${tool.icon} ${tool.name}` : t.tool, value: t.runs };
  });

  const limitRows = [
    { label: `Testers who used all ${BETA_LIMITS.aiCallsPerUserPerDay} AI replies today`, value: lt.usersAtAiCap, of: lt.aiUsersToday },
    { label: `Networks at the ${BETA_LIMITS.aiCallsPerIpPerDay}/day network cap`, value: lt.networksAtAiCap },
    { label: `Testers at ${BETA_LIMITS.qaRunsPerDay} QA runs today`, value: lt.usersAtQaCap },
    { label: `Testers who used both ${BETA_LIMITS.chats} chats (all time)`, value: lt.usersAtChatCap },
    { label: `Testers who used both ${BETA_LIMITS.documents} uploads (all time)`, value: lt.usersAtDocCap },
  ];

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8" data-testid="admin-dashboard">
      {/* Header + the one filter row */}
      <header className="flex flex-wrap items-center gap-3">
        <Logo size="sm" withWordmark={false} />
        <div className="min-w-[12rem] flex-1">
          <h1 className="font-display text-xl font-semibold tracking-tight">Usage dashboard</h1>
          <p className="text-xs text-muted-foreground">
            Updated <LocalTime iso={stats.generatedAt} format="relative" /> · days are UTC
          </p>
        </div>
        {/* Controls: own row on phones, inline from sm up */}
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <nav className="glass flex rounded-full p-1" aria-label="Date range">
            {DASHBOARD_RANGES.map((d) => (
              <Link
                key={d}
                href={`/admin?days=${d}`}
                aria-current={stats.days === d ? "page" : undefined}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  stats.days === d ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`admin-range-${d}`}
              >
                {d} days
              </Link>
            ))}
          </nav>
          <button
            type="button"
            onClick={() => {
              setRefreshing(true);
              router.refresh();
              setTimeout(() => setRefreshing(false), 800);
            }}
            className="rounded-full border border-border/70 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary"
            data-testid="admin-refresh"
          >
            {refreshing ? "Refreshing…" : "↻ Refresh"}
          </button>
          <form action="/admin/logout" method="post">
            <button type="submit" className="rounded-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground" data-testid="admin-logout">
              Lock
            </button>
          </form>
        </div>
      </header>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Active testers today" value={today?.activeUsers ?? 0} hint={`${today?.newVisitors ?? 0} new visitors today`} testID="admin-tile-active" />
        <StatTile label={`New visitors · ${stats.days} days`} value={periodVisitors} hint={`${totals.visitors} all time`} testID="admin-tile-visitors" />
        <StatTile label={`AI replies · ${stats.days} days`} value={periodAi} hint={`${totals.aiRepliesAllTime} all time`} testID="admin-tile-ai" />
        <StatTile label={`Messages sent · ${stats.days} days`} value={periodMessages} hint={`${totals.feedback} feedback notes`} testID="admin-tile-messages" />
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <SiteMeter used={lt.siteAiUsed} cap={lt.siteAiCap} />
        <StatTile label="Projects created" value={totals.projects} hint={`${totals.documents} documents uploaded`} testID="admin-tile-projects" />
        <StatTile label="QA Studio runs" value={totals.qaRuns} hint={`${totals.chats + totals.projectChats} chats started`} testID="admin-tile-qa" />
      </div>

      {/* Trends */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="AI replies per day" subtitle="Every feature that calls the AI, site-wide" testID="admin-card-ai">
          <AiRepliesChart data={daily} />
        </Card>
        <Card title="People per day" subtitle="New visitors vs testers who actually used something" testID="admin-card-people">
          <PeopleChart data={daily} />
        </Card>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="text-xs font-medium text-primary hover:underline"
          aria-expanded={showTable}
          data-testid="admin-table-toggle"
        >
          {showTable ? "Hide daily table" : "Show daily numbers as a table"}
        </button>
      </div>
      {showTable && (
        <div className="glass overflow-x-auto rounded-2xl" data-testid="admin-daily-table">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Day (UTC)</th>
                <th className="px-4 py-2.5 text-right font-medium">New visitors</th>
                <th className="px-4 py-2.5 text-right font-medium">Active testers</th>
                <th className="px-4 py-2.5 text-right font-medium">AI replies</th>
                <th className="px-4 py-2.5 text-right font-medium">Messages</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {[...daily].reverse().map((d) => (
                <tr key={d.day} className="border-b border-border/30 last:border-0">
                  <td className="px-4 py-2">{shortDay(d.day)}</td>
                  <td className="px-4 py-2 text-right">{d.newVisitors}</td>
                  <td className="px-4 py-2 text-right">{d.activeUsers}</td>
                  <td className="px-4 py-2 text-right">{d.aiReplies}</td>
                  <td className="px-4 py-2 text-right">{d.messages}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* What people use */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Feature usage" subtitle={`Actions in the last ${stats.days} days`} testID="admin-card-features">
          <RankedBars rows={featureRows} unit="actions" testID="admin-chart-features" />
        </Card>
        <Card title="Top QA Studio tools" subtitle={`Runs in the last ${stats.days} days`} testID="admin-card-qa">
          <RankedBars rows={qaRows} unit="runs" testID="admin-chart-qa" />
        </Card>
      </div>

      {/* Limits + feedback */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Beta limits hit" subtitle="If these climb, consider raising the limit in lib/beta/config.ts" testID="admin-card-limits">
          <ul className="space-y-2">
            {limitRows.map((row) => (
              <li key={row.label} className="flex items-center gap-3 rounded-xl border border-border/50 px-3 py-2.5 text-sm">
                <span aria-hidden>{row.value > 0 ? "⚠️" : "✅"}</span>
                <span className="min-w-0 flex-1 text-muted-foreground">{row.label}</span>
                <span className="font-semibold">
                  {row.value}
                  {"of" in row && row.of ? <span className="font-normal text-muted-foreground"> / {row.of}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card
          title="Latest feedback"
          subtitle={`${totals.feedback} total · 🐞 ${stats.feedbackByCategory.bug ?? 0} · 💡 ${stats.feedbackByCategory.idea ?? 0} · ❤️ ${stats.feedbackByCategory.praise ?? 0} · 💭 ${stats.feedbackByCategory.other ?? 0}`}
          testID="admin-card-feedback"
        >
          {stats.recentFeedback.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">No feedback yet — it&apos;ll show up here.</p>
          ) : (
            <ul className="space-y-2.5">
              {stats.recentFeedback.map((f) => (
                <li key={f.createdAt + f.message.slice(0, 20)} className="rounded-xl border border-border/50 px-3 py-2.5">
                  <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span aria-hidden>{FEEDBACK_ICON[f.category]}</span>
                    <span className="capitalize">{f.category === "praise" ? "love it" : f.category}</span>
                    {f.page && <span className="truncate">· {f.page}</span>}
                    <span className="ml-auto shrink-0"><LocalTime iso={f.createdAt} format="relative" /></span>
                  </p>
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm">{f.message}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <p className="pb-4 text-center text-[11px] text-muted-foreground">
        All-time: {totals.visitors} visitors ({totals.guests} guests) · {totals.userMessages} messages · {totals.wellnessSessions} wellness sessions · {totals.codeDocs} code docs
      </p>
    </main>
  );
}
