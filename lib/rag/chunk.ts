import type { DocumentChunkInput, ExtractedBlock } from "@/types/documents";

// Chunking: ~800 tokens per chunk with ~100 tokens overlap (≈4 chars/token).
// Chunks never cross page/slide boundaries so citation metadata stays exact.

const CHUNK_CHARS = 3200; // ~800 tokens
const OVERLAP_CHARS = 400; // ~100 tokens
const MIN_CHUNK_CHARS = 20; // skip fragments with no real content (a 1-row CSV is still real)

/** Finds a whitespace near `target` to avoid cutting words mid-way. */
function breakpoint(text: string, target: number): number {
  if (target >= text.length) return text.length;
  for (let i = target; i > target - 200 && i > 0; i--) {
    if (/\s/.test(text[i])) return i;
  }
  return target;
}

export function chunkBlocks(blocks: ExtractedBlock[]): DocumentChunkInput[] {
  const chunks: DocumentChunkInput[] = [];
  let chunkIndex = 0;

  for (const block of blocks) {
    // Keep line breaks (code, table rows, lists stay readable in the chunk
    // viewer); only squash runs of spaces and blank-line gaps.
    const text = block.text
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (text.length < MIN_CHUNK_CHARS) continue;

    let start = 0;
    while (start < text.length) {
      const end = breakpoint(text, start + CHUNK_CHARS);
      const content = text.slice(start, end).trim();
      if (content.length >= MIN_CHUNK_CHARS) {
        chunks.push({ content, chunkIndex: chunkIndex++, metadata: block.metadata });
      }
      if (end >= text.length) break;
      // Overlap: next chunk re-reads the tail of this one so sentences that
      // straddle a boundary are fully present in at least one chunk.
      start = Math.max(end - OVERLAP_CHARS, start + 1);
    }
  }
  return chunks;
}
