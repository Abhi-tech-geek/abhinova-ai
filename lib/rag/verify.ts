// Source check helpers: split an answer into the statements it cites, and
// build the judge's input. The judging itself is an AI call made by
// app/api/documents/verify/route.ts (embeddings alone can't tell "same topic"
// from "actually says this" — measured: a wrong number scores like a match).

const MAX_CLAIMS = 12;
const MIN_CLAIM_CHARS = 12;

// gpt-oss writes 【S1】; others write [S1], [S1][S2] or [S1, S2].
const TAG_GROUP = /[[【]\s*(S\d+(?:\s*[,，]\s*S\d+)*)\s*[\]】]/g;

export interface Claim {
  claim: string;
  tags: string[];
}

/** Splits an answer into statements and the [S#] tags each one cites. */
export function extractClaims(answer: string): Claim[] {
  const claims: Claim[] = [];
  for (const line of answer.split(/\n+/)) {
    let previous: { text: string; claim: Claim | null } | null = null;
    // Split at sentence ends, and after a citation that more text follows
    // ("X [S1] aur Y [S2]" is two statements).
    for (const segment of line.split(/(?<=[.!?।])\s+|(?<=[\]】][,;:]?)\s+(?=[^\s[【])/)) {
      const tags = [...segment.matchAll(TAG_GROUP)].flatMap((m) => m[1].split(/\s*[,，]\s*/));
      const text = segment
        .replace(TAG_GROUP, "")
        .replace(/[*_`#>|]/g, "")
        .replace(/^\s*(?:[-•]|\d+[.)])\s*/, "")
        .replace(/\s+/g, " ")
        .replace(/\s*[.!?।]+\s*$/, "")
        .trim();
      if (tags.length > 0 && text.length === 0 && previous) {
        // "…done. [S1]" — a bare tag after the full stop belongs to the sentence before.
        if (previous.claim) previous.claim.tags = [...new Set([...previous.claim.tags, ...tags])];
        else if (previous.text.length >= MIN_CLAIM_CHARS) {
          previous.claim = { claim: previous.text, tags: [...new Set(tags)] };
          claims.push(previous.claim);
        }
        continue;
      }
      const claim = tags.length > 0 && text.length >= MIN_CLAIM_CHARS ? { claim: text, tags: [...new Set(tags)] } : null;
      if (claim) claims.push(claim);
      previous = { text, claim };
    }
  }
  return claims.slice(0, MAX_CLAIMS);
}

/** The judge's user message: cited passages (as data) + numbered statements. */
export function buildSourceCheckInput(claims: Claim[], passages: Map<string, string>): string {
  const cited = [...new Set(claims.flatMap((c) => c.tags))].filter((t) => passages.has(t));
  const passageBlock = cited
    .map((tag) => `[${tag}]\n<document_content>\n${passages.get(tag)}\n</document_content>`)
    .join("\n\n");
  const statements = claims.map((c, i) => `${i + 1}. ${c.claim} (cites ${c.tags.join(", ")})`).join("\n");
  return `PASSAGES:\n${passageBlock}\n\nSTATEMENTS:\n${statements}`;
}
