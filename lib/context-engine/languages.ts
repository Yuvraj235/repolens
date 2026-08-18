import type { ChunkKind } from "./types";

/**
 * Lightweight, regex-based structural detection.
 *
 * This is deliberately *not* a full parser. A real product would use
 * tree-sitter (noted in the write-up as the upgrade path); for a browser-side
 * v1 we get ~90% of the value — chunking code at symbol boundaries — with none
 * of the WASM/cold-start weight. Rules are matched against the trimmed line and
 * gated by indentation so we only split at top-level (or, for Python-like
 * languages, one level deep) declarations.
 */
export interface BoundaryRule {
  re: RegExp; // capture group 1 = symbol name
  kind: ChunkKind;
}

export interface LanguageSpec {
  name: string;
  boundaries: BoundaryRule[];
  maxIndent: number; // treat as a boundary only if leading whitespace <= this
}

const JS: LanguageSpec = {
  name: "javascript",
  maxIndent: 0,
  boundaries: [
    { re: /^export\s+default\s+(?:async\s+)?function\*?\s*([A-Za-z0-9_$]*)/, kind: "function" },
    { re: /^(?:export\s+)?(?:async\s+)?function\*?\s+([A-Za-z0-9_$]+)/, kind: "function" },
    { re: /^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z0-9_$]+)/, kind: "class" },
    { re: /^(?:export\s+)?interface\s+([A-Za-z0-9_$]+)/, kind: "interface" },
    { re: /^(?:export\s+)?type\s+([A-Za-z0-9_$]+)\s*=/, kind: "type" },
    { re: /^(?:export\s+)?(?:const\s+)?enum\s+([A-Za-z0-9_$]+)/, kind: "enum" },
    {
      re: /^(?:export\s+)?(?:default\s+)?(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*(?::\s*[^=]+)?=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*(?::[^=]+)?=>|[A-Za-z0-9_$]+\s*=>)/,
      kind: "function",
    },
  ],
};

const PYTHON: LanguageSpec = {
  name: "python",
  maxIndent: 4,
  boundaries: [
    { re: /^class\s+([A-Za-z0-9_]+)/, kind: "class" },
    { re: /^(?:async\s+)?def\s+([A-Za-z0-9_]+)/, kind: "function" },
  ],
};

const GO: LanguageSpec = {
  name: "go",
  maxIndent: 0,
  boundaries: [
    { re: /^func\s+(?:\([^)]*\)\s*)?([A-Za-z0-9_]+)/, kind: "function" },
    { re: /^type\s+([A-Za-z0-9_]+)\s+(?:struct|interface)\b/, kind: "type" },
  ],
};

const RUST: LanguageSpec = {
  name: "rust",
  maxIndent: 0,
  boundaries: [
    { re: /^(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z0-9_]+)/, kind: "function" },
    { re: /^(?:pub\s+)?(?:struct|enum|trait)\s+([A-Za-z0-9_]+)/, kind: "class" },
    { re: /^impl(?:<[^>]*>)?\s+(?:[A-Za-z0-9_:<>]+\s+for\s+)?([A-Za-z0-9_]+)/, kind: "class" },
  ],
};

const JVM: LanguageSpec = {
  name: "jvm",
  maxIndent: 0,
  boundaries: [
    {
      re: /^(?:(?:public|private|protected|internal|final|abstract|sealed|static|open|data)\s+)*(?:class|interface|enum|record|object)\s+([A-Za-z0-9_]+)/,
      kind: "class",
    },
  ],
};

const CLIKE: LanguageSpec = {
  name: "clike",
  maxIndent: 0,
  boundaries: [
    { re: /^(?:struct|class|enum|namespace)\s+([A-Za-z0-9_]+)/, kind: "class" },
    { re: /^[A-Za-z_][\w\s\*&:<>,]*?\b([A-Za-z_]\w*)\s*\([^;{]*\)\s*(?:const\s*)?\{?\s*$/, kind: "function" },
  ],
};

const RUBY: LanguageSpec = {
  name: "ruby",
  maxIndent: 4,
  boundaries: [
    { re: /^(?:class|module)\s+([A-Za-z0-9_:]+)/, kind: "class" },
    { re: /^def\s+([A-Za-z0-9_:.?!]+)/, kind: "function" },
  ],
};

const PHP: LanguageSpec = {
  name: "php",
  maxIndent: 4,
  boundaries: [
    { re: /^(?:abstract\s+|final\s+)*(?:class|interface|trait)\s+([A-Za-z0-9_]+)/, kind: "class" },
    { re: /^(?:(?:public|private|protected|static|final)\s+)*function\s+([A-Za-z0-9_]+)/, kind: "function" },
  ],
};

const MARKDOWN: LanguageSpec = {
  name: "markdown",
  maxIndent: 0,
  boundaries: [{ re: /^#{1,6}\s+(.+?)\s*#*$/, kind: "markup" }],
};

const BY_EXT: Record<string, LanguageSpec> = {
  ts: JS, tsx: JS, js: JS, jsx: JS, mjs: JS, cjs: JS, mts: JS, cts: JS,
  py: PYTHON, pyi: PYTHON,
  go: GO,
  rs: RUST,
  java: JVM, kt: JVM, kts: JVM, scala: JVM,
  c: CLIKE, h: CLIKE, cc: CLIKE, cpp: CLIKE, cxx: CLIKE, hpp: CLIKE, hxx: CLIKE, m: CLIKE, mm: CLIKE,
  rb: RUBY,
  php: PHP,
  md: MARKDOWN, mdx: MARKDOWN, markdown: MARKDOWN,
};

/** Human-facing language label, even for files we chunk by fixed windows. */
const LABEL_BY_EXT: Record<string, string> = {
  ts: "TypeScript", tsx: "TSX", js: "JavaScript", jsx: "JSX", mjs: "JavaScript",
  cjs: "JavaScript", mts: "TypeScript", cts: "TypeScript",
  py: "Python", pyi: "Python", go: "Go", rs: "Rust", java: "Java", kt: "Kotlin",
  scala: "Scala", c: "C", h: "C", cc: "C++", cpp: "C++", cxx: "C++", hpp: "C++",
  rb: "Ruby", php: "PHP", md: "Markdown", mdx: "MDX", json: "JSON", yaml: "YAML",
  yml: "YAML", toml: "TOML", css: "CSS", scss: "SCSS", html: "HTML", sh: "Shell",
  sql: "SQL", vue: "Vue", svelte: "Svelte",
};

export function extOf(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export function specFor(path: string): LanguageSpec | null {
  return BY_EXT[extOf(path)] ?? null;
}

export function languageLabel(path: string): string {
  const e = extOf(path);
  return LABEL_BY_EXT[e] ?? (e ? e.toUpperCase() : "text");
}
