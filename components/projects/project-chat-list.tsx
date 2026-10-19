import Link from "next/link";
import { LocalTime } from "@/components/shared/local-time";

export function ProjectChatList({
  projectId,
  chats,
}: {
  projectId: string;
  chats: { id: string; title: string; updated_at: string }[];
}) {
  return (
    <section className="glass rounded-2xl p-5" data-testid="projects-chats-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">💬 Chats</h2>
        <Link
          href={`/projects/${projectId}/chat/new`}
          className="brand-gradient rounded-full px-3 py-1.5 text-xs font-semibold text-white shadow-glow-primary transition-transform hover:scale-[1.03]"
          data-testid="projects-chats-new"
        >
          + New chat in this project
        </Link>
      </div>
      <ul className="mt-3 space-y-1">
        {chats.length === 0 && (
          <li className="text-xs text-muted-foreground/60">No chats yet — start one to ask from this project&apos;s knowledge.</li>
        )}
        {chats.map((chat) => (
          <li key={chat.id}>
            <Link
              href={`/projects/${projectId}/chat/${chat.id}`}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors hover:bg-secondary/50"
              data-testid="projects-chats-item"
            >
              <span className="opacity-70">💬</span>
              <span className="min-w-0 flex-1 truncate">{chat.title}</span>
              <span className="text-[10px] text-muted-foreground"><LocalTime iso={chat.updated_at} format="relative" /></span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
