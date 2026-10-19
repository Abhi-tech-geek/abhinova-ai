import { lookup } from "node:dns";
import { isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";
import type { NormalizedDoc } from "@/types/connectors";
import type { ExtractedBlock } from "@/types/documents";

// URL → readable text, SSRF-guarded. SERVER-ONLY.
// Defense layers:
//  1. Only http(s), no credentials in the URL, default ports only.
//  2. The IP check runs INSIDE the socket's DNS lookup, so the address we
//     validate is the address we connect to (no DNS-rebinding TOCTOU).
//  3. Redirects are followed manually (max 3) and every hop is re-checked.
//  4. Timeout + response size cap; only text/html / text/plain / markdown.
// Never fetch a URL derived from model output without going through here.

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 2 * 1024 * 1024;

export class UnsafeUrlError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "UnsafeUrlError";
  }
}

/** True for loopback, private, link-local, CGNAT, multicast, reserved ranges. */
export function isBlockedIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b, c] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) || // link-local + cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) || // IETF + TEST-NET-1
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224 // multicast + reserved
    );
  }
  if (v === 6) {
    const h = expandIpv6(ip);
    if (!h) return true;
    const embeddedV4 = (hi: number, lo: number) =>
      `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
    const zeros = (n: number) => h.slice(0, n).every((x) => x === 0);

    // Forms that carry an IPv4 address — judge by the embedded IPv4.
    if (zeros(5) && h[5] === 0xffff) return isBlockedIp(embeddedV4(h[6], h[7])); // ::ffff:0:0/96 mapped
    if (zeros(6)) return h[6] === 0 && h[7] <= 1 ? true : isBlockedIp(embeddedV4(h[6], h[7])); // ::/128, ::1, ::/96 compat
    if (zeros(4) && h[4] === 0xffff && h[5] === 0) return isBlockedIp(embeddedV4(h[6], h[7])); // ::ffff:0:0:0/96 translated
    if (h[0] === 0x64 && h[1] === 0xff9b) return true; // NAT64 64:ff9b::/96 + 64:ff9b:1::/48
    if (h[0] === 0x2002) return isBlockedIp(embeddedV4(h[1], h[2])); // 6to4 2002::/16
    if (h[0] === 0x2001 && h[1] === 0) return true; // Teredo 2001::/32 (tunnels to arbitrary IPv4)
    if (h[0] === 0x2001 && h[1] === 0xdb8) return true; // documentation

    return (
      (h[0] & 0xffc0) === 0xfe80 || // link-local fe80::/10
      (h[0] & 0xffc0) === 0xfec0 || // deprecated site-local fec0::/10
      (h[0] & 0xfe00) === 0xfc00 || // unique-local fc00::/7
      (h[0] & 0xff00) === 0xff00 || // multicast ff00::/8
      h[0] === 0x0100 // discard-only 100::/64
    );
  }
  return true; // not an IP at all → refuse
}

/** Expand any valid IPv6 text form (incl. "::" and trailing dotted IPv4) to 8 hextets. */
function expandIpv6(ip: string): number[] | null {
  let s = ip.toLowerCase().split("%")[0];
  const dotted = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const parts = dotted[2].split(".").map(Number);
    if (parts.some((p) => p > 255)) return null;
    s = `${dotted[1]}${((parts[0] << 8) | parts[1]).toString(16)}:${((parts[2] << 8) | parts[3]).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string) => (part === "" ? [] : part.split(":").map((x) => parseInt(x, 16)));
  const head = parse(halves[0]);
  const tail = halves.length === 2 ? parse(halves[1]) : [];
  const fill = 8 - head.length - tail.length;
  if (halves.length === 1 ? head.length !== 8 : fill < 1) return null;
  const out = [...head, ...Array(halves.length === 2 ? fill : 0).fill(0), ...tail];
  return out.length === 8 && out.every((x) => Number.isInteger(x) && x >= 0 && x <= 0xffff) ? out : null;
}

/** Static checks that need no network. */
export function assertSafeUrlShape(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("That doesn't look like a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only http(s) links are allowed.");
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("Links with embedded credentials are not allowed.");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new UnsafeUrlError("Only standard web ports (80/443) are allowed.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new UnsafeUrlError("Internal addresses are not allowed.");
  }
  // IP-literal hosts never pass through the agent's DNS lookup, so this is
  // the ONLY check they get. IPv6 literals are refused outright (public sites
  // use hostnames); IPv4 literals must be public.
  if (isIP(host) === 6) {
    throw new UnsafeUrlError("Raw IPv6 addresses are not allowed — use the site's hostname.");
  }
  if (isIP(host) && isBlockedIp(host)) {
    throw new UnsafeUrlError("Private or internal IP addresses are not allowed.");
  }
  return url;
}

