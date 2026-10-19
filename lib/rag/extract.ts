import JSZip from "jszip";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import WordExtractor from "word-extractor";
import { CODE_FILE_EXTENSIONS } from "@/lib/validators/documents";
import type { ExtractedBlock } from "@/types/documents";

// Text extraction per file type. Returns blocks with provenance (page, slide,
// sheet + row range, heading, code path) so citations point at a real
// location. SERVER-ONLY (Node APIs).

const SHEET_BLOCK_CHARS = 3000; // keep a sheet block ≈ one chunk
const MAX_SHEET_ROWS = 5000; // free-tier discipline: very large sheets are capped

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'");
}

async function extractPdf(buffer: Buffer): Promise<ExtractedBlock[]> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.pages.map((page) => ({
      text: page.text,
      metadata: { page: page.num },
    }));
  } finally {
    await parser.destroy();
  }
}

/** DOCX → one block per heading section so citations can name the heading. */
async function extractDocx(buffer: Buffer): Promise<ExtractedBlock[]> {
  const { value: html } = await mammoth.convertToHtml({ buffer });
  const blocks: ExtractedBlock[] = [];
  // Split right before every h1–h3; the first part is any preamble.
  for (const part of html.split(/(?=<h[1-3][^>]*>)/i)) {
    const heading = part.match(/^<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i)?.[1];
    const text = decodeXmlEntities(
      part
        .replace(/<\/(p|li|h[1-6]|tr)>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
    ).trim();
    if (!text) continue;
    const cleanHeading = heading ? decodeXmlEntities(heading.replace(/<[^>]+>/g, "")).trim() : undefined;
    blocks.push({ text, metadata: cleanHeading ? { heading: cleanHeading.slice(0, 120) } : {} });
  }
  return blocks;
}

/** Legacy binary .doc (OLE) — no headings available, one block. */
async function extractDoc(buffer: Buffer): Promise<ExtractedBlock[]> {
  const doc = await new WordExtractor().extract(buffer);
  return [{ text: doc.getBody(), metadata: {} }];
}

async function extractPptx(buffer: Buffer): Promise<ExtractedBlock[]> {
  const zip = await JSZip.loadAsync(buffer);
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const num = (n: string) => parseInt(n.match(/slide(\d+)\.xml$/)?.[1] ?? "0", 10);
      return num(a) - num(b);
    });

  const blocks: ExtractedBlock[] = [];
  for (let i = 0; i < slideNames.length; i++) {
    const xml = await zip.file(slideNames[i])!.async("string");
    // Text runs in PPTX XML live inside <a:t> elements.
    const texts = Array.from(xml.matchAll(/<a:t>([^<]*)<\/a:t>/g), (m) =>
      decodeXmlEntities(m[1])
    );
    blocks.push({ text: texts.join("\n"), metadata: { slide: i + 1 } });
  }
  return blocks;
}

/**
 * XLSX / XLS / CSV via SheetJS. Every data row becomes a labelled line —
 * "Sheet: Sales | Region: North | Q1: 1200" — so numbers keep their meaning
 * after chunking. Rows are grouped into ~chunk-sized blocks carrying the sheet
 * name + row range for citations ("Budget.xlsx — Sheet: Q1, rows 12–40").
 */
function extractSpreadsheet(buffer: Buffer, fileType: string): ExtractedBlock[] {
  const workbook =
    fileType === "csv"
      ? XLSX.read(buffer.toString("utf8"), { type: "string", raw: true })
      : XLSX.read(buffer, { type: "buffer" });

  const blocks: ExtractedBlock[] = [];
  let totalRows = 0;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !sheet["!ref"]) continue;
    const firstRow = XLSX.utils.decode_range(sheet["!ref"]).s.r; // 0-based
    const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
      header: 1,
      raw: false,
      blankrows: true,
      defval: null,
    });

    const headerIndex = rows.findIndex((r) => r.some((c) => c !== null && String(c).trim() !== ""));
    if (headerIndex === -1) continue;
    const headers = rows[headerIndex].map((h, i) => (h === null || String(h).trim() === "" ? `Column ${i + 1}` : String(h).trim()));
    const label = fileType === "csv" ? "" : `Sheet: ${sheetName} | `;

    let lines: string[] = [];
    let blockStart = -1;
    let blockEnd = -1;
    const flush = () => {
      if (lines.length === 0) return;
      blocks.push({
        text: lines.join("\n"),
        metadata: {
          ...(fileType === "csv" ? {} : { sheet: sheetName }),
          rows: blockStart === blockEnd ? `${blockStart}` : `${blockStart}–${blockEnd}`,
        },
      });
      lines = [];
    };

    for (let i = headerIndex + 1; i < rows.length; i++) {
      if (totalRows >= MAX_SHEET_ROWS) break;
      const row = rows[i];
      const cells = headers
        .map((h, c) => {
          const v = row[c];
          return v === null || v === undefined || String(v).trim() === "" ? null : `${h}: ${String(v).trim()}`;
        })
        .filter((x): x is string => x !== null);
      if (cells.length === 0) continue;
      const rowNumber = firstRow + i + 1; // 1-based like Excel
      const line = `${label}Row ${rowNumber} | ${cells.join(" | ")}`;
      if (lines.length > 0 && lines.join("\n").length + line.length > SHEET_BLOCK_CHARS) flush();
      if (lines.length === 0) blockStart = rowNumber;
      blockEnd = rowNumber;
      lines.push(line);
      totalRows++;
    }
    flush();
  }
  return blocks;
}

const LANGUAGE_BY_EXT: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  java: "java",
  sql: "sql",
};

export async function extractText(
  buffer: Buffer,
  fileType: string,
  fileName = ""
): Promise<ExtractedBlock[]> {
  let blocks: ExtractedBlock[];
  switch (fileType) {
    case "pdf":
      blocks = await extractPdf(buffer);
      break;
    case "docx":
      blocks = await extractDocx(buffer);
      break;
    case "doc":
      blocks = await extractDoc(buffer);
      break;
    case "pptx":
      blocks = await extractPptx(buffer);
      break;
    case "xlsx":
    case "xls":
    case "csv":
      blocks = extractSpreadsheet(buffer, fileType);
      break;
    case "json": {
      // Re-indent so keys and values stay together after chunking.
      const raw = buffer.toString("utf8");
      let text = raw;
      try {
        text = JSON.stringify(JSON.parse(raw), null, 2);
      } catch {
        // invalid JSON — index as plain text
      }
      blocks = [{ text, metadata: { language: "json" } }];
      break;
    }
    case "txt":
    case "md":
      blocks = [{ text: buffer.toString("utf8"), metadata: {} }];
      break;
    default:
      if ((CODE_FILE_EXTENSIONS as readonly string[]).includes(fileType)) {
        blocks = [
          {
            text: buffer.toString("utf8"),
            metadata: { language: LANGUAGE_BY_EXT[fileType], ...(fileName ? { path: fileName } : {}) },
          },
        ];
        break;
      }
      throw new Error(`Unsupported file type: ${fileType}`);
  }

  const nonEmpty = blocks.filter((b) => b.text.trim().length > 0);
  if (nonEmpty.length === 0) {
    throw new Error("No readable text found in this file");
  }
  return nonEmpty;
}
