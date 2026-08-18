import { countTokens } from "../tokens";
import { buildSkeleton } from "./compress";
import { languageLabel, specFor, type BoundaryRule, type LanguageSpec } from "./languages";
import type { Chunk, ChunkKind, RepoFile } from "./types";

const FALLBACK_WINDOW = 50; // lines per chunk when a file has no detected structure
const MIN_CHUNK_CHARS = 2; // drop whitespace-only slices

interface Boundary {
  line: number; // 0-based
  symbol: string;
  kind: ChunkKind;
}

function leadingIndent(line: string): number {
  let n = 0;
  while (n < line.length && (line[n] === " " || line[n] === "\t")) n++;
  return n;
}

function matchBoundary(rules: BoundaryRule[], trimmed: string): { symbol: string; kind: ChunkKind } | null {
  for (const rule of rules) {
    const m = rule.re.exec(trimmed);
    if (m) return { symbol: (m[1] ?? "").trim() || "(anonymous)", kind: rule.kind };
  }
  return null;
}

function findBoundaries(lines: string[], spec: LanguageSpec): Boundary[] {
  const out: Boundary[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (leadingIndent(line) > spec.maxIndent) continue;
    const hit = matchBoundary(spec.boundaries, line.trim());
    if (hit) out.push({ line: i, symbol: hit.symbol, kind: hit.kind });
  }
  return out;
}

/** Grab the declaration header — one line, or a few if the signature wraps. */
function extractSignature(lines: string[], start: number): string {
  const parts: string[] = [];
  for (let i = start; i < Math.min(start + 4, lines.length); i++) {
    const t = lines[i].trim();
    parts.push(t);
    if (/[{:]\s*$/.test(t) || t.includes("=>") || t.endsWith(";") || /\)\s*$/.test(t)) break;
  }
  return parts.join(" ").replace(/\s+/g, " ").slice(0, 240);
}

function firstMeaningfulLine(lines: string[], start: number, end: number): string {
  for (let i = start; i <= end; i++) {
    const t = lines[i].trim();
    if (t) return t.slice(0, 200);
  }
  return "";
}

function makeChunk(
  file: RepoFile,
  language: string,
  index: number,
  startLine0: number,
  endLine0: number,
  symbol: string | null,
  kind: ChunkKind,
  signature: string,
): Chunk | null {
  const lines = file.text.split("\n");
  const code = lines.slice(startLine0, endLine0 + 1).join("\n");
  if (code.trim().length < MIN_CHUNK_CHARS) return null;
  const bodyLines = endLine0 - startLine0 + 1;
  const tokens = countTokens(code);
  const skeletonTokens = countTokens(buildSkeleton(signature, bodyLines));
  return {
    id: `${file.path}#${index}`,
    path: file.path,
    language,
    kind,
    symbol,
    signature,
    code,
    startLine: startLine0 + 1,
    endLine: endLine0 + 1,
    tokens,
    // A skeleton is only worth it if it's actually cheaper than the full body.
    skeletonTokens: Math.min(skeletonTokens, tokens),
    symbols: symbol && symbol !== "(anonymous)" ? [symbol] : [],
  };
}

export function chunkFile(file: RepoFile): Chunk[] {
  const lines = file.text.split("\n");
  const language = languageLabel(file.path);
  const spec = specFor(file.path);
  const chunks: Chunk[] = [];
  let idx = 0;

  const push = (
    s0: number,
    e0: number,
    symbol: string | null,
    kind: ChunkKind,
    signature: string,
  ) => {
    const c = makeChunk(file, language, idx, s0, e0, symbol, kind, signature);
    if (c) {
      chunks.push(c);
      idx++;
    }
  };

  const boundaries = spec ? findBoundaries(lines, spec) : [];

  if (boundaries.length === 0) {
    // No detectable structure: fixed windows. Keeps every line reachable.
    for (let s = 0; s < lines.length; s += FALLBACK_WINDOW) {
      const e = Math.min(s + FALLBACK_WINDOW - 1, lines.length - 1);
      push(s, e, null, "block", firstMeaningfulLine(lines, s, e));
    }
    return chunks;
  }

  // Preamble: everything before the first declaration (imports, top-of-file docs).
  if (boundaries[0].line > 0) {
    push(0, boundaries[0].line - 1, null, "preamble", firstMeaningfulLine(lines, 0, boundaries[0].line - 1));
  }

  for (let b = 0; b < boundaries.length; b++) {
    const start = boundaries[b].line;
    const end = b + 1 < boundaries.length ? boundaries[b + 1].line - 1 : lines.length - 1;
    push(start, end, boundaries[b].symbol, boundaries[b].kind, extractSignature(lines, start));
  }

  return chunks;
}
