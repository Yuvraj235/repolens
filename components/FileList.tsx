"use client";

import type { RepoFile } from "@/lib/context-engine";

function fmtTokens(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

export function FileList({
  files,
  tokensByPath,
  onOpen,
}: {
  files: RepoFile[];
  tokensByPath: Map<string, number>;
  onOpen: (path: string) => void;
}) {
  return (
    <div className="flex flex-col">
      {files.map((f) => {
        const dir = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/") + 1) : "";
        const name = f.path.slice(f.path.lastIndexOf("/") + 1);
        const toks = tokensByPath.get(f.path) ?? 0;
        return (
          <button
            key={f.path}
            onClick={() => onOpen(f.path)}
            className="group flex items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] hover:bg-panel2"
            title={f.path}
          >
            <span className="min-w-0 flex-1 truncate">
              <span className="text-faint">{dir}</span>
              <span className="text-fg/90 group-hover:text-fg">{name}</span>
            </span>
            <span className="shrink-0 font-mono text-[11px] text-faint tabular-nums">{fmtTokens(toks)}</span>
          </button>
        );
      })}
    </div>
  );
}
