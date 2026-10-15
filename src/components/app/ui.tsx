import { cn } from "@/lib/utils";
import { AlertTriangle, Inbox, WifiOff } from "lucide-react";
import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.35)]", className)}>
      {children}
    </div>
  );
}

export function PanelTitle({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-3.5">
      <div>
        <p className="text-[13px] font-semibold tracking-tight text-foreground">{title}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Kpi({ label, value, sub, spark, accent }: { label: string; value: string; sub?: string; spark?: number[]; accent?: string }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-card px-4 py-3">
      <p className="truncate text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className="tnum min-w-0 flex-1 truncate text-xl font-bold tracking-tight text-foreground" title={value}>{value}</p>
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
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted/40">
        <Inbox className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 max-w-sm text-[13px] leading-6 text-muted-foreground">{body}</p>
      {action && <div className="mt-4 flex gap-2">{action}</div>}
    </div>
  );
}

export function FeedDown({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-[color:var(--warning)]/40 bg-[color:var(--warning)]/10 px-3.5 py-2.5 text-[13px]">
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
    <div className="flex items-start gap-2 rounded-lg border border-[color:var(--warning)]/35 bg-[color:var(--warning)]/8 px-3.5 py-2.5 text-[13px] leading-6 text-foreground">
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
    critical: "bg-[color:var(--destructive)]/15 text-[color:var(--destructive)] border-[color:var(--destructive)]/30",
    high: "bg-[color:var(--warning)]/12 text-[color:var(--warning)] border-[color:var(--warning)]/30",
    medium: "bg-[color:var(--primary)]/12 text-[color:var(--primary)] border-[color:var(--primary)]/30",
    low: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={cn("inline-block rounded border px-1.5 py-px text-[11px] font-semibold capitalize", map[sev] ?? map.low)}>
      {sev}
    </span>
  );
}

export function StatusDot({ state }: { state: string }) {
  const color =
    state === "live" ? "var(--success)" : state === "delayed" ? "var(--warning)" : state === "simulated" ? "var(--primary)" : "var(--muted-foreground)";
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium capitalize text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
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
  "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-[color:var(--ring)]";
export const btnPrimary =
  "rounded-md bg-[color:var(--primary)] px-3.5 py-2 text-[13px] font-semibold text-white hover:brightness-110 disabled:opacity-50";
export const btnGhost =
  "rounded-md border border-border px-3.5 py-2 text-[13px] font-medium text-foreground hover:bg-muted";

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
