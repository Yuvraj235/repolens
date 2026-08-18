"use client";

import { useEffect } from "react";

export interface ViewerTarget {
  path: string;
  code: string;
  startLine: number; // line number of the first line of `code`
  hlStart?: number; // absolute line to highlight from
  hlEnd?: number; // absolute line to highlight to
  note?: string;
}

export function CodeViewer({ target, onClose }: { target: ViewerTarget | null; onClose: () => void }) {
  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, onClose]);

  if (!target) return null;
  const lines = target.code.split("\n");

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-2xl flex-col border-l border-border bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0">
            <div className="truncate font-mono text-sm text-fg">{target.path}</div>
            {target.note ? <div className="truncate text-xs text-muted">{target.note}</div> : null}
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-border px-2 py-1 text-xs text-muted hover:bg-panel2 hover:text-fg"
          >
            Close ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <pre className="min-w-full text-[12.5px] leading-relaxed">
            <code className="font-mono">
              {lines.map((line, i) => {
                const lineNo = target.startLine + i;
                const hot =
                  target.hlStart != null &&
                  target.hlEnd != null &&
                  lineNo >= target.hlStart &&
                  lineNo <= target.hlEnd;
                return (
                  <div
                    key={i}
                    className={`flex ${hot ? "bg-accent/10" : ""}`}
                    style={hot ? { boxShadow: "inset 2px 0 0 var(--color-accent)" } : undefined}
                  >
                    <span className="w-12 shrink-0 select-none pr-3 text-right text-faint">{lineNo}</span>
                    <span className="whitespace-pre pr-4 text-fg/90">{line || " "}</span>
                  </div>
                );
              })}
            </code>
          </pre>
        </div>
      </div>
    </div>
  );
}
