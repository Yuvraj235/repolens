/** A single source file kept for indexing (post-filter). */
export interface RepoFile {
  path: string; // repo-relative, e.g. "src/index.ts"
  text: string;
  bytes: number;
}

export interface IngestStats {
  owner: string;
  repo: string;
  ref: string;
  indexedFiles: number;
  skippedFiles: number;
  indexedBytes: number;
  truncated: boolean; // hit a size/file cap
}

export interface IngestResult {
  stats: IngestStats;
  files: RepoFile[];
}

export type ChunkKind =
  | "function"
  | "class"
  | "interface"
  | "type"
  | "enum"
  | "method"
  | "preamble"
  | "block"
  | "markup";

/** A structural unit of code — the granularity the engine reasons about. */
export interface Chunk {
  id: string; // stable, e.g. "src/index.ts#3"
  path: string;
  language: string;
  kind: ChunkKind;
  symbol: string | null; // primary declared name, if any
  signature: string; // header line(s), used as the skeleton form
  code: string; // full text
  startLine: number; // 1-based, inclusive
  endLine: number; // 1-based, inclusive
  tokens: number; // estimated tokens for full `code`
  skeletonTokens: number; // estimated tokens for the skeleton form
  symbols: string[]; // symbols this chunk defines (for the reference graph)
}

/** Built once per repo, in the browser, then reused for every question. */
export interface RepoIndex {
  files: RepoFile[];
  chunks: Chunk[];
  byId: Map<string, Chunk>;
  defs: Map<string, string[]>; // symbol name -> chunk ids that define it
  totalTokens: number; // Σ chunk.tokens = the "dump the whole repo" baseline
  bm25: import("./bm25").Bm25Index;
}

export interface SelectedChunk {
  chunk: Chunk;
  score: number;
  included: "full" | "skeleton";
  tokens: number; // tokens actually spent
  reasons: string[]; // human-readable "why this was chosen"
}

/** The explainable output of a single selection pass. */
export interface ContextBundle {
  query: string;
  selected: SelectedChunk[];
  contextText: string; // exactly what gets sent to the model
  usedTokens: number;
  baselineTokens: number; // RepoIndex.totalTokens
  budget: number;
  savedPct: number;
  candidatesConsidered: number;
}

export interface SelectOptions {
  budget?: number; // token budget for the assembled context
  maxFull?: number; // cap on how many chunks are included in full form
}
