import { ChatPanel } from "@/components/workspace/chat-panel";

// New chat — the conversation row is created by /api/chat on the first message.
export default function ChatPage() {
  return <ChatPanel conversationId={null} initialMessages={[]} />;
}
