import { test } from "node:test";
import assert from "node:assert/strict";
import { containsCrisisSignal } from "@/lib/wellness/crisis";

// The keyword pass is the only crisis check left when the AI is unavailable,
// so it must catch everyday phrasings — without flagging ordinary sentences.

const CRISIS = [
  "Mujhe ab jeena nahi hai",
  "mujhe jina nahi hai yaar",
  "jeene ka mann nahi karta",
  "ab aur nahi jee sakta",
  "mujhe marna hai",
  "main mar jana chahta hoon",
  "sab khatam kar dunga",
  "zinda nahi rehna",
  "मुझे जीना नहीं है",
  "मैं आत्महत्या के बारे में सोच रहा हूँ",
  "I want to die",
  "thinking about suicide",
];

const ORDINARY = [
  "Aaj thoda thak gaya hoon",
  "Meri billi mujhe ignore karti hai",
  "Is bug ne toh maar hi diya 😅",
  "Kaam khatam karke ghar jaunga",
  "Mar gaye yaar itni garmi",
  "Deadline khatam ho gayi",
  "I'm dying to try this pizza",
  "Netflix pe 'Jeena Isi Ka Naam Hai' dekha",
];

for (const text of CRISIS) {
  test(`flags crisis: ${text}`, () => assert.equal(containsCrisisSignal(text), true));
}
for (const text of ORDINARY) {
  test(`does not flag: ${text}`, () => assert.equal(containsCrisisSignal(text), false));
}
