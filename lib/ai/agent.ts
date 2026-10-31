import { GROQ_MODEL } from "@/lib/ai/groq";
import { isLocalMode, localChatModel, LocalAiError } from "@/lib/ai/ollama";
import { calculate } from "@/lib/ai/calculator";
import { currentTimeNote } from "@/lib/ai/prompts/safety";
import { retrieveChunks, buildDocumentContext } from "@/lib/rag/retrieve";
import { safeFetchText, htmlToBlocks } from "@/lib/connectors/web";
import {
  wikipediaSearchArgs,
  readWebpageArgs,
  searchMyDocumentsArgs,
  calculatorArgs,
} from "@/lib/validators/agent";
import type { AgentStep, AiMessage } from "@/types/chat";
import type { RetrievedSource } from "@/types/documents";

// Agent Mode: the model may call a few safe tools (Wikipedia, read a public
// web page, search the user's own documents, calculator, current time) before
// answering. SERVER-ONLY. Uses OpenAI-style tool calling on Groq, or on the
// local Ollama model in Local Mode. Every tool result is wrapped in
// <tool_result> and treated as data (prompt-injection defence).

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MAX_TOOL_ROUNDS = 4;
const MAX_CALLS_PER_ROUND = 3;
const MAX_PAGE_READS = 2;
const TOOL_RESULT_CHARS = 6000;
const WIKI_UA = "AbhiNovaAI/1.0 (https://abhinova.theabhinavsaxena.in)";

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
interface AgentMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

const TOOLS = [
  {
    type: "function",
    function: {
      name: "wikipedia_search",
      description: "Search English Wikipedia. Returns the best matching articles and a summary of the top one. Use for facts about people, places, organisations, history, science.",
      parameters: { type: "object", properties: { query: { type: "string", description: "What to look up" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "read_webpage",
      description: "Read the main text of a public web page (http/https). Use only for a URL the user gave or one found via search.",
      parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
    },
  },
  {
    type: "function",
    function: {
      name: "search_my_documents",
      description: "Search the user's own uploaded documents (and the current project's knowledge). Returns numbered passages [S1], [S2]… to cite.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "calculator",
      description: "Exact arithmetic: + - * / % ^, parentheses, sqrt(). Use instead of doing maths in your head.",
      parameters: { type: "object", properties: { expression: { type: "string", description: "e.g. (1200 * 18) / 100" } }, required: ["expression"] },
    },
  },
  {
    type: "function",
    function: {
      name: "current_time",
      description: "The current date and time in India (IST).",
      parameters: { type: "object", properties: {} },
    },
  },
] as const;

/** The tool-calling model isn't available (cloud): the caller answers without tools. */
export class AgentUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentUnavailableError";
  }
}

async function toolCompletion(
  messages: AgentMessage[],
  signal: AbortSignal | undefined,
  allowTools: boolean
): Promise<{ content: string | null; tool_calls?: ToolCall[] }> {
  const local = isLocalMode();
  const url = local ? `${(process.env.OLLAMA_URL ?? "").trim().replace(/\/+$/, "")}/v1/chat/completions` : GROQ_API_URL;
  const apiKey = process.env.GROQ_API_KEY;
  if (!local && !apiKey) throw new AgentUnavailableError("GROQ_API_KEY is not set");

  const post = () =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(local ? {} : { Authorization: `Bearer ${apiKey}` }) },
      body: JSON.stringify({
        model: local ? localChatModel() : GROQ_MODEL,
        messages,
        ...(allowTools ? { tools: TOOLS, tool_choice: "auto" } : {}),
        temperature: 0.3,
        max_tokens: 2048,
      }),
      signal,
    });
  let res: Response;
  try {
    res = await post();
    // Free-tier per-minute limit: wait briefly once instead of dropping the tools.
    if (!local && res.status === 429) {
      const wait = Math.min(Number(res.headers.get("retry-after")) || 2, 4);
      await new Promise((r) => setTimeout(r, wait * 1000));
      res = await post();
    }
  } catch (err) {
    if (signal?.aborted) throw err;
    throw local ? new LocalAiError("Ollama is not reachable", err) : new AgentUnavailableError("Tool model unreachable");
  }
  if (!res.ok) {
    // Never log bodies — they can echo request content.
    throw local
      ? new LocalAiError(`Ollama request failed with status ${res.status}`)
      : new AgentUnavailableError(`Tool model failed with status ${res.status}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[] };
  const message = data.choices?.[0]?.message;
  return { content: message?.content ?? null, tool_calls: message?.tool_calls };
}

function parseArgs(raw: string): unknown {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return null;
  }
}

const clip = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

async function wikipedia(query: string, signal?: AbortSignal): Promise<string> {
  const headers = { "User-Agent": WIKI_UA, Accept: "application/json" };
  const timeout = AbortSignal.timeout(8000);
  const both = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const search = await fetch(
    `https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(query)}&limit=3`,
    { headers, signal: both }
  );
  if (!search.ok) throw new Error(`Wikipedia search failed (${search.status})`);
  const { pages = [] } = (await search.json()) as { pages?: { key: string; title: string; description?: string | null }[] };
  if (pages.length === 0) return "No Wikipedia articles found.";
  const summaryRes = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pages[0].key)}`,
    { headers, signal: both }
  );
  const summary = summaryRes.ok ? ((await summaryRes.json()) as { extract?: string }).extract ?? "" : "";
  const list = pages.map((p) => `- ${p.title}${p.description ? ` — ${p.description}` : ""} (https://en.wikipedia.org/wiki/${p.key})`).join("\n");
  return `Top matches:\n${list}\n\nSummary of "${pages[0].title}":\n${summary}`;
}

