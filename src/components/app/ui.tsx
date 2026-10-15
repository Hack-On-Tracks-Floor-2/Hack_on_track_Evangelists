import { cn } from "@/lib/utils";
import { AlertTriangle, Inbox, WifiOff } from "lucide-react";
import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("glass sheen lift relative rounded-xl", className)}>
      {children}
    </div>
  );
}

export function PanelTitle({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-4">
      <div>
        <p className="display text-sm font-semibold tracking-tight text-foreground">{title}</p>
        {sub && <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Kpi({ label, value, sub, spark, accent }: { label: string; value: string; sub?: string; spark?: number[]; accent?: string }) {
  return (
    <div className="glass sheen lift relative min-w-0 overflow-hidden rounded-xl px-4 py-3.5">
      <span className="absolute left-0 top-0 h-full w-[3px] rounded-l-xl" style={{ background: accent ?? "var(--primary)" }} aria-hidden />
      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <p className="display tnum min-w-0 flex-1 truncate text-[22px] font-bold tracking-tight text-foreground" title={value}>{value}</p>
        {spark && spark.length > 1 && <Sparkline data={spark} color={accent ?? "var(--primary)"} />}
      </div>
      {sub && <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={sub}>{sub}</p>}
    </div>
  );
}

export function Sparkline({ data, color, w = 84, h = 26 }: { data: number[]; color: string; w?: number; h?: number }) {
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = Math.max(1, max - min);
  const pts = data.map((v, i) => `${(2 + (i / Math.max(1, data.length - 1)) * (w - 4)).toFixed(1)},${(h - 3 - ((v - min) / span) * (h - 6)).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="max-w-[84px] shrink-0 overflow-visible opacity-90" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Compact Indian-format number: 5,99,71,685 → "₹5.99 Cr". Fits KPI cards at any width. */
export function fmtBig(n: number, cur = "") {
  const a = Math.abs(n);
  const pre = cur === "INR" ? "₹" : "";
  const suf = cur && cur !== "INR" ? ` ${cur}` : "";
  if (a >= 1e7) return `${pre}${(n / 1e7).toFixed(2)} Cr${suf}`;
  if (a >= 1e5) return `${pre}${(n / 1e5).toFixed(2)} L${suf}`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}k${suf}`;
  return `${Math.round(n).toLocaleString("en-IN")}${suf}`;
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="grad-bg flex h-11 w-11 items-center justify-center rounded-2xl p-px shadow-[0_10px_30px_-10px_rgba(139,92,246,0.6)]">
        <div className="flex h-full w-full items-center justify-center rounded-[15px] bg-[#0b0a1a]/80">
          <Inbox className="h-5 w-5 text-[#c4b5fd]" strokeWidth={1.5} />
        </div>
      </div>
      <p className="display mt-3.5 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 max-w-sm text-[13px] leading-6 text-muted-foreground">{body}</p>
      {action && <div className="mt-4 flex gap-2">{action}</div>}
    </div>
  );
}

export function FeedDown({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-[color:var(--warning)]/35 bg-[color:var(--warning)]/10 px-4 py-2.5 text-[13px] backdrop-blur-md">
      <WifiOff className="h-4 w-4 shrink-0 text-[color:var(--warning)]" />
      <p className="text-foreground">
        <span className="font-semibold">The configured provider is unavailable.</span>{" "}
        <span className="text-muted-foreground">No new live quotes are being received. Last known values may be stale.</span>
      </p>
      {onRetry && (
        <button onClick={onRetry} className="ml-auto shrink-0 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted">
          Retry
        </button>
      )}
    </div>
  );
}

export function WarnStrip({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-[color:var(--warning)]/30 bg-[color:var(--warning)]/8 px-4 py-2.5 text-[13px] leading-6 text-foreground backdrop-blur-md">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--warning)]" />
      <div>{children}</div>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

export function SevBadge({ sev }: { sev: string }) {
  const map: Record<string, string> = {
    critical: "bg-[color:var(--destructive)]/15 text-[color:var(--destructive)] border-[color:var(--destructive)]/30 shadow-[0_0_14px_-4px_rgba(251,113,133,0.6)]",
    high: "bg-[color:var(--warning)]/12 text-[color:var(--warning)] border-[color:var(--warning)]/30",
    medium: "bg-[color:var(--primary)]/12 text-[#c4b5fd] border-[color:var(--primary)]/30",
    low: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize tracking-wide", map[sev] ?? map.low)}>
      {(sev === "critical" || sev === "high") && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {sev}
    </span>
  );
}

export function StatusDot({ state }: { state: string }) {
  const color =
    state === "live" ? "var(--success)" : state === "delayed" ? "var(--warning)" : state === "simulated" ? "var(--primary)" : "var(--muted-foreground)";
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium capitalize text-muted-foreground">
      <span className={`h-1.5 w-1.5 rounded-full ${state === "live" ? "pulse-dot" : ""}`} style={{ background: color, color }} />
      {state}
    </span>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-medium text-muted-foreground">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

export const inputCls =
  "w-full rounded-lg border border-input bg-[color:var(--glass-hi)] px-2.5 py-1.5 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-[color:var(--ring)]/60";
export const btnPrimary =
  "grad-bg inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold text-white shadow-[0_8px_24px_-10px_rgba(139,92,246,0.8)] transition-all hover:shadow-[0_10px_30px_-8px_rgba(236,72,153,0.7)] hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:hover:brightness-100";
export const btnGhost =
  "inline-flex items-center justify-center gap-1.5 rounded-full border border-border bg-[color:var(--glass)] px-3.5 py-1.5 text-[13px] font-medium text-foreground backdrop-blur-md transition-all hover:border-[color:var(--glass-border-hi)] hover:bg-[color:var(--glass-hi)] active:scale-[0.98]";

export function num(n: number) {
  return n.toLocaleString("en-IN");
}

/** Global compact standard for chart axes and large aggregates: 2_000_000 → "2M",
 *  500_000 → "500k", 1_500 → "1.5k". Never emits "1000k"/"2000k". Table cells and
 *  tooltips keep full locale digits; axes stay compact and international. */
export function fmtAxis(n: number) {
  const a = Math.abs(n);
  if (a >= 1e9) return `${+(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${+(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${+(n / 1e3).toFixed(1)}k`;
  return `${Math.round(n)}`;
}

/** Short display for long entity IDs ("Rajesh Kumar · HDFC ••4821" → "Rajesh Kumar"). Full value stays in title attributes. */
export function shortId(id: string) {
  const i = id.indexOf(" · ");
  return i > 0 ? id.slice(0, i) : id;
}
export function emit() {
  window.dispatchEvent(new Event("trace:update"));
}
