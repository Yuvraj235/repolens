# RepoLens — Founding AI Engineer Assignment

**Repo:** https://github.com/Yuvraj235/repolens
**Live demo:** _deploying on Vercel — link goes here once imported (see README → Deploy on Vercel)_

> The live demo works with no setup — click "Try the bundled demo repo", or paste any public
> GitHub repo. If a Grok key is configured on the deployment you get real AI answers; otherwise it
> runs in demo mode where everything except the final sentence is still fully live.

---

## 1. What I built and why

I built **RepoLens**: a web app that takes a GitHub repo and answers questions about it, but the
actual product is the thing in the middle — a **context engine** that decides the *minimum* slice
of the codebase a given question needs, compresses it, and shows you the token savings.

I chose this on purpose. The assignment could have been a quiz app or a game, but I'm interviewing
for a founding AI engineer role on **Superbrain**, whose whole differentiator is a context engine
that "compresses and prioritizes code intelligence on the fly and cuts token usage 60–80%." So
rather than build something adjacent, I wanted to build the *hard part* — the exact competency the
role is about — and prove I understand why it matters.

The core bet behind the product: **the bottleneck in AI coding tools isn't the model, it's the
context.** Dumping a whole repo is expensive, slow, and actually makes answers worse (the signal
drowns). The interesting engineering is deciding what *not* to send. RepoLens makes that decision
visible and measurable.

Concretely, on `sindresorhus/ky` (~145k tokens of code) a focused question sends ~6k tokens of
context — a **~96% reduction** — and still cites exact `file:line` locations. That number is the
whole point, so I put it front and center.

## 2. How it works (30-second tour)

1. Paste a repo → the server downloads the tarball, filters junk (binaries, lockfiles, vendored
   dirs), and returns the source files.
2. The browser builds a structural index and, for each question, runs the context engine locally.
3. The selected + compressed context goes to Grok, which streams back an answer with citations.
4. The **Context Inspector** shows: full-repo tokens vs. tokens sent, % saved, and every chunk
   that was picked — with its score and a plain-English reason ("symbol name match: authGuard",
   "defines `Note`, referenced by store.ts"). Click any citation to jump to the code.

## 3. Architecture & key design decisions

**Stack:** Next.js (App Router) + TypeScript + Tailwind, deployed on Vercel. Answers come from
**Grok (xAI)** through its OpenAI-compatible endpoint.

```mermaid
flowchart LR
  U["Browser UI"] -->|"repo URL"| ING["/api/ingest (Node)"]
  ING -->|"tarball"| GH[("GitHub codeload")]
  ING -->|"filtered source files"| U
  U --> ENG[["Context engine — runs in the browser"]]
  ENG -->|"compressed context + question"| ASK["/api/ask"]
  ASK -->|"stream"| GROK[("Grok / xAI")]
  GROK -->|"answer + file:line citations"| U
  ASK -. "no key" .-> DEMO["templated demo answer"]
  DEMO --> U
```

The two API routes are stateless and thin. The heavy lifting — indexing, retrieval, compression —
happens client-side, so there's no server session or vector store to manage.

**The context engine (`lib/context-engine/`)** is the core IP and is deliberately simple:

- **Filter** → drop binaries, lockfiles, `node_modules`, minified bundles, oversized files.
- **Chunk** → split files at symbol boundaries (functions/classes/types) with per-language regex
  rules, fixed-window fallback otherwise. Each chunk carries a full form and a "skeleton"
  (signature only).
- **Rank** → BM25 over code-aware tokens + boosts for symbol-name and filename matches.
- **Expand** → a one-hop reference graph pulls in the *definitions* the top chunks depend on.
- **Budget + compress** → greedily pack the best chunks under a token budget; condense the rest to
  skeletons so the model still knows they exist.
- **Explain** → every selection comes out with a score and a human-readable reason.

```mermaid
flowchart LR
  F["Filter<br/>binaries · lockfiles<br/>vendored · minified"] --> C["Chunk<br/>at symbol boundaries"]
  C --> R["Rank<br/>BM25 + symbol/path boosts"]
  R --> X["Expand<br/>1-hop reference graph"]
  X --> B["Budget<br/>greedy pack under token budget"]
  B --> K["Compress<br/>skeletonize the overflow"]
  K --> E["Explain<br/>score + reason per chunk"]
```

I'll call out the decisions that actually mattered, because the "how you decide" part is what you
said you care about:

**No embeddings / no vector DB.** The obvious move for "chat with a repo" is RAG with embeddings.
I deliberately didn't. Two reasons: (1) xAI doesn't expose an embeddings API, so it would've meant
bolting on a second provider and infra; (2) more importantly, **structural + lexical selection is
a better fit for the pitch.** "Prioritize code intelligence on the fly" is about structure —
symbols, references, file layout — not fuzzy semantic similarity. Lexical + a reference graph is
fast, has zero infra, runs in the browser, and is *explainable*, which turned out to be the most
compelling part of the demo. If I needed semantic recall later I'd add embeddings as a *second*
signal, not the foundation.

**Run the engine in the browser; keep the server routes dumb.** The index is built client-side and
every question runs retrieval locally. The server only does two stateless things: fetch/parse a
tarball, and proxy the streaming answer. This dodged the whole serverless-state problem (Vercel
functions aren't sticky, so an in-memory index wouldn't survive between requests) without reaching
for a KV store. The tradeoff is a size cap on repos, which is fine for a demo and has an obvious
scale path.

