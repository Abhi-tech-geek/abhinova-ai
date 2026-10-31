import { test } from "node:test";
import assert from "node:assert/strict";
import { hasMalformedId, safeNextPath } from "@/lib/utils";

const U = "4ccd9850-2dd2-46fb-b608-3d215d7197d2";

const MALFORMED: [string, boolean][] = [
  ["/chat", false],
  ["/chat/", false],
  [`/chat/${U}`, false],
  [`/chat/${U.toUpperCase()}`, false],
  ["/chat/abc", true],
  [`/chat/${U}x`, true],
  ["/projects", false],
  [`/projects/${U}`, false],
  [`/projects/${U}/`, false],
  ["/projects/not-a-uuid", true],
  [`/projects/${U}/chat/new`, false],
  [`/projects/${U}/chat/${U}`, false],
  [`/projects/${U}/chat/zzz`, true],
  ["/projects/zzz/chat/new", true],
  ["/qa-studio", false],
  ["/privacy", false],
];
for (const [path, want] of MALFORMED) {
  test(`hasMalformedId(${path}) = ${want}`, () => assert.equal(hasMalformedId(path), want));
}

const ORIGIN = "https://abhinova.example";
test("safeNextPath keeps same-origin paths", () => assert.equal(safeNextPath("/projects?x=1", ORIGIN), "/projects?x=1"));
test("safeNextPath blocks other origins", () => assert.equal(safeNextPath("https://evil.example/x", ORIGIN), "/chat"));
test("safeNextPath blocks protocol-relative tricks", () => assert.equal(safeNextPath("//evil.example", ORIGIN), "/chat"));
test("safeNextPath collapses backslash tricks", () => assert.equal(safeNextPath("/\\evil.example", ORIGIN).startsWith("//"), false));
test("safeNextPath falls back on empty", () => assert.equal(safeNextPath(null, ORIGIN), "/chat"));
