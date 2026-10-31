import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { shareIdSchema } from "@/lib/validators/chat";
import ChatMarkdown from "@/components/workspace/chat-markdown";
import { BrandStar } from "@/components/shared/logo";

// Public read-only view of a chat its owner shared (migration 006). No login,
// no guest session: get_shared_chat() returns only this conversation's
// user/assistant messages, or nothing once sharing is stopped.

export const metadata = {
  title: "Shared chat · AbhiNova AI",
  robots: { index: false, follow: false },
};

interface SharedRow {
  title: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export default async function SharedChatPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  if (!shareIdSchema.safeParse(shareId).success) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_shared_chat", { p_share_id: shareId });
  const rows = (data ?? []) as SharedRow[];
  if (error || rows.length === 0) notFound();

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10 sm:px-6" data-testid="share-page">
      <header className="mb-8 border-b border-border/60 pb-5">
        <p className="text-xs font-medium uppercase tracking-wider text-primary">Shared chat</p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight" data-testid="share-title">
          {rows[0].title}
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Shared from AbhiNova AI · read-only · the owner can stop sharing at any time
        </p>
      </header>

      <div className="space-y-6">
        {rows.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end" data-testid="share-message-user">
              <div className="brand-gradient max-w-[78%] whitespace-pre-wrap rounded-[18px] rounded-br-[5px] px-4 py-3 text-sm leading-relaxed text-white">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={i} className="flex gap-3" data-testid="share-message-assistant">
              <span className="brand-gradient mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]">
                <BrandStar className="h-4 w-4" />
              </span>
              <div className="prose-chat min-w-0 flex-1 space-y-2 pt-0.5 text-sm [&_a]:text-accent [&_a]:underline [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_table]:text-xs [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc [&_ul]:pl-5">
                <p className="mb-1.5 text-xs font-semibold text-muted-foreground">AbhiNova</p>
                <ChatMarkdown content={m.content} sources={[]} />
              </div>
            </div>
          )
        )}
      </div>

      <footer className="mt-12 rounded-2xl border border-border/60 p-5 text-center">
        <p className="text-sm text-muted-foreground">Made with AbhiNova AI — chat, QA tools, document Q&amp;A and more.</p>
        <Link
          href="/chat"
          className="brand-gradient mt-3 inline-block rounded-full px-5 py-2 text-sm font-semibold text-white"
          data-testid="share-try-cta"
        >
          Try AbhiNova free
        </Link>
      </footer>
    </main>
  );
}
