"use client";

function fmt(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
  return String(n);
}

export function SavingsGauge({
  baselineTokens,
  usedTokens,
  savedPct,
  budget,
  candidatesConsidered,
}: {
  baselineTokens: number;
  usedTokens: number;
  savedPct: number;
  budget: number;
  candidatesConsidered: number;
}) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, savedPct));
  const offset = c * (1 - pct / 100);

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: 128, height: 128 }}>
        <svg width={128} height={128} viewBox="0 0 128 128" className="-rotate-90">
          <circle cx="64" cy="64" r={r} fill="none" stroke="var(--color-border)" strokeWidth="10" />
          <circle
            cx="64"
            cy="64"
            r={r}
            fill="none"
            stroke="var(--color-save)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset .6s cubic-bezier(.2,.8,.2,1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold text-save tabular-nums">{pct}%</span>
          <span className="text-[10px] uppercase tracking-wider text-muted">context saved</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 text-sm">
        <Stat label="Full repo" value={`${fmt(baselineTokens)} tok`} sub="naive dump" tone="muted" />
        <Stat label="Sent to model" value={`${fmt(usedTokens)} tok`} sub={`budget ${fmt(budget)}`} tone="save" />
        <Stat
          label="Considered"
          value={`${candidatesConsidered}`}
          sub="matching chunks"
          tone="muted"
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "muted" | "save";
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-24 text-xs text-muted">{label}</span>
      <span className={`font-mono font-medium tabular-nums ${tone === "save" ? "text-save" : "text-fg"}`}>
        {value}
      </span>
      <span className="text-xs text-faint">{sub}</span>
    </div>
  );
}
