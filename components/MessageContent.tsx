"use client";

import type { ReactNode } from "react";

const CITE_EXACT = /^([A-Za-z0-9_./-]+\.[A-Za-z][A-Za-z0-9]{0,7}):(\d+)(?:-(\d+))?$/;
const CITE_INLINE = /([A-Za-z0-9_./-]+\.[A-Za-z][A-Za-z0-9]{0,7}):(\d+)(?:-\d+)?/g;

type Cite = (path: string, line: number) => void;

function Citation({ label, path, line, onCite }: { label: string; path: string; line: number; onCite: Cite }) {
  return (
    <button
      onClick={() => onCite(path, line)}
      className="rounded border border-accent/40 bg-accent/10 px-1 py-[1px] font-mono text-[0.8em] text-accent hover:bg-accent/20"
    >
      {label}
    </button>
  );
}

function renderPlain(text: string, onCite: Cite, key: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  parts.forEach((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) {
      nodes.push(<strong key={`${key}-b${i}`}>{p.slice(2, -2)}</strong>);
      return;
    }
    let last = 0;
    let m: RegExpExecArray | null;
    CITE_INLINE.lastIndex = 0;
    while ((m = CITE_INLINE.exec(p))) {
      if (m.index > last) nodes.push(<span key={`${key}-s${i}-${last}`}>{p.slice(last, m.index)}</span>);
      nodes.push(
        <Citation key={`${key}-c${i}-${m.index}`} label={m[0]} path={m[1]} line={Number(m[2])} onCite={onCite} />,
      );
      last = m.index + m[0].length;
    }
    if (last < p.length) nodes.push(<span key={`${key}-e${i}`}>{p.slice(last)}</span>);
  });
  return nodes;
}

function renderInline(text: string, onCite: Cite, key: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const segs = text.split(/(`[^`]+`)/g);
  segs.forEach((s, i) => {
    if (s.length >= 2 && s.startsWith("`") && s.endsWith("`")) {
      const content = s.slice(1, -1);
      const m = CITE_EXACT.exec(content);
      if (m) {
        nodes.push(
          <Citation key={`${key}-ic${i}`} label={content} path={m[1]} line={Number(m[2])} onCite={onCite} />,
        );
      } else {
        nodes.push(<code key={`${key}-code${i}`}>{content}</code>);
      }
    } else if (s) {
      nodes.push(...renderPlain(s, onCite, `${key}-p${i}`));
    }
  });
  return nodes;
}

export function MessageContent({ text, onCite }: { text: string; onCite: Cite }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim().startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) buf.push(lines[i++]);
      i++; // consume closing fence
      blocks.push(
        <pre key={key++}>
          <code>{buf.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push(
        <h3 key={key++}>{renderInline(heading[2], onCite, `h${key}`)}</h3>,
      );
      i++;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={key++}>
          {items.map((it, j) => (
            <li key={j}>{renderInline(it, onCite, `ul${key}-${j}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push(
        <ol key={key++}>
          {items.map((it, j) => (
            <li key={j}>{renderInline(it, onCite, `ol${key}-${j}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].trim().startsWith("```") &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(<p key={key++}>{renderInline(para.join(" "), onCite, `pp${key}`)}</p>);
  }

  return <div className="prose-rl text-[13.5px] text-fg/90">{blocks}</div>;
}
