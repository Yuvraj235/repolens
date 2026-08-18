"use client";

import type { Chunk, ContextBundle } from "@/lib/context-engine";
import { SavingsGauge } from "./SavingsGauge";

export function ContextInspector({
  bundle,
  onOpenChunk,
}: {
  bundle: ContextBundle | null;
  onOpenChunk: (chunk: Chunk) => void;
}) {
  if (!bundle) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <div className="text-2xl">🔍</div>
        <p className="text-sm text-muted">
          Ask a question to see exactly which parts of the repo the engine selected — and how much
          context it saved.
        </p>
      </div>
    );
  }

  const maxScore = Math.max(1, ...bundle.selected.map((s) => s.score));

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-4">
        <SavingsGauge
          baselineTokens={bundle.baselineTokens}
          usedTokens={bundle.usedTokens}
          savedPct={bundle.savedPct}
          budget={bundle.budget}
          candidatesConsidered={bundle.candidatesConsidered}
        />
      </div>
      <div className="flex items-center justify-between px-4 pb-1 pt-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
          Selected context
        </h3>
        <span className="text-xs text-faint">{bundle.selected.length} chunks</span>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-auto px-3 pb-4">
        {bundle.selected.map((sel, idx) => (
          <button
            key={sel.chunk.id}
            onClick={() => onOpenChunk(sel.chunk)}
            className="block w-full rounded-lg border border-border bg-panel2/40 p-2.5 text-left transition-colors hover:border-borderlt hover:bg-panel2"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-faint">{idx + 1}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-fg">
                {sel.chunk.path}
                <span className="text-faint">
                  :{sel.chunk.startLine}-{sel.chunk.endLine}
                </span>
              </span>
              <Badge included={sel.included} />
            </div>

            {sel.chunk.symbol ? (
              <div className="mt-1 truncate font-mono text-[11px] text-accent2">{sel.chunk.symbol}</div>
            ) : null}

            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${Math.max(4, (sel.score / maxScore) * 100)}%` }}
              />
            </div>

            <ul className="mt-1.5 space-y-0.5">
              {sel.reasons.map((r, j) => (
                <li key={j} className="text-[11px] leading-snug text-muted">
                  · {r}
                </li>
              ))}
            </ul>
            <div className="mt-1 text-right font-mono text-[10px] text-faint">{sel.tokens} tok</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Badge({ included }: { included: "full" | "skeleton" }) {
  return included === "full" ? (
    <span className="shrink-0 rounded border border-save/40 bg-save/10 px-1.5 py-[1px] text-[10px] font-medium text-save">
      full
    </span>
  ) : (
    <span className="shrink-0 rounded border border-warn/40 bg-warn/10 px-1.5 py-[1px] text-[10px] font-medium text-warn">
      skeleton
    </span>
  );
}
