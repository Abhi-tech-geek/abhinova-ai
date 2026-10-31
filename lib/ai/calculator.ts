// Safe arithmetic for Agent Mode's calculator tool. A tiny recursive-descent
// parser — never eval()/Function(), so model-written input can't run code.
// Supports + - * / % ^, parentheses, unary minus, decimals and sqrt().

export class CalculatorError extends Error {}

const MAX_LENGTH = 200;

export function calculate(expression: string): number {
  const src = expression.replace(/\s+/g, "").replace(/×/g, "*").replace(/÷/g, "/");
  if (!src) throw new CalculatorError("Empty expression");
  if (src.length > MAX_LENGTH) throw new CalculatorError("Expression too long");
  if (!/^[0-9.+\-*/%^()sqrt]+$/.test(src)) throw new CalculatorError("Only numbers and + - * / % ^ ( ) sqrt are allowed");

  let pos = 0;
  const peek = () => src[pos];
  const eat = (ch: string) => {
    if (src[pos] === ch) {
      pos++;
      return true;
    }
    return false;
  };

  // expr := term (('+'|'-') term)*
  function expr(): number {
    let value = term();
    for (;;) {
      if (eat("+")) value += term();
      else if (eat("-")) value -= term();
      else return value;
    }
  }
  // term := power (('*'|'/'|'%') power)*
  function term(): number {
    let value = power();
    for (;;) {
      if (eat("*")) value *= power();
      else if (eat("/")) {
        const d = power();
        if (d === 0) throw new CalculatorError("Division by zero");
        value /= d;
      } else if (eat("%")) value %= power();
      else return value;
    }
  }
  // power := unary ('^' power)?   (right-associative)
  function power(): number {
    const base = unary();
    return eat("^") ? Math.pow(base, power()) : base;
  }
  // unary := '-' unary | '+' unary | primary
  function unary(): number {
    if (eat("-")) return -unary();
    if (eat("+")) return unary();
    return primary();
  }
  // primary := number | '(' expr ')' | 'sqrt(' expr ')'
  function primary(): number {
    if (src.startsWith("sqrt(", pos)) {
      pos += 5;
      const v = expr();
      if (!eat(")")) throw new CalculatorError("Missing )");
      if (v < 0) throw new CalculatorError("sqrt of a negative number");
      return Math.sqrt(v);
    }
    if (eat("(")) {
      const v = expr();
      if (!eat(")")) throw new CalculatorError("Missing )");
      return v;
    }
    const start = pos;
    while (pos < src.length && /[0-9.]/.test(src[pos])) pos++;
    const text = src.slice(start, pos);
    if (!text || !/^\d*\.?\d+$|^\d+\.$/.test(text)) {
      throw new CalculatorError(`Unexpected "${peek() ?? "end"}"`);
    }
    return Number(text);
  }

  const result = expr();
  if (pos !== src.length) throw new CalculatorError(`Unexpected "${src[pos]}"`);
  if (!Number.isFinite(result)) throw new CalculatorError("Result is not a finite number");
  return result;
}
