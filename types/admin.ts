// Shape returned by public.admin_usage_stats() (migration 005).

export interface DailyUsage {
  day: string; // YYYY-MM-DD (UTC)
  newVisitors: number;
  activeUsers: number;
  aiReplies: number;
  messages: number;
}

export interface UsageStats {
  generatedAt: string;
  days: number;
  today: string;
  daily: DailyUsage[];
  totals: {
    visitors: number;
    guests: number;
    chats: number;
    projectChats: number;
    wellnessSessions: number;
    userMessages: number;
    qaRuns: number;
    documents: number;
    projects: number;
    codeDocs: number;
    feedback: number;
    aiRepliesAllTime: number;
  };
  features: {
    chat: number;
    projects: number;
    qaStudio: number;
    documents: number;
    projectFiles: number;
    codeStudio: number;
    wellness: number;
  };
  limitsToday: {
    siteAiUsed: number;
    siteAiCap: number;
    usersAtAiCap: number;
    networksAtAiCap: number;
    usersAtQaCap: number;
    usersAtChatCap: number;
    usersAtDocCap: number;
    aiUsersToday: number;
  };
  qaTools: { tool: string; runs: number }[];
  feedbackByCategory: Partial<Record<"bug" | "idea" | "praise" | "other", number>>;
  recentFeedback: {
    createdAt: string;
    category: "bug" | "idea" | "praise" | "other";
    message: string;
    page: string | null;
    isGuest: boolean;
  }[];
}

/** Newer features + reply ratings (lib/admin/feature-stats.ts). Counts only. */
export interface FeatureStats {
  ratings: { up: number; down: number; upAllTime: number; downAllTime: number };
  /** Per-day site counters (lib/admin/events.ts), summed over the range. */
  events: Record<"ai_busy" | "agent_fallback" | "regenerate" | "source_check" | "chat_search", number>;
  /** AI-busy count per UTC day in the range, oldest first. */
  busyByDay: { day: string; count: number }[];
  usage: { agentReplies: number; coverageRuns: number; screenshotBugReports: number };
  personalisation: { memoryOn: number; memoryFacts: number; savedPrompts: number; sharedChats: number };
}

export const DASHBOARD_RANGES = [7, 14, 30] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];
