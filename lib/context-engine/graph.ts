import type { Chunk } from "./types";

const IDENTIFIER = /[A-Za-z_$][A-Za-z0-9_$]*/g;

/**
 * One-hop reference expansion. Given a chunk, find the chunks that *define*
 * symbols this chunk uses. This is what lets the engine pull in the definition
 * of a helper a relevant function calls, without dragging in the whole file.
 */
export function referencedDefIds(
  chunk: Chunk,
  defs: Map<string, string[]>,
): { id: string; symbol: string }[] {
  const own = new Set(chunk.symbols);
  const seenIds = new Set<string>();
  const out: { id: string; symbol: string }[] = [];
  const ids = chunk.code.match(IDENTIFIER);
  if (!ids) return out;
  for (const name of new Set(ids)) {
    if (own.has(name)) continue;
    const defIds = defs.get(name);
    if (!defIds) continue;
    for (const id of defIds) {
      if (id === chunk.id || seenIds.has(id)) continue;
      seenIds.add(id);
      out.push({ id, symbol: name });
    }
  }
  return out;
}
