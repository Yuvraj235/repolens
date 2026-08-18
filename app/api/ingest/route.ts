import { parseTarGzip } from "nanotar";
import { shouldIndex } from "@/lib/context-engine/filter";
import type { IngestResult, RepoFile } from "@/lib/context-engine/types";
import { CAPS, parseRepoInput, tarballUrl } from "@/lib/github";

export const runtime = "nodejs";
export const maxDuration = 60;

function ghHeaders(): HeadersInit {
  const h: Record<string, string> = { "User-Agent": "repolens" };
  const token = process.env.GITHUB_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function resolveRef(owner: string, repo: string): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: ghHeaders(),
  });
  if (res.status === 404) throw new HttpError(404, "Repository not found (is it public?).");
  if (res.status === 403) throw new HttpError(429, "GitHub rate limit hit. Try again shortly, or set GITHUB_TOKEN.");
  if (!res.ok) throw new HttpError(502, `Could not reach GitHub (${res.status}).`);
  const data = (await res.json()) as { default_branch?: string };
  return data.default_branch || "main";
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Strip the "<repo>-<ref>/" prefix GitHub adds to every path in the archive. */
function stripTopLevel(name: string): string {
  const slash = name.indexOf("/");
  return slash === -1 ? name : name.slice(slash + 1);
}

export async function POST(req: Request): Promise<Response> {
  try {
    const { repoUrl } = (await req.json()) as { repoUrl?: string };
    const parsed = parseRepoInput(repoUrl ?? "");
    if (!parsed) {
      return Response.json(
        { error: "Enter a GitHub repo like https://github.com/owner/repo or owner/repo." },
        { status: 400 },
      );
    }

    const ref = parsed.ref ?? (await resolveRef(parsed.owner, parsed.repo));
    const url = tarballUrl(parsed.owner, parsed.repo, ref);
    const res = await fetch(url, { headers: ghHeaders(), redirect: "follow" });
    if (res.status === 404) {
      return Response.json({ error: `Branch/ref "${ref}" not found.` }, { status: 404 });
    }
    if (!res.ok) {
      return Response.json({ error: `Failed to download repo archive (${res.status}).` }, { status: 502 });
    }

    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > CAPS.MAX_DOWNLOAD_BYTES) {
      return Response.json(
        { error: "Repository archive is too large to index in the browser demo." },
        { status: 413 },
      );
    }

    const entries = await parseTarGzip(buf, {
      filter: (f) => f.type === "file",
    });

    const files: RepoFile[] = [];
    let skipped = 0;
    let indexedBytes = 0;
    let truncated = false;

    for (const entry of entries) {
      if (entry.type !== "file") continue;
      const path = stripTopLevel(entry.name);
      const bytes = entry.size ?? entry.data?.length ?? 0;
      if (!path) continue;

      if (bytes > CAPS.MAX_FILE_BYTES) {
        skipped++;
        continue;
      }
      const text = entry.text;
      if (!shouldIndex(path, bytes, text)) {
        skipped++;
        continue;
      }
      if (files.length >= CAPS.MAX_FILES || indexedBytes + bytes > CAPS.MAX_TOTAL_BYTES) {
        truncated = true;
        break;
      }
      files.push({ path, text, bytes });
      indexedBytes += bytes;
    }

    files.sort((a, b) => a.path.localeCompare(b.path));

    const result: IngestResult = {
      stats: {
        owner: parsed.owner,
        repo: parsed.repo,
        ref,
        indexedFiles: files.length,
        skippedFiles: skipped,
        indexedBytes,
        truncated,
      },
      files,
    };
    return Response.json(result);
  } catch (err) {
    if (err instanceof HttpError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Unexpected error during ingest.";
    return Response.json({ error: message }, { status: 500 });
  }
}
