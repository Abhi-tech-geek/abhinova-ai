"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { groupByRecency } from "@/lib/utils";
import { useMounted } from "@/hooks/use-mounted";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface SessionItem {
  id: string;
  title: string;
  href: string;
  createdAt: string;
  icon?: string;
}

export interface RowAction {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  testID: string;
}

/**
 * One sidebar history row (Claude/ChatGPT style): single-line title, active
 * highlight, and a "⋯" menu that appears on hover/focus.
 */
export function SidebarRow({
  href,
  title,
  icon,
  active,
  actions = [],
  testID,
}: {
  href: string;
  title: string;
  icon?: string;
  active: boolean;
  actions?: RowAction[];
  testID: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <li className="group relative">
      <Link
        href={href}
        title={title}
        aria-current={active ? "page" : undefined}
        className={`flex h-8 items-center gap-2 rounded-lg px-2.5 text-[13px] transition-colors ${
          actions.length > 0 ? "pr-8" : ""
        } ${active ? "bg-secondary font-medium text-foreground" : "text-foreground/80 hover:bg-secondary/50 hover:text-foreground"}`}
        data-testid={testID}
      >
        {icon && <span className="shrink-0 text-xs opacity-70" aria-hidden>{icon}</span>}
        <span className="min-w-0 flex-1 truncate">{title}</span>
      </Link>
      {actions.length > 0 && (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Options for ${title}`}
              className={`absolute right-1 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-opacity hover:bg-background/60 hover:text-foreground focus-visible:opacity-100 ${
                menuOpen || active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              }`}
              data-testid={`${testID}-menu`}
            >
              ⋯
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="right" className="w-40">
            {actions.map((a) => (
              <DropdownMenuItem
                key={a.label}
                onSelect={a.onSelect}
                className={a.destructive ? "text-destructive focus:text-destructive" : undefined}
                data-testid={a.testID}
              >
                {a.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}

/** Renders items under Today / Yesterday / Previous 7 days / … headings. */
export function RecencyGroups<T>({
  items,
  getIso,
  renderItem,
}: {
  items: T[];
  getIso: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
}) {
  // "Today" depends on the viewer's timezone — group only after mount so the
  // server (UTC) render can't mismatch. Before that: same rows, no headings.
  const mounted = useMounted();
  if (!mounted) return <ul className="space-y-px">{items.map(renderItem)}</ul>;
  return (
    <div className="space-y-3">
      {groupByRecency(items, getIso).map((group) => (
        <section key={group.label}>
          <h3 className="px-2.5 pb-1 text-[11px] font-medium text-muted-foreground/70">{group.label}</h3>
          <ul className="space-y-px">{group.items.map(renderItem)}</ul>
        </section>
      ))}
    </div>
  );
}

// Generic sidebar session list (QA runs, code docs, documents, projects,
// project chats). Chat conversations use ConversationList (rename support).
export function SessionList({
  items,
  filter,
  deleteTable,
  emptyHint,
}: {
  items: SessionItem[];
  filter: string;
  deleteTable?: "qa_artifacts" | "code_docs";
  emptyHint: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const visible = items.filter((item) =>
    item.title.toLowerCase().includes(filter.toLowerCase())
  );

  async function remove(item: SessionItem) {
    if (!deleteTable || deletingId) return;
    setDeletingId(item.id);
    const supabase = createClient();
    const { error } = await supabase.from(deleteTable).delete().eq("id", item.id);
    setDeletingId(null);
    if (error) {
      toast.error("Delete failed. Please try again.");
      return;
    }
    toast.success("Deleted.");
    router.refresh();
  }

  if (visible.length === 0) {
    return (
      <p className="px-2.5 py-2 text-xs text-muted-foreground/60" data-testid="sidebar-sessions-empty">
        {filter ? "No matches." : emptyHint}
      </p>
    );
  }

  return (
    <RecencyGroups
      items={visible}
      getIso={(item) => item.createdAt}
      renderItem={(item) => (
        <SidebarRow
          key={item.id}
          href={item.href}
          title={item.title}
          icon={item.icon}
          // Only id-specific links can be "the current one" (QA runs share a tool URL).
          active={item.href.includes(item.id) && (pathname === item.href || pathname.startsWith(`${item.href}/`))}
          testID="sidebar-session-item"
          actions={
            deleteTable
              ? [{ label: "Delete", destructive: true, onSelect: () => remove(item), testID: "sidebar-session-delete" }]
              : []
          }
        />
      )}
    />
  );
}
