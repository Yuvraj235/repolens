// Function words + a few generic ones that only add noise to code search.
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "is", "are",
  "was", "were", "be", "been", "being", "this", "that", "these", "those", "it", "its",
  "as", "at", "by", "from", "how", "does", "do", "did", "what", "where", "when", "which",
  "who", "why", "can", "could", "should", "would", "will", "my", "me", "you", "your",
  "we", "our", "they", "their", "if", "then", "else", "so", "not", "yes", "use", "used",
  "using", "work", "works", "end", "into", "about", "there", "here",
]);

// 4-char prefix stem — a crude but effective substitute for a real stemmer.
// It lets a query for "authentication" reach code that only says "auth".
function stem(token: string): string | null {
  return token.length > 4 ? token.slice(0, 4) : null;
}

/**
 * Code-aware tokenizer: splits identifiers on camelCase, snake_case and digit
 * boundaries, keeps both the whole identifier and its parts, and adds a prefix
 * stem for longer tokens. So "getUserById" yields get/user/by/id (+ stems) and
 * a query for "user" matches `getUserById` and `user_repository`.
 */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  const words = text.match(/[A-Za-z0-9]+/g);
  if (!words) return out;
  const add = (t: string) => {
    out.push(t);
    const s = stem(t);
    if (s) out.push(s);
  };
  for (const w of words) {
    const lw = w.toLowerCase();
    add(lw);
    const parts = w.split(/(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Za-z])(?=[0-9])|(?<=[0-9])(?=[A-Za-z])/);
    if (parts.length > 1) {
      for (const p of parts) {
        const lp = p.toLowerCase();
        if (lp && lp !== lw) add(lp);
      }
    }
  }
  return out;
}

/** Query-side terms: drop stopwords and 1-char noise so weak words don't rank. */
export function meaningfulTerms(text: string): string[] {
  return tokenize(text).filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

export interface Bm25Index {
  /** query -> Map(docId -> score). Only matching docs are present. */
  search(query: string): Map<string, number>;
}

interface Doc {
  id: string;
  text: string;
}

export function buildBm25(docs: Doc[]): Bm25Index {
  const k1 = 1.5;
  const b = 0.75;
  const postings = new Map<string, Map<string, number>>(); // term -> (docId -> tf)
  const docLen = new Map<string, number>();
  let totalLen = 0;

  for (const d of docs) {
    const terms = tokenize(d.text);
    docLen.set(d.id, terms.length);
    totalLen += terms.length;
    const tf = new Map<string, number>();
    for (const t of terms) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const [t, f] of tf) {
      let m = postings.get(t);
      if (!m) {
        m = new Map();
        postings.set(t, m);
      }
      m.set(d.id, f);
    }
  }

  const N = docs.length;
  const avgdl = totalLen / (N || 1);
  const idf = new Map<string, number>();
  for (const [t, m] of postings) {
    const df = m.size;
    idf.set(t, Math.log(1 + (N - df + 0.5) / (df + 0.5)));
  }

  return {
    search(query: string): Map<string, number> {
      const scores = new Map<string, number>();
      const qterms = new Set(meaningfulTerms(query));
      for (const t of qterms) {
        const m = postings.get(t);
        if (!m) continue;
        const termIdf = idf.get(t) ?? 0;
        for (const [docId, f] of m) {
          const dl = docLen.get(docId) ?? 0;
          const denom = f + k1 * (1 - b + (b * dl) / (avgdl || 1));
          const contribution = (termIdf * (f * (k1 + 1))) / (denom || 1);
          scores.set(docId, (scores.get(docId) ?? 0) + contribution);
        }
      }
      return scores;
    },
  };
}
