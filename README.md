# RepoLens

**See only the context that matters.** RepoLens ingests a GitHub repository and answers
questions about it — but instead of stuffing the whole codebase into the model, it selects and
compresses the *minimal relevant context* first, and shows you exactly what it kept and how many
tokens it saved.

It's a working, miniature version of the idea behind an AI-coding context engine: keep full
awareness of the repo, but only pay for the tokens that actually matter.

- **Live demo:** _see the submission document / repo description for the deployed link_
- **Stack:** Next.js (App Router) · TypeScript · Tailwind v4 · Grok (xAI) for answers

---

## What it does

1. Paste a public GitHub repo (or click the bundled demo — works with **no API key**).
2. RepoLens downloads the repo, filters it, and builds a structural index **in your browser**.
3. Ask a question. The context engine ranks and compresses the codebase into a small budget of
   tokens, then sends only that to the model.
4. The **Context Inspector** shows the token savings, every chunk that was selected, its score,
   and *why* it was chosen — nothing is a black box.

On a real repo (e.g. `sindresorhus/ky`, ~145k tokens) a focused question typically sends ~5–6k
tokens of context — a **90%+ reduction** — while still citing the exact `file:line` locations.

## How the context engine works

No embeddings, no vector database. It's lexical + structural, which is fast, serverless-friendly,
and closer to how you'd actually reason about "what does this question need to see":

- **Chunking** — files are split at symbol boundaries (functions, classes, types) using
  lightweight per-language rules, with a fixed-window fallback for anything unrecognized.
- **Ranking** — BM25 over code-aware tokens (camelCase / snake_case aware, with prefix stemming so
  `authentication` reaches `auth`), boosted by symbol-name and filename matches.
- **Reference graph** — a one-hop expansion pulls in the *definitions* that the top chunks depend
  on (e.g. a route → its service → the types it returns).
- **Budgeting + compression** — the best chunks are packed under a token budget; anything that
  doesn't fit in full is condensed to its **signature** ("skeleton") so the model still knows it
  exists.

See `lib/context-engine/` for the whole thing; `selectContext()` in
[`lib/context-engine/index.ts`](lib/context-engine/index.ts) is the entry point.

## Run locally

```bash
npm install
cp .env.example .env.local   # optional: add XAI_API_KEY for real Grok answers
npm run dev                  # http://localhost:3000
```

The app works immediately in demo mode. Add an `XAI_API_KEY` to `.env.local` to get real,
grounded answers from Grok.

### Environment variables

| Variable        | Required | Purpose                                                        |
| --------------- | -------- | -------------------------------------------------------------- |
| `XAI_API_KEY`   | no\*     | Enables real Grok answers. Without it, answers are templated.  |
| `GROK_MODEL`    | no       | Defaults to `grok-4.6`.                                         |
| `XAI_BASE_URL`  | no       | Defaults to `https://api.x.ai/v1` (OpenAI-compatible).         |
| `GITHUB_TOKEN`  | no       | Raises GitHub ingest rate limits.                              |

\* Not required to run — required only for live AI answers.

## Deploy on Vercel

1. Push this repo to GitHub.
2. Import it at [vercel.com/new](https://vercel.com/new) — it's auto-detected as Next.js, zero config.
3. Add `XAI_API_KEY` under **Settings → Environment Variables** (optional, for live answers).
4. Deploy.

## Project layout

```
app/
  page.tsx                 workspace UI (client) — orchestrates ingest, ask, inspector
  api/ingest/route.ts      download + parse + filter a repo tarball (Node runtime)
  api/ask/route.ts         stream Grok's answer, or a templated demo answer
lib/
  context-engine/          the core: filter, chunk, bm25, graph, compress, orchestration
  github.ts                repo URL parsing + ingest caps
  tokens.ts                token estimation (gpt-tokenizer as a Grok-tokenizer proxy)
  demo-repo.ts             bundled sample repo for keyless mode
components/                Chat, ContextInspector, SavingsGauge, FileList, CodeViewer, ...
```

## Notes & limitations

- Token counts are **estimates** — xAI doesn't publish Grok's tokenizer, so we use
  `gpt-tokenizer` (o200k) as a consistent proxy. The *ratio* (what this product is about) is
  measured the same way on both sides, so it's honest.
- The engine runs client-side, so repos are capped (see `CAPS` in `lib/github.ts`). The scale
  path is moving indexing server-side with a KV cache.
- Chunking is heuristic, not a full parser. tree-sitter is the natural upgrade.
