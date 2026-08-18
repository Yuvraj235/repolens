"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Chat, type ChatMessage } from "@/components/Chat";
import { CodeViewer, type ViewerTarget } from "@/components/CodeViewer";
import { ContextInspector } from "@/components/ContextInspector";
import { FileList } from "@/components/FileList";
import {
  buildIndex,
  DEFAULT_BUDGET,
  selectContext,
  type Chunk,
  type ContextBundle,
  type IngestStats,
  type RepoFile,
  type RepoIndex,
} from "@/lib/context-engine";
import { DEMO_QUESTIONS, DEMO_REPO } from "@/lib/demo-repo";

type Phase = "landing" | "loading" | "ready";

function fmt(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
  return String(n);
}

function updateLast(msgs: ChatMessage[], patch: Partial<ChatMessage>): ChatMessage[] {
  if (msgs.length === 0) return msgs;
  const copy = msgs.slice();
  copy[copy.length - 1] = { ...copy[copy.length - 1], ...patch };
  return copy;
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("landing");
  const [loadingLabel, setLoadingLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [repoInput, setRepoInput] = useState("");

  const [index, setIndex] = useState<RepoIndex | null>(null);
  const [stats, setStats] = useState<IngestStats | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [bundle, setBundle] = useState<ContextBundle | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [budget, setBudget] = useState(DEFAULT_BUDGET);
  const [viewer, setViewer] = useState<ViewerTarget | null>(null);
  const [drawer, setDrawer] = useState<"files" | "inspector" | null>(null);
  const streamingRef = useRef(false);

  const tokensByPath = useMemo(() => {
    const m = new Map<string, number>();
    if (index) for (const c of index.chunks) m.set(c.path, (m.get(c.path) ?? 0) + c.tokens);
    return m;
  }, [index]);

  const fileByPath = useMemo(() => {
    const m = new Map<string, RepoFile>();
    if (index) for (const f of index.files) m.set(f.path, f);
    return m;
  }, [index]);

  const runIndex = useCallback((files: RepoFile[], nextStats: IngestStats) => {
    setPhase("loading");
    setError(null);
    setLoadingLabel(`Indexing ${files.length} files…`);
    // Yield twice so the loading state paints before the synchronous build.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        try {
          const idx = buildIndex(files);
          setIndex(idx);
          setStats(nextStats);
          setMessages([]);
          setBundle(null);
          setBudget(DEFAULT_BUDGET);
          setPhase("ready");
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
          setPhase("landing");
        }
      }),
    );
  }, []);

  const loadDemo = useCallback(() => {
    const files = DEMO_REPO.files;
    const indexedBytes = files.reduce((a, f) => a + f.bytes, 0);
    runIndex(files, {
      owner: "demo",
      repo: DEMO_REPO.name,
      ref: "main",
      indexedFiles: files.length,
      skippedFiles: 0,
      indexedBytes,
      truncated: false,
    });
  }, [runIndex]);

  const loadRepo = useCallback(async () => {
    const input = repoInput.trim();
    if (!input) return;
    setPhase("loading");
    setError(null);
    setLoadingLabel("Fetching repository…");
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: input }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ingest failed.");
        setPhase("landing");
        return;
      }
      if (!data.files?.length) {
        setError("No indexable source files were found in this repository.");
        setPhase("landing");
        return;
      }
      runIndex(data.files as RepoFile[], data.stats as IngestStats);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("landing");
    }
  }, [repoInput, runIndex]);

  const ask = useCallback(
    async (question: string) => {
      if (!index || streamingRef.current) return;
      const b = selectContext(index, question, { budget });
      setBundle(b);
      setDrawer(null);
      setMessages((prev) => [...prev, { role: "user", content: question }, { role: "assistant", content: "" }]);
      streamingRef.current = true;
      setStreaming(true);
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            context: b.contextText,
            repo: stats ? `${stats.owner}/${stats.repo}` : undefined,
            sources: b.selected.map((s) => ({
              path: s.chunk.path,
              startLine: s.chunk.startLine,
              endLine: s.chunk.endLine,
              symbol: s.chunk.symbol,
              included: s.included,
            })),
          }),
        });
        const mode = (res.headers.get("x-repolens-mode") as "live" | "demo") || undefined;
        if (!res.ok || !res.body) {
          let msg = "Request failed.";
          try {
            const j = await res.json();
            msg = j.error || msg;
          } catch {
            /* ignore */
          }
          setMessages((prev) => updateLast(prev, { content: `⚠️ ${msg}`, mode }));
          return;
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let acc = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += dec.decode(value, { stream: true });
          setMessages((prev) => updateLast(prev, { content: acc, mode }));
        }
        setMessages((prev) => updateLast(prev, { content: acc, mode }));
      } catch (e) {
        setMessages((prev) => updateLast(prev, { content: `⚠️ ${e instanceof Error ? e.message : String(e)}` }));
      } finally {
        streamingRef.current = false;
        setStreaming(false);
      }
    },
    [index, budget, stats],
  );

  const openChunk = useCallback((chunk: Chunk) => {
    setViewer({
      path: chunk.path,
      code: chunk.code,
      startLine: chunk.startLine,
      hlStart: chunk.startLine,
      hlEnd: chunk.endLine,
      note: `${chunk.kind}${chunk.symbol ? ` · ${chunk.symbol}` : ""} · lines ${chunk.startLine}-${chunk.endLine}`,
    });
  }, []);

  const openFile = useCallback(
    (path: string) => {
      const f = fileByPath.get(path);
      if (!f) return;
      setViewer({ path, code: f.text, startLine: 1, note: `${fmt(tokensByPath.get(path) ?? 0)} tokens` });
    },
    [fileByPath, tokensByPath],
  );

  const onCite = useCallback(
    (path: string, line: number) => {
      const inBundle = bundle?.selected.find(
        (s) => s.chunk.path === path && line >= s.chunk.startLine && line <= s.chunk.endLine,
      );
      if (inBundle) {
        setViewer({
          path,
          code: inBundle.chunk.code,
          startLine: inBundle.chunk.startLine,
          hlStart: line,
          hlEnd: line,
          note: inBundle.chunk.symbol ?? undefined,
        });
        return;
      }
      const f = fileByPath.get(path);
      if (f) setViewer({ path, code: f.text, startLine: 1, hlStart: line, hlEnd: line });
    },
    [bundle, fileByPath],
  );

  const reset = () => {
    setPhase("landing");
    setIndex(null);
    setStats(null);
    setMessages([]);
    setBundle(null);
    setError(null);
  };

  // ---- Landing ----
  if (phase !== "ready") {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-5 py-16">
        <Wordmark />
        <h1 className="mt-6 text-center text-4xl font-semibold tracking-tight sm:text-5xl">
          See only the context <span className="text-save">that matters</span>.
        </h1>
        <p className="mt-4 max-w-xl text-center text-[15px] leading-relaxed text-muted">
          RepoLens ingests a GitHub repo, then answers questions about it by selecting and compressing
          the <span className="text-fg">minimal relevant code</span> before it ever reaches the model —
          and shows you the token savings.
        </p>

        <div className="mt-8 w-full max-w-xl">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              loadRepo();
            }}
            className="flex flex-col gap-2 sm:flex-row"
          >
            <input
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              placeholder="https://github.com/owner/repo  or  owner/repo"
              disabled={phase === "loading"}
              className="flex-1 rounded-xl border border-border bg-panel px-4 py-3 text-sm text-fg outline-none placeholder:text-faint focus:border-accent"
            />
            <button
              type="submit"
              disabled={phase === "loading" || !repoInput.trim()}
              className="rounded-xl bg-accent px-5 py-3 text-sm font-medium text-[#0a0d13] hover:opacity-90 disabled:opacity-40"
            >
              Analyze
            </button>
          </form>

          <div className="mt-3 flex items-center justify-center gap-3 text-sm text-muted">
            <span className="h-px flex-1 bg-border" />
            <span>or</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <button
            onClick={loadDemo}
            disabled={phase === "loading"}
            className="mt-3 w-full rounded-xl border border-border bg-panel px-4 py-3 text-sm text-fg hover:border-borderlt hover:bg-panel2 disabled:opacity-40"
          >
            ▶ Try the bundled demo repo{" "}
            <span className="text-faint">— {DEMO_REPO.name}, works with no API key</span>
          </button>

          {phase === "loading" ? (
            <div className="mt-5 flex items-center justify-center gap-2 text-sm text-accent2">
              <Spinner /> {loadingLabel}
            </div>
          ) : null}
          {error ? (
            <div className="mt-5 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </div>
          ) : null}
        </div>

        <div className="mt-14 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
          <Feature title="Structural retrieval" body="Chunks code at symbol boundaries, ranks with BM25 + a reference graph. No embeddings, no vector DB." />
          <Feature title="Compression" body="Packs the best chunks under a token budget and condenses the rest to signatures." />
          <Feature title="Explainable" body="Every selected chunk shows its score and why it was picked. Nothing is a black box." />
        </div>
        <p className="mt-10 text-center text-xs text-faint">
          Built for the Open Gigantic assignment · answers via Grok (xAI) when a key is set, otherwise demo mode.
        </p>
      </main>
    );
  }

  // ---- Workspace ----
  return (
    <main className="flex h-screen flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-panel/60 px-4 py-2.5 backdrop-blur">
        <button onClick={reset} className="flex items-center gap-2" title="New repo">
          <Wordmark small />
        </button>
        <div className="ml-1 min-w-0">
          <div className="truncate font-mono text-sm text-fg">
            {stats?.owner}/{stats?.repo}
            <span className="text-faint"> @ {stats?.ref}</span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {stats?.truncated ? (
            <span className="hidden rounded border border-warn/40 bg-warn/10 px-2 py-1 text-[11px] text-warn sm:inline">
              truncated
            </span>
          ) : null}
          <Chip label="files" value={String(stats?.indexedFiles ?? 0)} />
          <Chip label="chunks" value={String(index?.chunks.length ?? 0)} />
          <Chip label="tokens" value={fmt(index?.totalTokens ?? 0)} />

          <label className="ml-1 hidden items-center gap-2 rounded-lg border border-border bg-panel2/50 px-2 py-1 text-[11px] text-muted md:flex">
            budget
            <input
              type="range"
              min={2000}
              max={16000}
              step={1000}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="accent-[var(--color-accent)]"
            />
            <span className="w-8 text-right font-mono text-fg tabular-nums">{fmt(budget)}</span>
          </label>

          <button onClick={reset} className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted hover:bg-panel2 hover:text-fg">
            New repo
          </button>
        </div>
      </header>

      {/* Mobile panel toggles */}
      <div className="flex shrink-0 gap-2 border-b border-border px-3 py-2 lg:hidden">
        <button onClick={() => setDrawer("files")} className="rounded-md border border-border px-3 py-1 text-xs text-muted hover:bg-panel2">
          Files
        </button>
        <button onClick={() => setDrawer("inspector")} className="rounded-md border border-border px-3 py-1 text-xs text-muted hover:bg-panel2">
          Context inspector
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-panel/40 lg:flex">
          <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted">
            Files · {stats?.indexedFiles}
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {index ? <FileList files={index.files} tokensByPath={tokensByPath} onOpen={openFile} /> : null}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <Chat messages={messages} streaming={streaming} onAsk={ask} suggestions={suggestionsFor(stats)} onCite={onCite} />
        </section>

        <aside className="hidden w-[370px] shrink-0 flex-col border-l border-border bg-panel/40 xl:flex">
          <ContextInspector bundle={bundle} onOpenChunk={openChunk} />
        </aside>
      </div>

      {/* Drawers (small screens) */}
      {drawer ? (
        <div className="fixed inset-0 z-40 flex bg-black/50 xl:hidden" onClick={() => setDrawer(null)}>
          <div
            className={`h-full ${drawer === "files" ? "w-72" : "ml-auto w-[92%] max-w-md"} flex flex-col border-border bg-panel ${drawer === "files" ? "border-r" : "border-l"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                {drawer === "files" ? "Files" : "Context inspector"}
              </span>
              <button onClick={() => setDrawer(null)} className="text-xs text-muted hover:text-fg">
                ✕
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {drawer === "files" && index ? (
                <div className="p-2">
                  <FileList files={index.files} tokensByPath={tokensByPath} onOpen={openFile} />
                </div>
              ) : (
                <ContextInspector bundle={bundle} onOpenChunk={openChunk} />
              )}
            </div>
          </div>
        </div>
      ) : null}

      <CodeViewer target={viewer} onClose={() => setViewer(null)} />
    </main>
  );
}

function suggestionsFor(stats: IngestStats | null): string[] {
  if (stats && stats.owner === "demo") return DEMO_QUESTIONS;
  return [
    "What does this project do and where is the entry point?",
    "How is the code organized at a high level?",
    "Where is configuration loaded and what can be configured?",
    "Explain the main data flow through the app.",
  ];
}

function Wordmark({ small = false }: { small?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`grid ${small ? "h-6 w-6" : "h-9 w-9"} place-items-center rounded-lg border border-borderlt bg-panel2`}
        style={{ boxShadow: "inset 0 0 12px rgba(129,140,248,.25)" }}
      >
        <div className={`${small ? "h-2.5 w-2.5" : "h-4 w-4"} rounded-full`} style={{ background: "radial-gradient(circle at 30% 30%, #a78bfa, #34d399)" }} />
      </div>
      <span className={`font-semibold tracking-tight ${small ? "text-sm" : "text-lg"}`}>
        Repo<span className="text-accent2">Lens</span>
      </span>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border bg-panel/50 p-4">
      <div className="text-sm font-medium text-fg">{title}</div>
      <div className="mt-1 text-[13px] leading-relaxed text-muted">{body}</div>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="hidden items-baseline gap-1 rounded-lg border border-border bg-panel2/50 px-2 py-1 sm:flex">
      <span className="font-mono text-xs text-fg tabular-nums">{value}</span>
      <span className="text-[10px] text-faint">{label}</span>
    </div>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-accent2 border-t-transparent" />
  );
}
