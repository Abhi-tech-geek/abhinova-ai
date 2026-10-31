import { isLocalMode, localChatModel } from "@/lib/ai/ollama";
import { DeleteMyData } from "@/components/shared/delete-my-data";

export const metadata = { title: "Privacy & local mode · AbhiNova AI" };

const REPO_URL = "https://github.com/Abhi-tech-geek/abhinova-ai";

// What AbhiNova stores, who runs the AI, how to run it fully on your own
// computer (Local Mode with Ollama), and "Delete my data". Every statement
// here must match what the code actually does.
export default function PrivacyPage() {
  const local = isLocalMode();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6" data-testid="privacy-page">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Privacy <span className="text-primary">&amp; local mode</span>
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          What AbhiNova keeps, who runs the AI, and how to run everything on your own computer.
        </p>
        <p
          className={`mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
            local ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground"
          }`}
          data-testid="privacy-current-mode"
        >
          {local
            ? `🔒 Local Mode is on — AI runs on this computer (${localChatModel()})`
            : "☁️ You're using the hosted version — AI runs on cloud models"}
        </p>
      </header>

      <div className="space-y-5">
        <Section title="What AbhiNova stores" testId="privacy-stores">
          <ul className="space-y-2">
            <Item>Your chats, uploaded files, projects and notes, QA and code history, and wellness entries — so they&apos;re there when you come back.</Item>
            <Item>They live in a private database (Supabase, Mumbai region). Every table has row-level security: only your own session can read or change your rows.</Item>
            <Item>Uploaded files sit in a private folder of your own. Secrets found in a document (API keys, tokens) are blanked out before it&apos;s indexed.</Item>
            <Item>Nothing is public unless you share it: a chat you share by link can be read by anyone with that link until you press &quot;Stop sharing&quot; or delete the chat. Wellness chats can&apos;t be shared.</Item>
          </ul>
        </Section>

        <Section title="What it never stores" testId="privacy-never">
          <ul className="space-y-2">
            <Item>Your raw IP address — only a salted one-way hash, to apply the daily beta limits.</Item>
            <Item>API keys in plain text — keys you add yourself are encrypted, and the app only ever shows them masked.</Item>
            <Item>Secret files from Code Studio (.env, keys, certificates) — they&apos;re blocked before anything reaches an AI, and your code runs in your browser, not on our server.</Item>
            <Item>Ads or tracking scripts — there are none. The hosting provider keeps standard request logs.</Item>
          </ul>
        </Section>

        <Section title="Who runs the AI" testId="privacy-ai">
          {local ? (
            <p>
              Local Mode: every reply and every document search runs on this computer with{" "}
              <span className="font-mono">{localChatModel()}</span> through Ollama. Nothing is sent to a
              cloud AI, and there is no cloud fallback.
            </p>
          ) : (
            <p>
              The hosted version sends the text needed for each answer to Groq (main model) and Google
              Gemini (backup model and document search). Their own data policies apply to that text.
              Want no cloud AI at all? Run AbhiNova on your own computer — next section.
            </p>
          )}
          <p className="mt-2">
            Agent Mode (off unless you turn on ⚡ Agent) lets the AI look things up before answering: it
            sends a short search phrase to Wikipedia and may open a public web page. Those sites see a
            request from our server, not from you{local ? ", even in Local Mode" : ""}. Private and internal
            addresses are always blocked.
          </p>
        </Section>

        <Section title="Run it fully private on your computer" testId="privacy-local">
          <p>
            AbhiNova is open source. With Local Mode the AI (Llama 3.2) runs on your own machine through{" "}
            <a href="https://ollama.com" target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline">
              Ollama
            </a>
            : free, no API key, no daily AI limits.
          </p>
          <ol className="mt-4 space-y-3">
            <Step n={1} title="Get the code and install">
              <Code>{`git clone ${REPO_URL}.git\ncd abhinova-ai\nnpm install`}</Code>
            </Step>
            <Step n={2} title="Install Ollama and pull the models">
              <Code>{"ollama pull llama3.2\nollama pull nomic-embed-text"}</Code>
            </Step>
            <Step n={3} title="Turn on Local Mode">
              Copy <span className="font-mono">.env.example</span> to <span className="font-mono">.env.local</span>, fill in the
              database settings, and add:
              <Code>{"OLLAMA_URL=http://localhost:11434"}</Code>
            </Step>
            <Step n={4} title="Start it">
              <Code>{"npm run dev"}</Code>
              Open http://localhost:3000 — the top bar shows <span className="font-medium text-success">🔒 Local Mode</span>.
            </Step>
          </ol>
          <p className="mt-4 rounded-xl border border-border/60 bg-secondary/40 p-3 text-xs text-muted-foreground">
            Good to know: you need Node.js, Git and a free Supabase project for the database (the full
            setup is in the{" "}
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline">
              README on GitHub
            </a>
            ). On a laptop without a graphics card, local replies take a few seconds to start and are less
            polished than the cloud models.
          </p>
        </Section>

        <Section title="Delete my data" testId="privacy-delete" id="delete">
          <p>
            Remove everything AbhiNova has stored for you: chats (and their share links), files, projects,
            history, wellness entries, saved keys, connected apps and feedback. It happens immediately and
            can&apos;t be undone.
          </p>
          <div className="mt-4">
            <DeleteMyData />
          </div>
        </Section>
      </div>
    </main>
  );
}

function Section({
  title,
  testId,
  id,
  children,
}: {
  title: string;
  testId: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="glass scroll-mt-6 rounded-2xl p-5 sm:p-6" data-testid={testId}>
      <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function Item({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
      <span>{children}</span>
    </li>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="brand-gradient grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">{title}</p>
        <div className="mt-1">{children}</div>
      </div>
    </li>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="my-2 overflow-x-auto rounded-lg border border-border bg-background/60 p-3 font-mono text-xs leading-relaxed text-foreground">
      <code>{children}</code>
    </pre>
  );
}
