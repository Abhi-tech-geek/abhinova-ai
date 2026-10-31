import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { isLocalMode, localChatModel } from "@/lib/ai/ollama";
import { localModelOption } from "@/lib/models/registry";

const saved = { url: process.env.OLLAMA_URL, model: process.env.OLLAMA_CHAT_MODEL };
afterEach(() => {
  process.env.OLLAMA_URL = saved.url;
  process.env.OLLAMA_CHAT_MODEL = saved.model;
  if (saved.url === undefined) delete process.env.OLLAMA_URL;
  if (saved.model === undefined) delete process.env.OLLAMA_CHAT_MODEL;
});

test("Local Mode is on for an http URL", () => {
  process.env.OLLAMA_URL = "http://localhost:11434";
  assert.equal(isLocalMode(), true);
});
test("Local Mode is off when unset (e.g. on Vercel)", () => {
  delete process.env.OLLAMA_URL;
  assert.equal(isLocalMode(), false);
});
for (const value of ["", " ", "off", "false", "localhost:11434"]) {
  test(`Local Mode is off for OLLAMA_URL=${JSON.stringify(value)}`, () => {
    process.env.OLLAMA_URL = value;
    assert.equal(isLocalMode(), false);
  });
}
test("default local chat model is llama3.2", () => {
  delete process.env.OLLAMA_CHAT_MODEL;
  assert.equal(localChatModel(), "llama3.2");
});
test("the local model option id resolves as ollama/<model>", () => {
  assert.equal(localModelOption("llama3.2").id, "ollama/llama3.2");
});
