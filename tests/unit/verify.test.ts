import { test } from "node:test";
import assert from "node:assert/strict";
import { extractClaims, buildSourceCheckInput } from "../../lib/rag/verify";

test("one statement per sentence with its tags", () => {
  const claims = extractClaims("P0 bugs are fixed within 24 hours [S1]. Staging restarts on Sunday [S2].");
  assert.deepEqual(claims, [
    { claim: "P0 bugs are fixed within 24 hours", tags: ["S1"] },
    { claim: "Staging restarts on Sunday", tags: ["S2"] },
  ]);
});

test("【S1】 (gpt-oss style), [S1][S2] and [S1, S2] all count", () => {
  const claims = extractClaims("Leave is 18 days a year 【S1】\nMeera leads QA [S2][S3]\nLunch is at 12:30 [S1, S4]");
  assert.deepEqual(claims.map((c) => c.tags), [["S1"], ["S2", "S3"], ["S1", "S4"]]);
});

test("a bare tag after the full stop joins the sentence before", () => {
  const claims = extractClaims("The server restarts every Sunday at 2 AM. [S1]");
  assert.deepEqual(claims, [{ claim: "The server restarts every Sunday at 2 AM", tags: ["S1"] }]);
});

test("markdown bullets and bold are stripped; uncited lines are skipped", () => {
  const claims = extractClaims("Here is what I found:\n- **P0 bugs**: fixed within 24 hours [S1]\n1. Meera is the QA lead [S2]");
  assert.deepEqual(claims.map((c) => c.claim), ["P0 bugs: fixed within 24 hours", "Meera is the QA lead"]);
});

test("two cited facts in one sentence become two statements", () => {
  const claims = extractClaims("P0 bugs ko 24 ghante me fix karna hai 【S1】 aur QA lead Meera hai 【S2】.");
  assert.deepEqual(claims, [
    { claim: "P0 bugs ko 24 ghante me fix karna hai", tags: ["S1"] },
    { claim: "aur QA lead Meera hai", tags: ["S2"] },
  ]);
});

test("Hindi danda ends a sentence", () => {
  const claims = extractClaims("P0 बग 24 घंटे में ठीक होते हैं [S1]। सर्वर रविवार को रीस्टार्ट होता है [S2]।");
  assert.equal(claims.length, 2);
});

test("at most 12 statements are checked", () => {
  const answer = Array.from({ length: 20 }, (_, i) => `Statement number ${i + 1} here [S1].`).join(" ");
  assert.equal(extractClaims(answer).length, 12);
});

test("judge input only includes cited passages, wrapped as data", () => {
  const input = buildSourceCheckInput(
    [{ claim: "P0 bugs are fixed within 24 hours", tags: ["S1"] }],
    new Map([["S1", "Bugs marked P0 must be fixed within 24 hours."], ["S2", "unrelated"]])
  );
  assert.match(input, /\[S1\]\n<document_content>\nBugs marked P0/);
  assert.doesNotMatch(input, /unrelated/);
  assert.match(input, /1\. P0 bugs are fixed within 24 hours \(cites S1\)/);
});
