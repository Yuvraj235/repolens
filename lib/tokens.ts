import { encode } from "gpt-tokenizer";

/**
 * Token counting.
 *
 * We use gpt-tokenizer (o200k_base) as a *proxy* for Grok's tokenizer, which
 * xAI does not publish. The absolute numbers are therefore estimates, but the
 * ratio between "naive full-repo dump" and "engine-selected context" — which is
 * the number this product is actually about — is consistent because both sides
 * are measured the same way.
 */
export function countTokens(text: string): number {
  if (!text) return 0;
  try {
    return encode(text).length;
  } catch {
    // Extremely rare (encoder edge cases). Fall back to a coarse heuristic.
    return Math.ceil(text.length / 4);
  }
}