**Keyless demo mode.** The retrieval and compression are pure computation — they need no API key.
Only the final natural-language sentence needs Grok. So the deployed link is meaningful to a
reviewer even with no key: they see the real engine work and the real savings, and the answer is a
templated summary of the selected context. This was a product decision, not a technical one — the
live link had to *demonstrate value on the first click*.

**Token counts are honest estimates.** xAI doesn't publish Grok's tokenizer, so I use
`gpt-tokenizer` as a consistent proxy and label it as an estimate. Both sides of the savings ratio
are measured the same way, so the comparison is fair even if the absolute number is approximate. I
'd rather show an honest estimate than a fake-precise one.

## 4. Decision-making log (things I changed my mind on)

- **The demo repo was too small at first.** My first bundled repo was ~2k tokens, so with a normal
  budget it nearly fit and the app showed only ~13% "saved" — which undersells the entire point. I
  rebuilt it as a realistic *layered* service (routes → services → repositories → store, ~5k
  tokens) so focused questions show ~60% on the demo and the reference-graph expansion has real
  chains to follow. The lesson: the demo has to make the value legible, and I had to notice the
  metric was lying about the product before a reviewer did.
- **Retrieval was weak until I added stemming + stopwords.** "How does *authentication* work" was
  matching junk words like "to"/"end" and missing the `auth` code entirely, because the query says
  "authentication" and the code says "auth". I added a 4-char prefix stem and a stopword filter;
  the same question then correctly surfaced the whole auth flow across five files. Small change,
  huge quality difference — and exactly the kind of unglamorous work a context engine lives on.
- **Dropped the Vercel AI SDK.** I started to use it, then switched to a plain `fetch` against the
  OpenAI-compatible endpoint. Fewer moving parts, no version-churn risk, and streaming SSE is easy
  to parse by hand. For a founding-stage codebase I'd rather own the ~40 lines than the dependency.

## 5. Product strategy — what I'd change/add next on Superbrain, and why

**Lead with what I built here: make the context engine visible and steerable.** Today, in every AI
IDE, the context engine is a black box — you don't know what the model saw, so when it's wrong you
can't tell if it's a bad model or bad context, and you can't fix it. I'd ship a first-class
**Context Inspector** inside Superbrain: for any agent step, show the files/symbols it pulled in,
what it dropped, and let the user **pin, exclude, or add** context before it runs. This does three
things at once — builds trust, turns power users into steerers instead of spectators, and gives
you the best possible feedback signal for improving the engine (users literally correcting its
selections). It's the highest-leverage thing because it compounds: better trust → more usage →
more correction data → better engine.

Two more, briefly:

- **A verification loop for edits.** Since the agent writes code, run the cheap checks
  (typecheck / affected tests / lints) on the *diff* before presenting it, and show the result
  inline. "Confidently wrong edits" are the #1 reason people stop trusting agents; catching them
  automatically is worth more than a slightly smarter model.
- **A persistent, incrementally-updated repo map.** Re-deriving repo intelligence every session is
  wasted tokens and latency. Keep the map warm and update it on file changes, so the context
  engine starts every session already "aware" instead of cold. This directly serves the token
  story.

## 6. Product strategy — UI issues I dislike and how they annoy users

- **Opaque context (the big one).** You can't see what the tool read, so a wrong answer leaves you
  with no move except rephrasing and praying. It wastes turns and erodes trust. (RepoLens's whole
  right panel is my answer to this.)
- **Diff-review fatigue.** The agent drops a large multi-file diff and expects you to review it all
  at once with a coarse accept/reject. Reviewing 400 lines in a cramped side panel is worse than
  writing them, so people either rubber-stamp (dangerous) or give up (wasteful). It needs
  per-hunk, per-file review with the agent's *reasoning* attached to each change.
- **Agent runaway with no steering.** It goes off on a 15-step plan and you can only watch or hard-
  stop and lose all state. Users want a "nudge" — redirect mid-flight without killing the run.
- **Latency with no narration.** Long silent pauses. Even a truthful "reading 6 files, planning
  edit" removes most of the anxiety; a spinner removes none of it.
- **Chat divorced from code.** Answers live in a panel, citations aren't clickable, and you
  manually copy file paths to go look. Context should be anchored — click a citation, land on the
  line. (I made citations clickable in RepoLens for exactly this reason.)

The through-line: current AI IDEs optimize for the *happy path demo* and under-invest in the
*correction path* — what the user does when the tool is wrong, which is most of the time in real
work. That's where I'd focus the UI.

## 7. With more time

Tree-sitter chunking (more accurate than my regex rules), server-side indexing + KV cache to lift
the repo-size cap, semantic retrieval as a second ranking signal, a "diff view" for asking about a
PR instead of a whole repo, and shareable result links.

## 8. Honest limitations

Chunking is heuristic, not a real parser, so a few exotic files fall back to fixed windows. Repos
are capped because indexing runs client-side. Token numbers are estimates. Demo mode's final
sentence is templated, not model-generated. None of these change the thing the project is meant to
demonstrate — that deciding *what not to send* is the real work, and that it can be made fast,
measurable, and transparent.
