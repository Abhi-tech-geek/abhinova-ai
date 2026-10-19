"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ConversationList } from "@/components/workspace/conversation-list";
import { SessionList, type SessionItem } from "@/components/workspace/session-list";
import { UserMenu } from "@/components/workspace/user-menu";
import { Logo } from "@/components/shared/logo";
import { openCommandPalette } from "@/components/shared/command-palette";
import type { ConversationRecord } from "@/types/chat";

export interface SidebarData {
  conversations: ConversationRecord[];
  qaSessions: SessionItem[];
  codeSessions: SessionItem[];
  docSessions: SessionItem[];
  projects: SessionItem[];
  /** Chats inside projects; the sidebar shows the current project's. */
  projectChats: (SessionItem & { projectId: string })[];
}

interface SidebarProps {
  data: SidebarData;
  userEmail: string | null;
  displayName: string | null;
  isGuestUser: boolean;
  wellnessEnabled: boolean;
}

// Claude / ChatGPT-style sidebar: brand → New → Search → feature nav →
// the current feature's history (grouped by recency) → account menu.
const NAV = [
  { key: "chat", href: "/chat", label: "Chats", icon: "💬" },
  { key: "projects", href: "/projects", label: "Projects", icon: "📁" },
  { key: "qa", href: "/qa-studio", label: "QA Studio", icon: "🧪" },
  { key: "code", href: "/code-studio", label: "Code Studio", icon: "⌨️" },
  { key: "documents", href: "/documents", label: "Documents", icon: "📄" },
] as const;

const SECTIONS = {
  chat: { label: "Recent chats", newLabel: "New chat", href: "/chat" },
  projects: { label: "Your projects", newLabel: "New project", href: "/projects?new=1" },
  projectChats: { label: "Project chats", newLabel: "New chat", href: "" },
  qa: { label: "Recent QA runs", newLabel: "New QA session", href: "/qa-studio" },
  code: { label: "Generated docs", newLabel: "New code session", href: "/code-studio" },
  documents: { label: "Your documents", newLabel: "Upload document", href: "/documents" },
} as const;

type SectionKey = keyof typeof SECTIONS;

function sectionFor(pathname: string): SectionKey {
  if (/^\/projects\/[^/]+/.test(pathname)) return "projectChats";
  if (pathname.startsWith("/projects")) return "projects";
  if (pathname.startsWith("/qa-studio")) return "qa";
  if (pathname.startsWith("/code-studio")) return "code";
  if (pathname.startsWith("/documents")) return "documents";
  return "chat";
}

const COLLAPSE_KEY = "anv:sidebar-collapsed";

