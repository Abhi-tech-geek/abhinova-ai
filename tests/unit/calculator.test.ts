import { test } from "node:test";
import assert from "node:assert/strict";
import { calculate, CalculatorError } from "@/lib/ai/calculator";

const CASES: [string, number][] = [
  ["2 + 2 * 2", 6],
  ["(2 + 2) * 2", 8],
  ["2^3^2", 512],
  ["-3 + 5", 2],
  ["10 / 4", 2.5],
  ["17 % 5", 2],
  ["sqrt(144) + 1", 13],
  ["1.5 * 4", 6],
];

for (const [expr, want] of CASES) {
  test(`${expr} = ${want}`, () => assert.equal(calculate(expr), want));
}
test("× and ÷ symbols work", () => assert.equal(calculate("6 × 7 ÷ 2"), 21));

for (const bad of ["", "2 +", "1/0", "process.exit()", "2 ** 3; alert(1)", "sqrt(-4)", "(1 + 2", "9".repeat(250), "Math.PI"]) {
  test(`rejects ${JSON.stringify(bad.slice(0, 20))}`, () => assert.throws(() => calculate(bad), CalculatorError));
}