async function readPage(url: string): Promise<{ text: string; host: string }> {
  const { finalUrl, contentType, body } = await safeFetchText(url);
  const host = new URL(finalUrl).hostname;
  if (/html/i.test(contentType)) {
    const { title, blocks } = htmlToBlocks(body);
    return { host, text: `Title: ${title}\nURL: ${finalUrl}\n\n${blocks.map((b) => b.text).join("\n\n")}` };
  }
  return { host, text: `URL: ${finalUrl}\n\n${body}` };
}

export interface AgentResult {
  text: string;
  steps: AgentStep[];
  sources: RetrievedSource[];
}

/**
 * Runs the tool loop and returns the final answer. `onStep` fires as each tool
 * finishes so the UI can show progress. Throws AgentUnavailableError if the
 * cloud tool model can't be reached before any step ran (caller falls back to
 * a plain answer), or LocalAiError in Local Mode.
 */
export async function runAgent(opts: {
  messages: AiMessage[];
  projectId: string | null;
  /** Sources already in the prompt (project chats): new tags continue after them. */
  initialSources?: RetrievedSource[];
  signal?: AbortSignal;
  onStep?: (step: AgentStep) => void;
}): Promise<AgentResult> {
  const conversation: AgentMessage[] = opts.messages.map((m) => ({ role: m.role, content: m.content }));
  const steps: AgentStep[] = [];
  const sources: RetrievedSource[] = [...(opts.initialSources ?? [])];
  let pageReads = 0;

  const record = (step: AgentStep) => {
    steps.push(step);
    opts.onStep?.(step);
  };

  async function execute(call: ToolCall): Promise<string> {
    const args = parseArgs(call.function.arguments);
    switch (call.function.name) {
      case "wikipedia_search": {
        const p = wikipediaSearchArgs.safeParse(args);
        if (!p.success) return "Error: a non-empty query is required.";
        try {
          const out = await wikipedia(p.data.query, opts.signal);
          record({ tool: "wikipedia_search", label: `Searched Wikipedia for "${clip(p.data.query)}"`, ok: true });
          return out;
        } catch {
          record({ tool: "wikipedia_search", label: `Wikipedia search for "${clip(p.data.query)}" failed`, ok: false });
          return "Error: Wikipedia could not be reached.";
        }
      }
      case "read_webpage": {
        const p = readWebpageArgs.safeParse(args);
        if (!p.success) return "Error: a valid http(s) URL is required.";
        if (pageReads >= MAX_PAGE_READS) return `Error: page-read limit (${MAX_PAGE_READS}) reached for this answer.`;
        pageReads++;
        try {
          const { host, text } = await readPage(p.data.url);
          record({ tool: "read_webpage", label: `Read ${host}`, ok: true });
          return text;
        } catch (err) {
          record({ tool: "read_webpage", label: `Couldn't read ${clip(p.data.url, 40)}`, ok: false });
          return `Error: ${err instanceof Error ? err.message : "the page could not be read."}`;
        }
      }
      case "search_my_documents": {
        const p = searchMyDocumentsArgs.safeParse(args);
        if (!p.success) return "Error: a non-empty query is required.";
        try {
          const found = await retrieveChunks(p.data.query, null, opts.projectId, 5);
          // Keep [S1].. tags unique across several searches in one answer.
          const tagged = found.map((s, i) => ({ ...s, tag: `S${sources.length + i + 1}` }));
          sources.push(...tagged);
          record({ tool: "search_my_documents", label: `Searched your documents for "${clip(p.data.query)}"`, ok: true });
          return tagged.length > 0 ? buildDocumentContext(tagged) : "No matching passages in the user's documents.";
        } catch {
          record({ tool: "search_my_documents", label: "Document search failed", ok: false });
          return "Error: document search is unavailable right now.";
        }
      }
      case "calculator": {
        const p = calculatorArgs.safeParse(args);
        if (!p.success) return "Error: an expression is required.";
        try {
          const value = calculate(p.data.expression);
          record({ tool: "calculator", label: `Calculated ${clip(p.data.expression, 40)} = ${value}`, ok: true });
          return String(value);
        } catch (err) {
          record({ tool: "calculator", label: `Couldn't calculate ${clip(p.data.expression, 40)}`, ok: false });
          return `Error: ${err instanceof Error ? err.message : "invalid expression"}`;
        }
      }
      case "current_time":
        record({ tool: "current_time", label: "Checked the current time", ok: true });
        return currentTimeNote();
      default:
        return `Error: unknown tool "${call.function.name}".`;
    }
  }

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const reply = await toolCompletion(conversation, opts.signal, true);
    const calls = (reply.tool_calls ?? []).slice(0, MAX_CALLS_PER_ROUND);
    if (calls.length === 0) {
      return { text: (reply.content ?? "").trim(), steps, sources };
    }
    conversation.push({ role: "assistant", content: reply.content ?? "", tool_calls: calls });
    for (const call of calls) {
      const result = await execute(call);
      conversation.push({
        role: "tool",
        tool_call_id: call.id,
        content: `<tool_result name="${call.function.name}">\n${result.slice(0, TOOL_RESULT_CHARS)}\n</tool_result>`,
      });
    }
  }
  // Tool budget used up: ask for the final answer with no more tools.
  const final = await toolCompletion(
    [...conversation, { role: "user", content: "Tool limit reached. Write your final answer now from what you found." }],
    opts.signal,
    false
  );
  return { text: (final.content ?? "").trim(), steps, sources };
}
