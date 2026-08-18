import { countTokens } from "../tokens";
import { buildBm25, meaningfulTerms, tokenize } from "./bm25";
import { chunkFile } from "./chunk";
import { renderSelected } from "./compress";
import { referencedDefIds } from "./graph";
import type {
  Chunk,
  ContextBundle,
  RepoFile,
  RepoIndex,
  SelectedChunk,
  SelectOptions,
} from "./types";

export * from "./types";
export const DEFAULT_BUDGET = 6000;

// Boosts are additive on top of the BM25 score (whose useful range is ~0–15).
const SYMBOL_BOOST = 6;
const PATH_BOOST = 2.5;
const KIND_WEIGHT: Partial<Record<Chunk["kind"], number>> = {
  function: 1,
  method: 1,
  class: 0.8,
  interface: 0.6,
  type: 0.4,
  preamble: -0.5, // imports/boilerplate rarely answer a question on their own
  markup: 0.2,
  block: 0,
  enum: 0.3,
};

/** Build the reusable index for a repo. Runs once, in the browser. */
export function buildIndex(files: RepoFile[]): RepoIndex {
  const chunks: Chunk[] = [];
  for (const f of files) chunks.push(...chunkFile(f));

  const byId = new Map<string, Chunk>();
  const defs = new Map<string, string[]>();
  let totalTokens = 0;

  for (const c of chunks) {
    byId.set(c.id, c);
    totalTokens += c.tokens;
    for (const s of c.symbols) {
      const arr = defs.get(s);
      if (arr) arr.push(c.id);
      else defs.set(s, [c.id]);
    }
  }

  // The BM25 document includes the path and symbol so filename/identifier
  // queries rank the right chunks even when the body doesn't repeat the term.
  const bm25 = buildBm25(
    chunks.map((c) => ({ id: c.id, text: `${c.path} ${c.symbol ?? ""} ${c.code}` })),
  );

  return { files, chunks, byId, defs, totalTokens, bm25 };
}

function baseName(path: string): string {
  const b = path.slice(path.lastIndexOf("/") + 1);
  const dot = b.lastIndexOf(".");
  return dot > 0 ? b.slice(0, dot) : b;
}

/**
 * Select and compress the minimal relevant context for a query, and explain
 * every choice. This is the piece the Context Inspector visualizes.
 */
export function selectContext(
  index: RepoIndex,
  query: string,
  opts: SelectOptions = {},
): ContextBundle {
  const budget = opts.budget ?? DEFAULT_BUDGET;
  const maxFull = opts.maxFull ?? 14;
  const qterms = new Set(meaningfulTerms(query));

  const bm25Scores = index.bm25.search(query);

  // Score every chunk = BM25 + symbol/path boosts + a small kind prior.
  interface Ranked {
    chunk: Chunk;
    score: number;
    reasons: string[];
  }
  const ranked: Ranked[] = [];
  for (const chunk of index.chunks) {
    const bm = bm25Scores.get(chunk.id) ?? 0;
    let score = bm;
    const reasons: string[] = [];

    const matched = [...new Set(tokenize(chunk.code))].filter((t) => qterms.has(t));
    if (bm > 0 && matched.length) {
      reasons.push(`lexical match: ${matched.slice(0, 5).join(", ")}`);
    }

    if (chunk.symbol) {
      const symTerms = new Set(tokenize(chunk.symbol));
      const symHit = [...symTerms].some((t) => qterms.has(t));
      if (symHit) {
        score += SYMBOL_BOOST;
        reasons.push(`symbol name match: ${chunk.symbol}`);
      }
    }

    const pathTerms = new Set(tokenize(baseName(chunk.path)));
    const pathHit = [...pathTerms].some((t) => qterms.has(t));
    if (pathHit) {
      score += PATH_BOOST;
      reasons.push(`path match: ${chunk.path}`);
    }

    if (score > 0) {
      score += KIND_WEIGHT[chunk.kind] ?? 0;
      ranked.push({ chunk, score, reasons });
    }
  }

  ranked.sort((a, b) => b.score - a.score);

  const selected: SelectedChunk[] = [];
  const chosen = new Set<string>();
  let used = 0;
  let fullCount = 0;

  for (const r of ranked) {
    if (used >= budget) break;
    const remaining = budget - used;
    let included: "full" | "skeleton" | null = null;
    if (fullCount < maxFull && r.chunk.tokens <= remaining) {
      included = "full";
    } else if (r.chunk.skeletonTokens <= remaining) {
      included = "skeleton";
    }
    if (!included) continue;

    const spent = included === "full" ? r.chunk.tokens : r.chunk.skeletonTokens;
    used += spent;
    if (included === "full") fullCount++;
    chosen.add(r.chunk.id);
    selected.push({
      chunk: r.chunk,
      score: r.score,
      included,
      tokens: spent,
      reasons: included === "skeleton" ? [...r.reasons, "condensed to signature to fit budget"] : r.reasons,
    });
  }

  // One-hop expansion: pull in definitions the full chunks depend on (skeletons).
  let expansions = 0;
  for (const sel of [...selected]) {
    if (sel.included !== "full" || expansions >= 8) continue;
    for (const ref of referencedDefIds(sel.chunk, index.defs)) {
      if (expansions >= 8 || used >= budget) break;
      if (chosen.has(ref.id)) continue;
      const dep = index.byId.get(ref.id);
      if (!dep || dep.skeletonTokens > budget - used) continue;
      used += dep.skeletonTokens;
      chosen.add(dep.id);
      expansions++;
      selected.push({
        chunk: dep,
        score: 0,
        included: "skeleton",
        tokens: dep.skeletonTokens,
        reasons: [`defines \`${ref.symbol}\`, referenced by ${sel.chunk.symbol ?? sel.chunk.path}`],
      });
    }
  }

  const contextText = selected.map(renderSelected).join("\n\n");
  const usedTokens = countTokens(contextText);
  const baselineTokens = index.totalTokens;
  const savedPct =
    baselineTokens > 0 ? Math.max(0, Math.round(((baselineTokens - usedTokens) / baselineTokens) * 100)) : 0;

  return {
    query,
    selected,
    contextText,
    usedTokens,
    baselineTokens,
    budget,
    savedPct,
    candidatesConsidered: ranked.length,
  };
}
