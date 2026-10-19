// Blocks secret files/content from EVER reaching an LLM (CLAUDE.md Code Studio
// Security Rules). Runs client-side during indexing AND server-side on every
// api/code request (defense in depth). Skipped files are reported to the user.

export const SECRET_FILE_DENYLIST: RegExp[] = [
  /(^|\/)\.env(\..*)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.crt$/i,
  /(^|\/)id_rsa[^/]*$/i,
  /(^|\/)id_ed25519[^/]*$/i,
  /credential/i,
  /(^|\/)\.git(\/|$)/,
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)\.next(\/|$)/,
  /secrets?\.(json|ya?ml|toml)$/i,
  /\.p12$/i,
  /\.pfx$/i,
];

// Common API key / token shapes inside file content.
const SECRET_CONTENT_PATTERNS: RegExp[] = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /sk-[a-zA-Z0-9_-]{20,}/, // OpenAI/Anthropic-style
  /gsk_[a-zA-Z0-9]{20,}/, // Groq
  /AIza[a-zA-Z0-9_-]{30,}/, // Google
  /gh[pousr]_[a-zA-Z0-9]{30,}/, // GitHub tokens
  /xox[baprs]-[a-zA-Z0-9-]{10,}/, // Slack
  /AKIA[0-9A-Z]{16}/, // AWS access key id
  /eyJ[a-zA-Z0-9_-]{20,}\.eyJ[a-zA-Z0-9_-]{20,}/, // JWTs
  /ATATT[a-zA-Z0-9_=-]{20,}/, // Atlassian API tokens
  /(?:secret|ntn)_[a-zA-Z0-9]{30,}/, // Notion integration secrets
  /ya29\.[a-zA-Z0-9_-]{20,}/, // Google OAuth access tokens
  /sb_secret_[a-zA-Z0-9_-]{20,}/, // Supabase secret keys
];

const PRIVATE_KEY_BLOCK =
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g;

/**
 * Replaces credential-looking strings with a marker before external content
 * (connector syncs, uploads) is embedded. Returns how many were redacted so
 * the UI can tell the user.
 */
export function redactSecrets(text: string): { text: string; redacted: number } {
  let redacted = 0;
  let out = text.replace(PRIVATE_KEY_BLOCK, () => {
    redacted++;
    return "[REDACTED PRIVATE KEY]";
  });
  for (const pattern of SECRET_CONTENT_PATTERNS) {
    out = out.replace(new RegExp(pattern.source, "g"), () => {
      redacted++;
      return "[REDACTED SECRET]";
    });
  }
  return { text: out, redacted };
}

export function isSecretPath(path: string): boolean {
  return SECRET_FILE_DENYLIST.some((pattern) => pattern.test(path));
}

export function contentLooksSecret(content: string): boolean {
  return SECRET_CONTENT_PATTERNS.some((pattern) => pattern.test(content));
}

export interface SecretScanResult {
  blocked: boolean;
  reason: string | null;
}

export function scanFile(path: string, content: string): SecretScanResult {
  if (isSecretPath(path)) {
    return {
      blocked: true,
      reason: "matches the secret-file denylist (.env / keys / certs / vcs internals)",
    };
  }
  if (contentLooksSecret(content)) {
    return {
      blocked: true,
      reason: "content contains something that looks like an API key, token, or private key",
    };
  }
  return { blocked: false, reason: null };
}
