// Built-in models + provider definitions. Model selection is data-driven from
// here. Built-in defaults (Groq + Gemini) always work with the app's own env
// keys — no user setup. BYOK models are the user's, routed with their key.
//
// Model id formats:
//   built-in:  "groq/openai/gpt-oss-120b", "gemini/gemini-flash-latest"
//   BYOK:      "byok/<user_api_keys.id>/<modelName>"

export type Provider = "groq" | "gemini" | "openai" | "anthropic" | "openrouter";

export interface ProviderDefinition {
  id: Provider;
  label: string;
  /** OpenAI-compatible chat-completions endpoint, when the provider has one. */
  openAiCompatUrl?: string;
  /** Placeholder shown in the BYOK key form. */
  keyHint: string;
  /** Cheap model used for the save-time key validation call. */
  testModel: string;
  /** Suggested models shown when adding a BYOK key. */
  suggestedModels: string[];
}

export const PROVIDERS: Record<Provider, ProviderDefinition> = {
  groq: {
    id: "groq",
    label: "Groq",
    openAiCompatUrl: "https://api.groq.com/openai/v1/chat/completions",
    keyHint: "gsk_…",
    testModel: "openai/gpt-oss-20b",
    suggestedModels: ["openai/gpt-oss-120b", "openai/gpt-oss-20b"],
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    keyHint: "AIza… / AQ.…",
    testModel: "gemini-flash-latest",
    suggestedModels: ["gemini-flash-latest", "gemini-3.5-flash", "gemini-flash-lite-latest"],
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    openAiCompatUrl: "https://api.openai.com/v1/chat/completions",
    keyHint: "sk-…",
    testModel: "gpt-4o-mini",
    suggestedModels: ["gpt-4o", "gpt-4o-mini"],
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    keyHint: "sk-ant-…",
    testModel: "claude-haiku-5-5",
    suggestedModels: ["claude-sonnet-5-5", "claude-haiku-5-5"],
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter (any LLM)",
    openAiCompatUrl: "https://openrouter.ai/api/v1/chat/completions",
    keyHint: "sk-or-…",
    testModel: "meta-llama/llama-3.3-70b-instruct",
    suggestedModels: [
      "meta-llama/llama-3.3-70b-instruct",
      "deepseek/deepseek-chat",
      "openai/gpt-oss-120b",
    ],
  },
};

/** A selectable model as shown in the ModelPicker. */
export interface ModelOption {
  id: string; // see id formats above
  label: string;
  provider: Provider;
  byok: boolean;
}

export const BUILT_IN_MODELS: ModelOption[] = [
  {
    id: "groq/openai/gpt-oss-120b",
    label: "GPT-OSS 120B (Groq — default)",
    provider: "groq",
    byok: false,
  },
  {
    id: "groq/openai/gpt-oss-20b",
    label: "GPT-OSS 20B (Groq — lighter)",
    provider: "groq",
    byok: false,
  },
  {
    id: "gemini/gemini-flash-latest",
    label: "Gemini Flash (latest)",
    provider: "gemini",
    byok: false,
  },
];

/** Resolved routing target for one AI call. apiKey present only for BYOK. */
export interface ResolvedModel {
  provider: Provider;
  model: string;
  apiKey?: string;
}