function SidebarContent({
  data,
  userEmail,
  displayName,
  isGuestUser,
  wellnessEnabled,
  collapsed = false,
  onToggleCollapse,
  onNavigate,
}: SidebarProps & { collapsed?: boolean; onToggleCollapse?: () => void; onNavigate?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const [filter, setFilter] = useState("");
  const sectionKey = sectionFor(pathname);
  const currentProjectId = pathname.match(/^\/projects\/([0-9a-f-]{36})/)?.[1] ?? null;
  const currentProject = data.projects.find((p) => p.id === currentProjectId);
  const section =
    sectionKey === "projectChats" && currentProjectId
      ? {
          ...SECTIONS.projectChats,
          label: currentProject ? `${currentProject.icon ?? "📁"} ${currentProject.title}` : SECTIONS.projectChats.label,
          href: `/projects/${currentProjectId}/chat/new`,
        }
      : SECTIONS[sectionKey];
  const activeNav = sectionKey === "projectChats" ? "projects" : sectionKey;

  // Reset the history filter when switching features.
  useEffect(() => setFilter(""), [sectionKey]);

  const listLength = {
    chat: data.conversations.length,
    projects: data.projects.length,
    projectChats: data.projectChats.filter((c) => c.projectId === currentProjectId).length,
    qa: data.qaSessions.length,
    code: data.codeSessions.length,
    documents: data.docSessions.length,
  }[sectionKey];

  const rowBase = `flex h-9 items-center rounded-lg text-sm transition-colors ${
    collapsed ? "w-9 justify-center" : "gap-2.5 px-2.5"
  }`;

  return (
    <>
      {/* Brand + collapse */}
      <div className={`flex items-center pb-1 pt-3 ${collapsed ? "flex-col gap-2 px-2" : "justify-between pl-4 pr-2"}`}>
        <Link href="/chat" onClick={onNavigate} aria-label="AbhiNova home" data-testid="sidebar-logo">
          <Logo size="sm" withWordmark={!collapsed} />
        </Link>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
            data-testid="sidebar-collapse-toggle"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" />
              <path d="M7.5 3.5v13" />
            </svg>
          </button>
        )}
      </div>

      {/* Primary actions + feature nav */}
      <nav className={`space-y-0.5 pb-2 pt-2 ${collapsed ? "flex flex-col items-center px-2" : "px-2"}`} aria-label="Main">
        <button
          type="button"
          onClick={() => {
            router.push(section.href);
            onNavigate?.();
          }}
          title={collapsed ? section.newLabel : undefined}
          className={`${rowBase} ${collapsed ? "" : "w-full"} font-medium text-foreground hover:bg-secondary/60`}
          data-testid="sidebar-newchat-action"
        >
          <span className="brand-gradient grid h-6 w-6 shrink-0 place-items-center rounded-full text-sm leading-none text-white shadow-glow-primary" aria-hidden>
            +
          </span>
          {!collapsed && <span className="truncate">{section.newLabel}</span>}
        </button>
        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            openCommandPalette();
          }}
          title={collapsed ? "Search (Ctrl+K)" : undefined}
          className={`${rowBase} ${collapsed ? "" : "w-full"} text-muted-foreground hover:bg-secondary/60 hover:text-foreground`}
          data-testid="sidebar-search-action"
        >
          <span className="grid w-6 shrink-0 place-items-center" aria-hidden>🔍</span>
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Search</span>
              <kbd className="rounded border border-border/70 px-1.5 font-mono text-[10px] text-muted-foreground/70">Ctrl K</kbd>
            </>
          )}
        </button>

        <div className={collapsed ? "my-1.5 h-px w-6 bg-border/60" : "mx-2.5 my-1.5 h-px bg-border/60"} />

        {NAV.map((item) => {
          const active = activeNav === item.key;
          return (
            <Link
              key={item.key}
              href={item.href}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              aria-current={active ? "page" : undefined}
              className={`${rowBase} ${
                active
                  ? "bg-secondary font-medium text-foreground"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              }`}
              data-testid={`sidebar-nav-${item.key}`}
            >
              <span className="grid w-6 shrink-0 place-items-center" aria-hidden>{item.icon}</span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Current feature's history */}
      {collapsed ? (
        <div className="flex-1" />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col border-t border-border/40 pt-2">
          <div className="flex items-center gap-2 px-4 pb-1.5">
            <p className="min-w-0 flex-1 truncate text-xs font-semibold text-muted-foreground" data-testid="sidebar-section-label">
              {section.label}
            </p>
          </div>
          {listLength > 8 && (
            <div className="mx-3 mb-2 flex items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-2.5 py-1">
              <span className="text-[11px] text-muted-foreground/60" aria-hidden>⌕</span>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter…"
                aria-label={`Filter ${section.label}`}
                className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
                data-testid="sidebar-session-search"
              />
              {filter && (
                <button
                  type="button"
                  onClick={() => setFilter("")}
                  aria-label="Clear filter"
                  className="text-xs text-muted-foreground/60 hover:text-foreground"
                  data-testid="sidebar-session-search-clear"
                >
                  ✕
                </button>
              )}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2" data-testid="sidebar-history">
            {sectionKey === "chat" && <ConversationList conversations={data.conversations} filter={filter} />}
            {sectionKey === "projects" && (
              <SessionList items={data.projects} filter={filter} emptyHint="No projects yet — create one above." />
            )}
            {sectionKey === "projectChats" && (
              <SessionList
                items={data.projectChats.filter((c) => c.projectId === currentProjectId)}
                filter={filter}
                emptyHint="No chats in this project yet."
              />
            )}
            {sectionKey === "qa" && (
              <SessionList items={data.qaSessions} filter={filter} deleteTable="qa_artifacts" emptyHint="Your QA runs will appear here." />
            )}
            {sectionKey === "code" && (
              <SessionList items={data.codeSessions} filter={filter} deleteTable="code_docs" emptyHint="Generated docs will appear here." />
            )}
            {sectionKey === "documents" && (
              <SessionList items={data.docSessions} filter={filter} emptyHint="Uploaded documents will appear here." />
            )}
          </div>
        </div>
      )}

      {/* Account */}
      <div className={`border-t border-border/40 p-2 ${collapsed ? "flex justify-center" : ""}`}>
        <UserMenu
          userEmail={userEmail}
          displayName={displayName}
          isGuestUser={isGuestUser}
          wellnessEnabled={wellnessEnabled}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      </div>
    </>
  );
}

// Desktop: collapsible aside (state remembered per browser).
// Mobile (<md): slim top bar + slide-over drawer with the full sidebar.
export function Sidebar(props: SidebarProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // storage blocked — default expanded
    }
  }, []);

  // Close the drawer on navigation (back button, links inside pages).
  useEffect(() => setDrawerOpen(false), [pathname]);

  function toggleCollapse() {
    setCollapsed((prev) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, prev ? "0" : "1");
      } catch {
        // ignore
      }
      return !prev;
    });
  }

  return (
    <>
      {/* CSS entrance (not framer) so the server-rendered sidebar is never
          stuck invisible/offset while waiting for hydration. */}
      <aside
        className={`hidden h-full shrink-0 flex-col border-r border-border/60 bg-card/40 backdrop-blur transition-[width] duration-200 animate-in fade-in slide-in-from-left-4 motion-reduce:animate-none md:flex ${
          collapsed ? "w-[60px]" : "w-64"
        }`}
        data-testid="workspace-sidebar"
        data-collapsed={collapsed}
      >
        <SidebarContent {...props} collapsed={collapsed} onToggleCollapse={toggleCollapse} />
      </aside>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-12 items-center gap-2 border-b border-border/60 bg-card/80 px-2 backdrop-blur md:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="Open menu"
          data-testid="sidebar-mobile-open"
        >
          ☰
        </button>
        <Link href="/chat" aria-label="AbhiNova home">
          <Logo size="sm" />
        </Link>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => router.push("/chat")}
          className="grid h-9 w-9 place-items-center rounded-lg text-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="New chat"
          data-testid="sidebar-mobile-newchat"
        >
          ✎
        </button>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
            data-testid="sidebar-mobile-backdrop"
          />
          <motion.aside
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute inset-y-0 left-0 flex w-[min(18rem,85vw)] flex-col border-r border-border/60 bg-card shadow-glass"
            data-testid="workspace-sidebar-mobile"
          >
            <SidebarContent {...props} onNavigate={() => setDrawerOpen(false)} />
          </motion.aside>
        </div>
      )}
    </>
  );
}
