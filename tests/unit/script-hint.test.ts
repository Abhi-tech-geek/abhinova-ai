import { test } from "node:test";
import assert from "node:assert/strict";
import { withScriptHint } from "@/lib/ai/prompts/workspace";

// The Roman-letter hint is added only to all-Latin messages; any other script
// is left alone so the reply keeps it (audit bug B3: Tamil came back in Roman).

const hinted = (message: string) => withScriptHint(message) !== message;

test("Roman Hinglish gets the hint", () => assert.equal(hinted("batao QA kya hota hai"), true));
test("English gets the hint", () => assert.equal(hinted("What is regression testing?"), true));
test("accented Latin still counts as Latin", () => assert.equal(hinted("café résumé"), true));
test("Devanagari is left alone", () => assert.equal(hinted("क्यूए क्या होता है?"), false));
test("Tamil is left alone", () => assert.equal(hinted("வணக்கம், நீங்கள் யார்?"), false));
test("Bengali is left alone", () => assert.equal(hinted("আপনি কেমন আছেন?"), false));
test("Urdu is left alone", () => assert.equal(hinted("آپ کیسے ہیں؟"), false));
test("mixed Latin + Devanagari is left alone", () => assert.equal(hinted("QA क्या है"), false));
test("emoji only: no letters, no hint", () => assert.equal(hinted("🍕🐱💻"), false));
test("maths only: no letters, no hint", () => assert.equal(hinted("2 + 2 * 2 = ?"), false));
test("the stored message stays verbatim at the start", () =>
  assert.ok(withScriptHint("hello").startsWith("hello\n\n")));
