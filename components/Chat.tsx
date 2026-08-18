"use client";

import { useEffect, useRef, useState } from "react";
import { MessageContent } from "./MessageContent";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  mode?: "live" | "demo";
}

export function Chat({
  messages,
  streaming,
  onAsk,
  suggestions,
  onCite,
}: {
  messages: ChatMessage[];
  streaming: boolean;
  onAsk: (q: string) => void;
  suggestions: string[];
  onCite: (path: string, line: number) => void;
}) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const submit = () => {
    const q = input.trim();
    if (!q || streaming) return;
    onAsk(q);
    setInput("");
  };

  const empty = messages.length === 0;

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
        {empty ? (
          <div className="mx-auto mt-6 max-w-md text-center">
            <p className="text-sm text-muted">
              Ask anything about this repository. The engine retrieves and compresses only the
              relevant code before sending it to Grok.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => onAsk(s)}
                  disabled={streaming}
                  className="rounded-lg border border-border bg-panel2/50 px-3 py-2 text-left text-[13px] text-fg/90 hover:border-borderlt hover:bg-panel2 disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => <Bubble key={i} message={m} onCite={onCite} streaming={streaming && i === messages.length - 1} />)
        )}
      </div>

      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2 rounded-xl border border-border bg-panel2/60 p-2 focus-within:border-borderlt">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder="Ask about the codebase…  (Enter to send)"
            className="max-h-40 min-h-[24px] flex-1 resize-none bg-transparent px-1 text-sm text-fg outline-none placeholder:text-faint"
          />
          <button
            onClick={submit}
            disabled={streaming || !input.trim()}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-[#0a0d13] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {streaming ? "…" : "Ask"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Bubble({
  message,
  onCite,
  streaming,
}: {
  message: ChatMessage;
  onCite: (path: string, line: number) => void;
  streaming: boolean;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm border border-accent/30 bg-accent/10 px-3.5 py-2 text-sm text-fg">
          {message.content}
        </div>
      </div>
    );
  }

  const thinking = streaming && message.content.length === 0;
  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[92%]">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-accent2">RepoLens</span>
          {message.mode === "demo" ? (
            <span className="rounded border border-warn/40 bg-warn/10 px-1.5 py-[1px] text-[10px] text-warn">
              demo mode
            </span>
          ) : message.mode === "live" ? (
            <span className="rounded border border-save/40 bg-save/10 px-1.5 py-[1px] text-[10px] text-save">
              grok
            </span>
          ) : null}
        </div>
        {thinking ? (
          <div className="flex items-center gap-1.5 text-sm text-muted">
            <Dot /> <Dot d={150} /> <Dot d={300} /> selecting context…
          </div>
        ) : (
          <div className={streaming ? "rl-caret" : ""}>
            <MessageContent text={message.content} onCite={onCite} />
          </div>
        )}
      </div>
    </div>
  );
}

function Dot({ d = 0 }: { d?: number }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full bg-muted"
      style={{ animation: "rl-pulse 1s infinite", animationDelay: `${d}ms` }}
    />
  );
}
