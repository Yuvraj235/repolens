import type { Chunk, SelectedChunk } from "./types";

/**
 * The "compression" half of the engine. When a relevant chunk is too expensive
 * to include in full, we keep its *shape* — the signature plus a marker — so the
 * model still knows the symbol exists and what it looks like, at a fraction of
 * the tokens.
 */
export function buildSkeleton(signature: string, bodyLines: number): string {
  const sig = signature.trimEnd();
  const elided = Math.max(bodyLines - 1, 0);
  if (sig.endsWith("{")) return `${sig}\n  /* … ${elided} lines elided … */\n}`;
  if (sig.endsWith(":")) return `${sig}\n    ...  # ${elided} lines elided`;
  return `${sig}  // … ${elided} lines elided`;
}

/** Skeleton string for an existing chunk. */
export function skeletonOf(chunk: Chunk): string {
  const bodyLines = chunk.endLine - chunk.startLine + 1;
  return buildSkeleton(chunk.signature, bodyLines);
}

/** Render one selected chunk for the model, with a locating header. */
export function renderSelected(sel: SelectedChunk): string {
  const c = sel.chunk;
  const header = `// ${c.path}:${c.startLine}-${c.endLine}${c.symbol ? ` — ${c.symbol}` : ""}`;
  const body = sel.included === "full" ? c.code : skeletonOf(c);
  return `${header}\n${body}`;
}
