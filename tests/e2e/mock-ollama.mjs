// A tiny fake Ollama for integration tests (port 11555): OpenAI-compatible
// streaming chat at /v1/chat/completions and /api/embed (768-dim vectors).
// Logs which endpoints were hit so the test can prove calls stayed local.
import http from "http";
import { createHash } from "crypto";

const PORT = Number(process.argv[2] ?? 11555);
const hits = [];

function vec(text) {
  // Deterministic pseudo-embedding: same text → same vector; shared words → closer.
  const v = new Array(768).fill(0);
  for (const w of text.toLowerCase().split(/\W+/).filter(Boolean)) {
    const h = createHash("sha256").update(w).digest();
    for (let i = 0; i < 8; i++) v[(h[i] * 3 + i * 97) % 768] += 1;
  }
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}

http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const json = body ? JSON.parse(body) : {};
    hits.push(`${req.method} ${req.url} model=${json.model ?? "-"}`);
    if (req.url === "/__hits") { res.end(JSON.stringify(hits)); return; }
    if (req.url === "/v1/chat/completions") {
      if (json.model !== "llama3.2") { res.writeHead(404); res.end(JSON.stringify({ error: "model not found" })); return; }
      const last = [...json.messages].reverse().find((m) => m.role === "user")?.content ?? "";
      const all = json.messages.map((m) => m.content).join("\n");
      const quoted = all.match(/OTP expires after (\d+) minutes/);
      const reply = quoted ? `Local Llama says: OTP expires after ${quoted[1]} minutes [S1].` : `Local Llama says: I got "${last.slice(0, 40)}".`;
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      for (const word of reply.split(" ")) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: word + " " } }] })}\n\n`);
      res.end("data: [DONE]\n\n");
      return;
    }
    if (req.url === "/api/embed") {
      const inputs = Array.isArray(json.input) ? json.input : [json.input];
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ model: json.model, embeddings: inputs.map((t) => vec(t.replace(/^search_(document|query): /, ""))) }));
      return;
    }
    res.writeHead(404); res.end("{}");
  });
}).listen(PORT, () => console.log(`mock ollama on ${PORT}`));
