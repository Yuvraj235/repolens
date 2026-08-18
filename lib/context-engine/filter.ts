/** Decides which files are worth indexing. Runs on the server during ingest. */

const BINARY_EXT = new Set([
  // images / media
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg", "pdf", "psd",
  "mp4", "webm", "mov", "avi", "mp3", "wav", "flac", "ogg",
  // fonts
  "woff", "woff2", "ttf", "eot", "otf",
  // archives / binaries
  "zip", "gz", "tgz", "tar", "rar", "7z", "bz2", "xz",
  "exe", "dll", "so", "dylib", "bin", "o", "a", "class", "jar", "wasm",
  "pack", "idx", "pyc", "pyd", "node",
  // data blobs
  "csv", "tsv", "parquet", "sqlite", "db", "pdf",
]);

const SKIP_DIR_SEGMENTS = [
  "node_modules", ".git", "dist", "build", ".next", "out", "vendor",
  ".venv", "venv", "__pycache__", ".cache", "coverage", "target",
  "Pods", ".gradle", ".idea", ".vscode", "bower_components", ".turbo",
  "site-packages", "migrations",
];

const SKIP_BASENAMES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "npm-shrinkwrap.json",
  "poetry.lock", "Cargo.lock", "composer.lock", "Gemfile.lock", "go.sum",
  "flake.lock", "bun.lockb",
]);

function ext(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

function looksBinary(text: string): boolean {
  // Sample the first 4KB for NUL bytes / a high control-char ratio.
  const sample = text.slice(0, 4096);
  let control = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i);
    if (c === 0) return true;
    if (c < 9 || (c > 13 && c < 32)) control++;
  }
  return control / (sample.length || 1) > 0.3;
}

function looksMinified(text: string): boolean {
  // Bundled/minified assets are dead weight and blow up token counts.
  const nl = text.indexOf("\n");
  const firstLine = nl === -1 ? text : text.slice(0, nl);
  if (firstLine.length > 2000) return true;
  const lines = text.split("\n");
  if (lines.length > 0 && text.length / lines.length > 400) return true;
  return false;
}

export function shouldIndex(path: string, bytes: number, text: string): boolean {
  if (bytes === 0) return false;
  const segments = path.split("/");
  if (segments.some((s) => SKIP_DIR_SEGMENTS.includes(s))) return false;
  if (SKIP_BASENAMES.has(segments[segments.length - 1])) return false;
  if (BINARY_EXT.has(ext(path))) return false;
  if (looksBinary(text)) return false;
  if (looksMinified(text)) return false;
  if (path.endsWith(".min.js") || path.endsWith(".min.css")) return false;
  return true;
}
