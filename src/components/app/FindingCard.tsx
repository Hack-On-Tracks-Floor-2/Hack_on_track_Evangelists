// Shared finding detail card — the "why was this flagged?" slide-in drawer.
// Structured so the detector's reasoning is the hero, the measured numbers
// come second, and the implicated transfer trail last. Values are tidied for
// humans (ISO timestamps shortened, Indian-locale numbers, count-aware
// "transfer(s)"); transaction IDs are never rewritten.
import type { ReactNode } from "react";
import { Link } from "react-router";
import { X } from "lucide-react";
import type { Alert } from "@/lib/trace/detect";
import { RiskCharacter, ScoreBar, btnGhost, btnPrimary } from "./ui";

/** Tidy raw evidence strings for humans: ISO timestamps -> "27 Aug, 08:47 UTC",
 *  long numbers -> Indian locale, "transfer(s)" -> "transfers". IDs are never touched. */
export function fmtVal(v: string): string {
  return v
    .replace(/(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?Z)?/g, (_m, d: string, hm: string) => {
      const dt = new Date(`${d}T${hm}:00Z`);
      return Number.isNaN(dt.getTime()) ? `${d} ${hm}` : `${dt.getDate()} ${dt.toLocaleString("en-US", { month: "short", timeZone: "UTC" })}, ${hm} UTC`;
    })
    .replace(/(\d+)\s+transfer\(s\)/g, (_m, n) => `${n} transfer${n === "1" ? "" : "s"}`)
    .replace(/transfer\(s\)/g, "transfers")
    .replace(/(?<![\w-])-?\d+(?:\.\d+)?(?![\w-])/g, (m) => {
      const n = Number(m);
      if (!Number.isFinite(n) || Math.abs(n) < 1000) return m;
      return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
    });
}

export function FindingCard({ a, onClose, note, extra }: { a: Alert; onClose: () => void; note?: string; extra?: ReactNode }) {
  const acct = a.entities[0] ?? a.title.split("—").pop()?.trim() ?? "unknown";
  const condition = a.title.split("—")[0].trim();
  const sevColor = a.severity === "critical" ? "#fb7185" : a.severity === "high" ? "#fbbf24" : a.severity === "medium" ? "#a78bfa" : "#2dd4bf";
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`Why ${acct} was flagged`}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <aside className="thin-scroll relative h-full w-full max-w-md overflow-y-auto border-l border-border bg-[color:var(--elevated)]/95 p-6 backdrop-blur-2xl animate-in slide-in-from-right duration-300">
        {/* header */}
        <div className="flex items-start gap-3">
          <RiskCharacter severity={a.severity} size={42} />
          <div className="min-w-0 flex-1">
            <p className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">flagged account</p>
            <p className="mono text-[16px] font-bold leading-6" title={acct}>{acct}</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">{condition}</p>
            {note && <p className="mt-1 text-[11px] text-muted-foreground/80">{note}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-[color:var(--glass-hi)] hover:text-foreground" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>

        {/* THE ANSWER — why it was flagged. Main focus of the card. */}
        <div className="mt-5 rounded-xl border border-border/60 bg-[color:var(--glass)] p-4 backdrop-blur-md" style={{ boxShadow: `inset 3px 0 0 ${sevColor}` }}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: sevColor }}>why it was flagged</p>
          <p className="mt-2 text-[14px] leading-7 text-foreground">{a.explanation}</p>
          <div className="mt-3 flex items-center gap-3 border-t border-border/50 pt-3">
            <ScoreBar score={a.score} w={96} />
            <span className="text-[11px] text-muted-foreground">review priority — not a probability of guilt</span>
          </div>
        </div>

        {/* the numbers behind the flag */}
        {a.evidence.length > 0 && (
          <>
            <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">The numbers behind it</p>
            <dl className="mt-2 space-y-1.5">
              {a.evidence.map((e, i) => (
                <div key={i} className="flex items-baseline justify-between gap-4 rounded-lg border border-border/60 bg-[color:var(--glass)] px-3.5 py-2.5 backdrop-blur-md">
                  <dt className="shrink-0 text-[12px] text-muted-foreground">{e.label}</dt>
                  <dd className="tnum text-right text-[13px] font-semibold leading-5">{fmtVal(e.value)}</dd>
                </div>
              ))}
            </dl>
          </>
        )}

        {/* implicated transfers as chips */}
        {a.txnIds.length > 0 && (
          <>
            <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Transfers involved ({a.txnIds.length})</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {a.txnIds.slice(0, 12).map((t) => (
                <span key={t} className="mono rounded-md border border-border/70 bg-background/40 px-2 py-0.5 text-[11px] text-muted-foreground">{t}</span>
              ))}
              {a.txnIds.length > 12 && <span className="self-center text-[11px] text-muted-foreground">+{a.txnIds.length - 12} more</span>}
            </div>
          </>
        )}

        {/* actions */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Link to={`/detections/${a.id}`} className={btnPrimary} onClick={onClose}>Open full workbench →</Link>
          {extra}
          <button onClick={onClose} className={btnGhost}>Close</button>
        </div>
        <p className="mt-3 text-[11px] leading-5 text-muted-foreground">Aegis replays what the detector measured. Every finding needs human review before any conclusion.</p>
      </aside>
    </div>
  );
}
