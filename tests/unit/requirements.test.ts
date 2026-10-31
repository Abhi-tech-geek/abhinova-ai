import { test } from "node:test";
import assert from "node:assert/strict";
import { splitRequirements, coverageOf, joinChunks } from "../../lib/qa-tools";

test("one requirement per bullet / numbered line, numbered R1…", () => {
  const reqs = splitRequirements("- Users can sign up with email\n2. Password must be 8-64 characters\n* Verification email is sent");
  assert.deepEqual(reqs, [
    { id: "R1", text: "Users can sign up with email" },
    { id: "R2", text: "Password must be 8-64 characters" },
    { id: "R3", text: "Verification email is sent" },
  ]);
});

test("headings and very short lines are skipped", () => {
  const reqs = splitRequirements("Login:\nok\n- After 5 failed attempts the account locks for 15 minutes");
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0].text, "After 5 failed attempts the account locks for 15 minutes");
});

test("a long paragraph is split into sentences", () => {
  const story =
    "As a registered user, I can reset my password from the login page and get an email with a link. The link expires in 30 minutes and works only once. After 5 reset requests in an hour the form is blocked for 1 hour.";
  assert.equal(splitRequirements(story).length, 3);
});

test("existing R-numbers in the input aren't doubled", () => {
  assert.equal(splitRequirements("R1: Users can log in with Google")[0].text, "Users can log in with Google");
});

test("at most 40 requirements", () => {
  const many = Array.from({ length: 60 }, (_, i) => `- Requirement number ${i + 1} must hold`).join("\n");
  assert.equal(splitRequirements(many).length, 40);
});

test("coverage: who covers what, gaps, percent; unknown ids ignored", () => {
  const reqs = [{ id: "R1", text: "a" }, { id: "R2", text: "b" }, { id: "R3", text: "c" }];
  const { byRequirement, uncovered, percent } = coverageOf(reqs, [
    { id: "TC-001", covers: ["R1"] },
    { id: "TC-002", covers: ["R1", "R3", "R99"] },
  ]);
  assert.deepEqual(byRequirement.get("R1"), ["TC-001", "TC-002"]);
  assert.deepEqual(uncovered.map((r) => r.id), ["R2"]);
  assert.equal(percent, 67);
});

test("joinChunks drops the overlap between neighbouring passages", () => {
  const a = "Requirement one is here. Requirement two is also here and it is long enough.";
  const b = "two is also here and it is long enough. Requirement three follows.";
  assert.equal(joinChunks([a, b]), "Requirement one is here. Requirement two is also here and it is long enough. Requirement three follows.");
});

test("joinChunks keeps unrelated passages on separate lines", () => {
  assert.equal(joinChunks(["Page one text.", "Page two text."]), "Page one text.\nPage two text.");
});