// Socket-level guard: every connection's resolved addresses are validated.
const guardedAgent = new Agent({
  connect: {
    lookup(hostname, options, callback) {
      // Resolve ALL addresses so none can be private, then answer in the shape
      // the caller asked for (array when options.all, else address + family).
      lookup(hostname, { ...options, all: true }, (err, addresses) => {
        const list = Array.isArray(addresses) ? addresses : [];
        if (err) return (callback as (e: Error) => void)(err);
        if (list.length === 0 || list.some((a) => isBlockedIp(a.address))) {
          return (callback as (e: Error) => void)(
            new UnsafeUrlError("This link resolves to a private/internal address.")
          );
        }
        if ((options as { all?: boolean }).all) {
          (callback as (e: null, a: typeof list) => void)(null, list);
        } else {
          (callback as (e: null, a: string, f: number) => void)(null, list[0].address, list[0].family);
        }
      });
    },
  },
});

/**
 * undici wraps everything as "fetch failed" — surface the real reason (our
 * SSRF block, timeout, DNS) as a message the user can act on.
 */
function friendlyFetchError(e: unknown): Error {
  const cause = (e as { cause?: unknown })?.cause;
  if (e instanceof UnsafeUrlError) return e;
  if (cause instanceof UnsafeUrlError) return cause;
  if ((e as Error)?.name === "AbortError") return new Error("The page took too long to respond (10s limit).");
  const code = (cause as { code?: string } | undefined)?.code;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return new Error("Couldn't find that website — check the link.");
  if (code === "ECONNREFUSED" || code === "ECONNRESET") return new Error("The website refused the connection.");
  if (code?.startsWith("CERT_") || code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") {
    return new Error("The website's security certificate isn't valid.");
  }
  return new Error("Couldn't reach that page.");
}

/** Fetches a page body as text with every SSRF guard applied. */
export async function safeFetchText(raw: string): Promise<{ finalUrl: string; contentType: string; body: string }> {
  let url = assertSafeUrlShape(raw);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await undiciFetch(url, {
        dispatcher: guardedAgent,
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "AbhiNovaBot/1.0 (+knowledge import)", Accept: "text/html,text/plain,text/markdown" },
      }).catch((e: unknown) => {
        throw friendlyFetchError(e);
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) throw new UnsafeUrlError("Redirect without a destination.");
        url = assertSafeUrlShape(new URL(location, url).toString());
        continue;
      }
      if (!res.ok || !res.body) throw new Error(`The page returned status ${res.status}.`);

      const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
      if (!/text\/html|text\/plain|text\/markdown|application\/xhtml/.test(contentType)) {
        throw new UnsafeUrlError("Only web pages and plain-text links can be imported.");
      }

      const declared = Number(res.headers.get("content-length") ?? 0);
      if (declared > MAX_BYTES) throw new Error("That page is too large to import (2MB max).");

      // Stream with a hard byte cap (content-length can lie).
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BYTES) {
          await reader.cancel();
          throw new Error("That page is too large to import (2MB max).");
        }
        chunks.push(value);
      }
      return {
        finalUrl: url.toString(),
        contentType,
        body: Buffer.concat(chunks).toString("utf8"),
      };
    }
    throw new UnsafeUrlError("Too many redirects.");
  } finally {
    clearTimeout(timer);
  }
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));
}

/**
 * Lightweight readability: drop chrome (scripts, nav, footer…), prefer
 * <main>/<article>, then split by headings so citations can name a section.
 */
export function htmlToBlocks(html: string): { title: string; blocks: ExtractedBlock[] } {
  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "");
  let body = html
    .replace(/<(script|style|noscript|svg|nav|footer|header|aside|form|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const main = body.match(/<(main|article)[^>]*>([\s\S]*?)<\/\1>/i)?.[2];
  if (main && main.length > 500) body = main;

  const blocks: ExtractedBlock[] = [];
  for (const part of body.split(/(?=<h[1-3][^>]*>)/i)) {
    const heading = part.match(/^<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i)?.[1];
    const text = decodeEntities(
      part
        .replace(/<\/(p|li|h[1-6]|tr|div|section|pre|blockquote)>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
    )
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n+/g, "\n\n")
      .trim();
    if (text.length < 20) continue;
    const cleanHeading = heading ? decodeEntities(heading.replace(/<[^>]+>/g, "")).trim() : "";
    blocks.push({ text, metadata: cleanHeading ? { heading: cleanHeading.slice(0, 120) } : {} });
  }
  return { title, blocks };
}

/** URL source adapter → one NormalizedDoc for the shared pipeline. */
export async function fetchUrlDocument(url: string): Promise<NormalizedDoc> {
  const { finalUrl, contentType, body } = await safeFetchText(url);
  if (contentType.includes("html") || contentType.includes("xhtml")) {
    const { title, blocks } = htmlToBlocks(body);
    if (blocks.length === 0) throw new Error("No readable text found on that page.");
    return {
      title: (title || new URL(finalUrl).hostname).slice(0, 200),
      text: blocks.map((b) => b.text).join("\n\n"),
      blocks,
      sourceUrl: finalUrl,
      sourceType: "url",
      externalId: finalUrl,
      metadata: {},
    };
  }
  return {
    title: new URL(finalUrl).pathname.split("/").pop() || new URL(finalUrl).hostname,
    text: body,
    sourceUrl: finalUrl,
    sourceType: "url",
    externalId: finalUrl,
    metadata: {},
  };
}
