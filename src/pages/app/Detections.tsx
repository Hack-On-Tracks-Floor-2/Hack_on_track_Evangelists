import { Card, Empty, PanelTitle, RiskCharacter, SevBadge, Sparkline, btnGhost, btnPrimary, emit, fmtAxis, num, shortId } from "@/components/app/Shell";
import { download, getSelected, loadAll, saveAll } from "@/lib/trace/store";
import { toCSV, type NormalizedTxn } from "@/lib/trace/csv";
import { DEFAULT_RULES, runDetection, type Alert } from "@/lib/trace/detect";
import { announceAnalysis, readModelMeta } from "@/lib/trace/ml";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { useReviewStore } from "@/lib/trace/reviews";
import { toast } from "sonner";
import { motion, useReducedMotion } from "framer-motion";
import {
  ChevronRight, Download, EyeOff, History,
  Radar, Scale, Search, X,
} from "lucide-react";

/* One severity ladder for every signal surface on this page. */
const SEV_HEX: Record<string, string> = {
  critical: "#fb7185", high: "#fbbf24", medium: "#8b5cf6", low: "#2dd4bf",
};
const sevHex = (sev: string) => SEV_HEX[sev] ?? SEV_HEX.low;
const REV_COLOR: Record<string, string> = {
  new: "#60A5FA", reviewing: "var(--warning)", reviewed: "var(--success)",
  "false-positive": "var(--muted-foreground)", escalated: "var(--destructive)",
};
const ruleName = (a: Alert) => DEFAULT_RULES.find((r) => r.id === a.ruleId)?.name ?? a.ruleId;

function StatusPill({ status }: { status: string }) {
  const c = REV_COLOR[status] ?? "var(--muted-foreground)";
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10.5px] font-medium capitalize"
      style={{ color: c, borderColor: `color-mix(in srgb, ${c} 35%, transparent)`, background: `color-mix(in srgb, ${c} 10%, transparent)` }}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {status.replace("-", " ")}
    </span>
  );
}

/** Animated (or static) priority ring — the score read at a glance. */
function ScoreRing({ score: rawScore, size = 92, animate = true }: { score: number; size?: number; animate?: boolean }) {
  const reduce = useReducedMotion();
  const score = Math.round(rawScore); // whole numbers only — long decimals overflow the ring
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = score >= 80 ? "var(--destructive)" : score >= 60 ? "var(--warning)" : "var(--primary)";
  const offset = c - (Math.min(100, Math.max(0, score)) / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        {animate && !reduce ? (
          <motion.circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          />
        ) : (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="display tnum font-bold leading-none" style={{ fontSize: size < 56 ? 12 : 20 }}>{score}</span>
        {size >= 56 && <span className="mt-0.5 text-[8.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">priority</span>}
      </div>
    </div>
  );
}

export default function Detections() {
  const { id } = useParams();
  if (id) return <Workbench id={id} />;
  return <Explorer />;
}

/* ── Explorer ───────────────────────────────────────────────────────────── */

function Explorer() {
  const [sp, setSearchParams] = useSearchParams();
  const [qs, setQs] = useState(sp.get("q") ?? "");
  const [sev, setSev] = useState("");
  const [cat, setCat] = useState("");
  const [scope, setScope] = useState("");
  const [rev, setRev] = useState("");
  const [method, setMethod] = useState("");
  const [hi, setHi] = useState(false);
  const [drawer, setDrawer] = useState<Alert | null>(null);
  const [v, setV] = useState(0);
  const store = useReviewStore();
  const rv = useMemo(() => store.statusMap(), [store, v]);
  const q = qs.toLowerCase();

  // Keep the search shareable: the box drives ?q= in the URL (replace, no history spam).
  useEffect(() => { setSearchParams(qs ? { q: qs } : {}, { replace: true }); }, [qs, setSearchParams]);

  const ds = useMemo(() => { const a = loadAll(); return a.find((d) => d.id === getSelected()) ?? a[0]; }, [v]);
  const all = useMemo(() => loadAll(), [v]);
  const [dsId, setDsId] = useState("");

  const list = useMemo(() => {
    const src = dsId ? all.find((d) => d.id === dsId) : ds;
    if (!src) return [];
    const byId = new Map(src.txns.map((t) => [t.id, t]));
    return src.alerts.filter((a) => {
      if (sev && a.severity !== sev) return false;
      if (cat && a.category !== cat) return false;
      if (method && a.ruleId !== method) return false;
      if (rev && (rv[a.id] ?? "new") !== rev) return false;
      if (hi && !(a.severity === "high" || a.severity === "critical")) return false;
      if (scope === "domestic" || scope === "international") {
        const legs = a.txnIds.map((t) => byId.get(t)).filter((t) => t !== undefined);
        const dom = legs.some((t) => t.origin_country === "IN" && t.dest_country === "IN");
        const intl = legs.some((t) => !(t.origin_country === "IN" && t.dest_country === "IN"));
        if (scope === "domestic" && !dom) return false;
        if (scope === "international" && !intl) return false;
      }
      if (q && !(a.title + a.id + a.txnIds.join(" ") + a.entities.join(" ")).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [ds, all, dsId, sev, cat, method, rev, hi, scope, q, rv]);

  useEffect(() => {
    if (!drawer) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawer(null); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [drawer]);

  if (!ds) return <Card><Empty title="No dataset available" body="Upload a transaction CSV or generate a synthetic dataset to begin analysis." /></Card>;

  const shown = dsId ? all.find((d) => d.id === dsId) ?? ds : ds;
  const count = (f: (a: Alert) => boolean) => shown.alerts.filter(f).length;
  const isHi = (a: Alert) => a.severity === "high" || a.severity === "critical";
  const statDefs: { k: string; n: number; active: boolean; accent: string; onClick: () => void }[] = [
    { k: "Total Alerts", n: shown.alerts.length, active: !rev && !sev && !hi, accent: "var(--primary)", onClick: () => { setRev(""); setSev(""); setHi(false); } },
    { k: "High-Priority", n: count(isHi), active: hi, accent: "var(--destructive)", onClick: () => setHi(!hi) },
    { k: "New", n: count((a) => (rv[a.id] ?? "new") === "new"), active: rev === "new", accent: "#60A5FA", onClick: () => setRev(rev === "new" ? "" : "new") },
    { k: "Under Review", n: count((a) => (rv[a.id] ?? "new") === "reviewing"), active: rev === "reviewing", accent: "var(--warning)", onClick: () => setRev(rev === "reviewing" ? "" : "reviewing") },
    { k: "Closed Out", n: count((a) => ["false-positive", "escalated", "reviewed"].includes(rv[a.id] ?? "")), active: ["false-positive", "escalated", "reviewed"].includes(rev), accent: "var(--success)", onClick: () => setRev(rev ? "" : "reviewed") },
  ];
  const filtersActive = Boolean(sev || cat || scope || rev || method || hi || qs);
  const triaged = count((a) => (rv[a.id] ?? "new") !== "new");
  const triagePct = shown.alerts.length ? Math.round((triaged / shown.alerts.length) * 100) : 0;

  function rerun() {
    const allx = loadAll();
    const d = allx.find((x) => x.id === ds.id)!;
    d.alerts = announceAnalysis("monitoring job — " + d.name, runDetection(d.txns, d.rules));
    saveAll(allx); emit(); setV((x) => x + 1);
  }

  const selectCls = "rounded-full border border-input bg-[color:var(--glass)] px-3 py-1.5 text-xs text-foreground backdrop-blur-md transition-colors hover:border-[color:var(--glass-border-hi)]";

  return (
    <div className="space-y-4">
      {/* ── Signal counters — each tile is also a filter ── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {statDefs.map((s, i) => (
          <button key={s.k} onClick={s.onClick} aria-pressed={s.active} title={s.active ? "Click to clear this filter" : `Filter by ${s.k}`}
            className={`glass sheen lift relative overflow-hidden rounded-xl px-4 py-3 text-left transition-all duration-300 rise rise-${Math.min(i + 1, 6)} ${s.active ? "border-[color:var(--ring)]/60 shadow-[0_0_28px_-8px_rgba(139,92,246,0.6)]" : ""}`}>
            <span className="absolute left-0 top-0 h-full w-[3px]" style={{ background: s.accent }} aria-hidden />
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{s.k}</p>
            <p className="display tnum mt-0.5 text-xl font-bold">{s.n.toLocaleString("en-IN")}</p>
            <span className={`absolute right-3 top-3 h-2 w-2 rounded-full transition-all ${s.active ? "shadow-[0_0_10px_currentColor]" : "bg-muted"}`} style={s.active ? { background: s.accent, color: s.accent } : undefined} aria-hidden />
          </button>
        ))}
      </div>

      {/* ── Triage queue progress ── */}
      <div className="glass rise flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl px-4 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Triage queue</p>
        <span className="relative h-1.5 min-w-32 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <span className="absolute inset-y-0 left-0 rounded-full transition-all duration-700" style={{ width: `${triagePct}%`, background: "linear-gradient(90deg, #2dd4bf, #60a5fa)" }} />
        </span>
        <p className="text-[11px] text-muted-foreground">
          <span className="tnum font-semibold text-foreground">{triaged}</span> / {shown.alerts.length} triaged · <span className="tnum font-semibold text-foreground">{triagePct}%</span>
        </p>
      </div>

      {/* ── Filter bar ── */}
      <div className="glass rise flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2.5 text-[13px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={qs} onChange={(e) => setQs(e.target.value)}
            placeholder="Search alerts, entities, txn IDs…"
            className="w-64 rounded-full border border-input bg-[color:var(--glass-hi)] py-1.5 pl-9 pr-3 text-[13px] outline-none backdrop-blur-md transition-all placeholder:text-muted-foreground/60 focus:border-[color:var(--ring)]/60"
            aria-label="Search alerts"
          />
        </div>
        <select value={sev} onChange={(e) => setSev(e.target.value)} className={selectCls} aria-label="Priority"><option value="">All priorities</option><option value="critical">critical</option><option value="high">high</option><option value="medium">medium</option><option value="low">low</option></select>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className={selectCls} aria-label="Category"><option value="">All categories</option>{[...new Set(shown.alerts.map((a) => a.category))].map((c) => <option key={c}>{c}</option>)}</select>
        <select value={scope} onChange={(e) => setScope(e.target.value)} className={selectCls} aria-label="Scope"><option value="">Domestic + Intl</option><option value="domestic">Domestic</option><option value="international">International</option></select>
        <select value={dsId} onChange={(e) => setDsId(e.target.value)} className={selectCls} aria-label="Dataset"><option value="">Active dataset</option>{all.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <select value={rev} onChange={(e) => setRev(e.target.value)} className={selectCls} aria-label="Review status"><option value="">Any status</option><option value="new">new</option><option value="reviewing">reviewing</option><option value="reviewed">reviewed</option><option value="false-positive">false positive</option><option value="escalated">escalated</option></select>
        <select value={method} onChange={(e) => setMethod(e.target.value)} className={selectCls} aria-label="Method"><option value="">All methods</option>{[...new Set(shown.alerts.map((a) => a.ruleId))].map((c) => <option key={c}>{c}</option>)}</select>
        {filtersActive && (
          <button
            onClick={() => { setQs(""); setSev(""); setCat(""); setScope(""); setRev(""); setMethod(""); setHi(false); }}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-[color:var(--glass-hi)] hover:text-foreground"
            title="Clear all filters"
          >
            Clear <X className="h-3 w-3" />
          </button>
        )}
        <span className="self-center text-xs text-muted-foreground"><span className="tnum font-semibold text-foreground">{list.length}</span> of {shown.alerts.length}</span>
        <button onClick={rerun} className={`${btnPrimary} ml-auto py-1.5 text-xs`}>Run monitoring job</button>
      </div>

      {/* ── Signal cards ── */}
      <div className="space-y-2">
        {list.slice(0, 100).map((a) => (
          <button
            key={a.id} onClick={() => setDrawer(a)}
            className="group grid w-full grid-cols-[auto_1fr_auto] items-center gap-4 rounded-xl border border-border/60 bg-[color:var(--glass)] px-4 py-3 text-left backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-[color:var(--glass-border-hi)] hover:bg-[color:var(--glass-hi)]"
            style={{ borderLeft: `3px solid ${sevHex(a.severity)}` }}
            title="Open the quick view"
          >
            <RiskCharacter severity={a.severity} size={32} />
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <SevBadge sev={a.severity} />
                <p className="display truncate text-[13.5px] font-semibold tracking-tight">{a.title}</p>
              </div>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">
                {ruleName(a)} · {a.category} · <span className="mono">{a.id.slice(0, 16)}</span> · {a.txnIds.length} txns · {a.entities.length} entities
              </p>
              {a.evidence[0] && (
                <p className="mt-1 truncate text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground/80">{a.evidence[0].label}:</span> {a.evidence[0].value}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <StatusPill status={rv[a.id] ?? "new"} />
              <ScoreRing score={a.score} size={44} animate={false} />
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
          </button>
        ))}
        {list.length === 0 && (
          <Card>
            <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">No alerts match these filters. This does not guarantee that all activity is legitimate.</p>
          </Card>
        )}
        {list.length > 100 && (
          <p className="px-1 text-center text-[12px] text-muted-foreground">Showing the first 100 of {num(list.length)} matching alerts — refine the filters to narrow the queue.</p>
        )}
      </div>

      {drawer && <Drawer a={drawer} dsName={shown.name} rv={rv[drawer.id] ?? "new"} onClose={() => { setDrawer(null); setV((x) => x + 1); }} />}
    </div>
  );
}

/* ── Quick-view drawer ──────────────────────────────────────────────────── */

function Drawer({ a, dsName, rv, onClose }: { a: Alert; dsName: string; rv: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <aside className="thin-scroll relative h-full w-full max-w-md overflow-y-auto border-l border-border bg-[color:var(--elevated)]/95 backdrop-blur-2xl animate-in slide-in-from-right duration-300">
        {/* header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-[color:var(--elevated)]/90 px-6 py-4 backdrop-blur-xl">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Quick view</p>
            <p className="mono mt-0.5 truncate text-[13px] font-bold">{a.id}</p>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-[color:var(--glass-hi)] hover:text-foreground" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* hero: ring + title */}
        <div className="relative overflow-hidden border-b border-border px-6 py-5">
          <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full opacity-20 blur-3xl" style={{ background: sevHex(a.severity) }} aria-hidden />
          <div className="relative flex items-start gap-4">
            <ScoreRing score={a.score} size={84} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <SevBadge sev={a.severity} />
                <StatusPill status={rv} />
              </div>
              <h3 className="display mt-1.5 text-[15px] font-bold leading-6">{a.title}</h3>
              <p className="mt-1 text-[11px] text-muted-foreground">{ruleName(a)} · {a.category}</p>
            </div>
          </div>
        </div>

        {/* explanation + evidence */}
        <div className="border-b border-border px-6 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Why it was flagged</p>
          <p className="mt-1.5 text-[13px] leading-6 text-muted-foreground">{a.explanation}</p>
        </div>
        <div className="px-6 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Measured evidence ({a.evidence.length})</p>
          <div className="mt-2 space-y-1.5">
            {a.evidence.slice(0, 5).map((e, i) => (
              <div key={i} className="flex justify-between gap-3 rounded-lg border border-border/60 bg-[color:var(--glass)] px-3 py-2">
                <span className="text-[12px] text-muted-foreground">{e.label}</span>
                <span className="mono max-w-[60%] break-words text-right text-xs font-medium">{e.value}</span>
              </div>
            ))}
          </div>
          <p className="mono mt-3 text-[11px] text-muted-foreground">{a.txnIds.length} transactions · {dsName}</p>
          <div className="mt-4 flex gap-2">
            <Link to={`/detections/${a.id}`} className={btnPrimary + " flex-1"}>Open full workbench</Link>
            <button onClick={onClose} className={btnGhost}>Close</button>
          </div>
        </div>
      </aside>
    </div>
  );
}

/* ── Signal diagnostics radar ───────────────────────────────────────────── */

/** Four-axis diagnostic radar: real resolution/context ratios computed from the
 *  alert and dataset — descriptive, never a probability of guilt. */
function DiagnosticsRadar({ a, txns, entitiesResolved, model, hex }: {
  a: Alert; txns: NormalizedTxn[]; entitiesResolved: number; model: boolean; hex: string;
}) {
  const axes = [
    { label: "EVIDENCE", v: Math.min(1, a.evidence.length / 4), note: `${a.evidence.length} observations` },
    { label: "TRANSFERS", v: a.txnIds.length ? txns.length / a.txnIds.length : 0, note: `${txns.length}/${a.txnIds.length} resolved` },
    { label: "ENTITIES", v: a.entities.length ? entitiesResolved / a.entities.length : 0, note: `${entitiesResolved}/${a.entities.length} resolved` },
    { label: "MODEL", v: model ? 1 : 0.3, note: model ? "model scored" : "rules-only" },
  ];
  const size = 300, cx = 150, cy = 140, R = 76;
  const pt = (i: number, r: number) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length;
    return [cx + Math.cos(ang) * r * R, cy + Math.sin(ang) * r * R] as const;
  };
  const fmtPt = (i: number, r: number) => pt(i, r).map((n) => n.toFixed(1)).join(",");
  const shape = axes.map((d, i) => fmtPt(i, Math.max(0.08, d.v))).join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full" role="img" aria-label="Signal diagnostics — descriptive ratios">
        <title>Signal diagnostics — descriptive ratios</title>
        {[0.33, 0.66, 1].map((r) => (
          <polygon key={r} points={axes.map((_, i) => fmtPt(i, r)).join(" ")} fill="none" stroke="var(--border)" strokeWidth="1" />
        ))}
        {axes.map((_, i) => {
          const [x, y] = pt(i, 1);
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border)" strokeWidth="1" />;
        })}
        <polygon points={shape} fill={hex} fillOpacity="0.22" stroke={hex} strokeWidth="2" strokeLinejoin="round" />
        {axes.map((d, i) => {
          const [x, y] = pt(i, Math.max(0.08, d.v));
          return <circle key={d.label} cx={x} cy={y} r="3.5" fill={hex} stroke="var(--elevated)" strokeWidth="1.5" />;
        })}
        {axes.map((d, i) => {
          const [x, y] = pt(i, 1.26);
          return (
            <g key={d.label}>
              <text x={x} y={y} textAnchor="middle" fontSize="9.5" fill="var(--muted-foreground)" fontWeight="700" letterSpacing="0.08em">{d.label}</text>
              <text x={x} y={y + 13} textAnchor="middle" fontSize="9.5" fill="var(--foreground)" opacity="0.8">{d.note}</text>
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-center text-[11px] text-muted-foreground">Descriptive ratios — never a probability of guilt.</p>
    </div>
  );
}

/* ── Follow-the-money trail ─────────────────────────────────────────────── */

/** Ordered transfer trail: one glowing node per implicated transfer, bar length ∝ amount. */
function MoneyTrail({ txns, hex }: { txns: NormalizedTxn[]; hex: string }) {
  const reduce = useReducedMotion();
  const sorted = [...txns].sort((a, b) => a.epoch - b.epoch);
  const maxAmt = Math.max(1, ...sorted.map((t) => t.amount));
  return (
    <div className="relative space-y-2 pl-5">
      <span className="absolute bottom-3 left-[7px] top-3 w-px" style={{ background: `linear-gradient(180deg, ${hex}, transparent)` }} aria-hidden />
      {sorted.map((t, i) => (
        <motion.div
          key={t.id} className="relative"
          initial={reduce ? false : { opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.07 * i, duration: 0.4, ease: "easeOut" }}
        >
          <span className="absolute -left-[18px] top-3.5 h-2.5 w-2.5 rounded-full" style={{ background: hex, boxShadow: `0 0 10px ${hex}` }} aria-hidden />
          <div className="rounded-xl border border-border/60 bg-[color:var(--glass)] px-3 py-2 backdrop-blur-md">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="mono min-w-0 truncate text-[12px]" title={`${t.sender} → ${t.receiver}`}>
                {shortId(t.sender)} <span className="text-muted-foreground">→</span> {shortId(t.receiver)}
              </span>
              <span className="tnum whitespace-nowrap text-[12px] font-semibold">
                {t.amount.toLocaleString("en-IN")} <span className="text-[10px] font-normal text-muted-foreground">{t.currency}</span>
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="relative block h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(t.amount / maxAmt) * 100}%`, background: `linear-gradient(90deg, ${hex}, color-mix(in srgb, ${hex} 35%, transparent))` }} />
              </span>
              <span className="tnum whitespace-nowrap text-[10px] text-muted-foreground">
                {t.timestamp.slice(5, 16).replace("T", " ")} · {t.origin_country}→{t.dest_country}
              </span>
            </div>
          </div>
        </motion.div>
      ))}
      {sorted.length === 0 && <p className="py-4 text-center text-[13px] text-muted-foreground">No linked transfers survived dataset cleanup.</p>}
    </div>
  );
}

/** Where the flagged amounts sit inside this dataset — descriptive percentiles, never probabilities. */
function AmountContext({ txns, all, hex }: { txns: NormalizedTxn[]; all: NormalizedTxn[]; hex: string }) {
  const pool = new Map<string, number[]>();
  for (const t of all) {
    const arr = pool.get(t.currency);
    if (arr) arr.push(t.amount); else pool.set(t.currency, [t.amount]);
  }
  const byCcy = new Map<string, { pcts: number[]; poolN: number }>();
  for (const t of txns.slice(0, 30)) {
    const arr = pool.get(t.currency) ?? [];
    const pct = arr.length ? Math.round((arr.filter((x) => x <= t.amount).length / arr.length) * 100) : 0;
    const e = byCcy.get(t.currency) ?? { pcts: [] as number[], poolN: arr.length };
    e.pcts.push(pct); byCcy.set(t.currency, e);
  }
  const rows = [...byCcy.entries()].slice(0, 3);
  if (rows.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Amount context — percentile inside this dataset</p>
      <div className="mt-2.5 space-y-3">
        {rows.map(([ccy, { pcts, poolN }]) => {
          const maxP = Math.max(...pcts);
          return (
            <div key={ccy}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[11px] text-muted-foreground"><span className="mono font-semibold text-foreground">{ccy}</span> · {num(poolN)} transfers in pool</p>
                <p className="tnum text-[11px] text-muted-foreground">up to <span className="font-semibold text-foreground">P{maxP}</span></p>
              </div>
              <div className="relative mt-1.5 h-2 rounded-full" style={{ background: "linear-gradient(90deg, rgba(45,212,191,0.22), rgba(96,165,250,0.22), rgba(251,191,36,0.26), rgba(251,113,133,0.3))" }}>
                {pcts.slice(0, 6).map((p, i) => (
                  <span
                    key={i}
                    className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{ left: `${Math.min(98, Math.max(2, p))}%`, background: hex, boxShadow: `0 0 8px ${hex}` }}
                    title={`Flagged amount at P${p}`}
                    aria-hidden
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2.5 text-[11px] leading-5 text-muted-foreground">Descriptive context only — a high percentile means the amount is large relative to this file, not that it is suspicious.</p>
    </div>
  );
}

/* ── Full workbench ─────────────────────────────────────────────────────── */

function Workbench({ id }: { id: string }) {
  const [v, setV] = useState(0);
  const [note, setNote] = useState("");
  const { user } = useAuth();
  const store = useReviewStore();
  const actor = String(user?.email ?? "analyst");
  const [busy, setBusy] = useState(false);
  const reduce = useReducedMotion();
  const found = useMemo(() => {
    for (const d of loadAll()) {
      const a = d.alerts.find((x) => x.id === id);
      if (a) return { a, d };
    }
    return null;
  }, [id, v]);
  void v;
  if (!found) return <Card><Empty title="Alert not found" body="It may belong to a deleted dataset." action={<Link to="/detections" className={btnGhost}>Back to explorer</Link>} /></Card>;
  const { a, d } = found;
  const ns = store.notesOf(id);
  const txns = a.txnIds.map((t) => d.txns.find((x) => x.id === t)).filter((t): t is NormalizedTxn => t !== undefined);
  const hex = sevHex(a.severity);

  const winDates = txns.map((t) => t.timestamp.slice(0, 10)).sort();
  const window_ = winDates.length ? `${winDates[0]} → ${winDates[winDates.length - 1]}` : "—";

  // Per-person analysis: every named entity's FULL history in this dataset —
  // flow balance, counterparties, and daily activity rhythm — not just the
  // implicated transfers. One pass over the dataset per render (small data).
  const alertTxnSet = new Set(a.txnIds);
  const seed = a.entities.map((e) => ({ e, sent: 0, recv: 0, out: 0, in: 0, cp: new Set<string>(), daily: new Map<string, number>(), alertHits: 0 }));
  const byEntity = new Map(seed.map((s) => [s.e, s]));
  let totalVol = 0;
  for (const t of d.txns) {
    totalVol += t.amount;
    const day = t.timestamp.slice(0, 10);
    const s = byEntity.get(t.sender);
    if (s) {
      s.sent++; s.out += t.amount; s.cp.add(t.receiver);
      s.daily.set(day, (s.daily.get(day) ?? 0) + 1);
      if (alertTxnSet.has(t.id)) s.alertHits++;
    }
    const r = byEntity.get(t.receiver);
    if (r && r.e !== t.sender) {
      r.recv++; r.in += t.amount; r.cp.add(t.sender);
      r.daily.set(day, (r.daily.get(day) ?? 0) + 1);
      if (alertTxnSet.has(t.id)) r.alertHits++;
    }
  }
  const people = seed
    .map((s) => ({
      id: s.e, sent: s.sent, recv: s.recv, out: s.out, in: s.in,
      cps: s.cp.size, alertHits: s.alertHits,
      series: [...s.daily.keys()].sort().map((k) => s.daily.get(k) ?? 0),
      touchedShare: totalVol ? Math.min(1, (s.out + s.in) / (2 * totalVol)) : 0,
    }))
    .sort((x, y) => y.alertHits - x.alertHits || (y.sent + y.recv) - (x.sent + x.recv))
    .slice(0, 6);

  // Diagnostics inputs: how much of the signal resolves against the dataset.
  const datasetEntities = new Set<string>();
  for (const t of d.txns) { datasetEntities.add(t.sender); datasetEntities.add(t.receiver); }
  const entitiesResolved = a.entities.filter((e) => datasetEntities.has(e)).length;
  const confirmed = a.ruleId === "ml" && !!readModelMeta();
  const provenance = confirmed
    ? { label: "model-scored signal", color: "var(--success)" }
    : a.ruleId !== "ml"
      ? { label: "deterministic rule match", color: "#60A5FA" }
      : { label: "model signal — unconfirmed", color: "var(--warning)" };

  async function addNote() {
    if (!note.trim() || busy) return;
    const text = note.trim();
    setBusy(true);
    setNote(""); setV((x) => x + 1);
    const ok = await store.addNote(id, text, actor);
    setBusy(false);
    setV((x) => x + 1);
    if (ok) toast.success("Note shared with all reviewers");
    else toast.warning("Note saved on this device", { description: "Backend unreachable — it will sync when the connection returns." });
  }

  const fade = (delay: number) => (reduce ? {} : {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, delay, ease: "easeOut" as const },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to="/detections" className="inline-flex items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground">
          ← Alert explorer
        </Link>
        <Link to="/audit" className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground">
          <History className="h-3.5 w-3.5" /> Audit trail
        </Link>
      </div>

      {/* ── Hero: severity aurora + score ring + context chips ── */}
      <Card className="relative overflow-hidden">
        {!reduce && (
          <>
            <motion.div
              aria-hidden className="pointer-events-none absolute -top-24 left-12 h-64 w-64 rounded-full blur-[90px]"
              style={{ background: `radial-gradient(circle, ${hex}, transparent 70%)`, opacity: 0.3 }}
              animate={{ x: [0, 30, -15, 0], y: [0, 15, -10, 0], scale: [1, 1.08, 0.96, 1] }}
              transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              aria-hidden className="pointer-events-none absolute -bottom-20 right-16 h-56 w-56 rounded-full blur-[80px]"
              style={{ background: "radial-gradient(circle, #2dd4bf, transparent 70%)", opacity: 0.18 }}
              animate={{ x: [0, -25, 12, 0], scale: [1, 1.1, 0.94, 1] }}
              transition={{ duration: 17, repeat: Infinity, ease: "easeInOut" }}
            />
          </>
        )}
        <div className="relative flex flex-wrap items-center gap-6 px-6 py-6">
          <motion.div {...fade(0)}><ScoreRing score={a.score} size={112} /></motion.div>
          <motion.div className="min-w-0 flex-1" {...fade(0.08)}>
            <div className="flex flex-wrap items-center gap-2">
              <SevBadge sev={a.severity} />
              <span className="text-[11px] text-muted-foreground">{a.category} · rule <span className="mono">{a.ruleId} v1</span> · priority is a review rank, not a probability</span>
            </div>
            <h2 className="display mt-2 text-xl font-bold leading-tight tracking-tight">{a.title}</h2>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
              {[
                <span key="ds" className="rounded-full border border-border bg-[color:var(--glass)] px-2.5 py-1 text-muted-foreground">{d.name}</span>,
                <span key="add" className="rounded-full border border-border bg-[color:var(--glass)] px-2.5 py-1 text-muted-foreground">added {new Date(d.createdAt).toLocaleDateString()}</span>,
                <span key="tx" className="rounded-full border border-border bg-[color:var(--glass)] px-2.5 py-1 text-muted-foreground"><span className="tnum font-semibold text-foreground">{txns.length}</span> transfers</span>,
                <span key="en" className="rounded-full border border-border bg-[color:var(--glass)] px-2.5 py-1 text-muted-foreground"><span className="tnum font-semibold text-foreground">{a.entities.length}</span> entities</span>,
                <span key="ev" className="rounded-full border border-border bg-[color:var(--glass)] px-2.5 py-1 text-muted-foreground"><span className="tnum font-semibold text-foreground">{a.evidence.length}</span> observations</span>,
                <span key="win" className="rounded-full border border-border bg-[color:var(--glass)] px-2.5 py-1 text-muted-foreground">window <span className="mono">{window_}</span></span>,
              ]}
            </div>
          </motion.div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* ── Evidence column ── */}
        <div className="space-y-4 xl:col-span-2">
          <Card className="p-5">
            <PanelTitle title="Detection explanation" sub="What the rule saw, in plain language" />
            <p className="px-4 pt-2 text-[13px] leading-6 text-muted-foreground">{a.explanation}</p>
          </Card>

          {/* graphical analysis — follow-the-money trail + amount context */}
          <Card className="p-5">
            <PanelTitle title="Graphical analysis" sub="Follow the money · one node per implicated transfer, bar length ∝ amount" />
            <div className="mt-3">
              <MoneyTrail txns={txns} hex={hex} />
            </div>
            {txns.length > 1 && (
              <div className="mt-4 border-t border-dashed border-border pt-4">
                <AmountContext txns={txns} all={d.txns} hex={hex} />
              </div>
            )}
          </Card>

          {/* per-person graphical analysis */}
          <Card className="p-5">
            <PanelTitle title="Entity analysis" sub={`Every person in this signal · full activity in ${d.name}, not only the implicated transfers`} />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {people.map((p) => (
                <Link
                  key={p.id} to={`/entities/${encodeURIComponent(p.id)}`}
                  title={`Open ${p.id} in Entity Intelligence`}
                  className="group rounded-xl border border-border/60 bg-[color:var(--glass)] p-3 backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-[color:var(--glass-border-hi)] hover:bg-[color:var(--glass-hi)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="mono min-w-0 truncate text-[12px] font-semibold">{shortId(p.id)}</span>
                    <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                      {p.out > p.in ? "net sender" : p.in > p.out ? "net receiver" : "balanced"}
                    </span>
                  </div>
                  <div className="mt-2.5 grid grid-cols-3 gap-1 text-center">
                    {([
                      ["sent", p.sent, p.out],
                      ["received", p.recv, p.in],
                      ["peers", p.cps, p.alertHits],
                    ] as [string, number, number][]).map(([label, v1, v2]) => (
                      <div key={label} className="rounded-lg bg-muted/40 px-1 py-1.5">
                        <p className="display tnum text-[13px] font-bold leading-none">{num(v1)}</p>
                        <p className="mt-0.5 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
                        <p className="tnum text-[9.5px] leading-none text-muted-foreground">{label === "peers" ? `${v2} alerts` : fmtAxis(v2)}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2.5 flex items-end justify-between gap-2">
                    <Sparkline data={p.series.length > 1 ? p.series : [0, 0, 0]} color={hex} w={150} h={30} />
                    <p className="tnum text-right text-[10px] leading-tight text-muted-foreground">
                      {Math.round(p.touchedShare * 100)}%<br />of volume
                    </p>
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">daily activity · <span className="tnum">{p.series.length}</span> active day{p.series.length === 1 ? "" : "s"}</p>
                </Link>
              ))}
              {people.length === 0 && <p className="col-span-full py-3 text-center text-[13px] text-muted-foreground">No named entities on this signal.</p>}
            </div>
          </Card>

          {/* reading the signal — benign explanations beside hard limits */}
          <Card className="p-5">
            <PanelTitle title="Reading the signal" sub="What may be entirely benign — beside what this signal cannot tell you" />
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-[color:var(--teal)]/30 bg-[color:var(--teal)]/8 p-4 text-[13px] backdrop-blur-md">
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--teal)]"><Scale className="h-3.5 w-3.5" /> May be legitimate</p>
                <p className="mt-2 leading-6 text-foreground/90">{a.legitimate}</p>
                <p className="mt-2 border-t border-[color:var(--teal)]/25 pt-2 text-[11px] leading-5 text-muted-foreground">A rule cannot separate these from the flagged pattern — only context can.</p>
              </div>
              <div className="rounded-xl border border-[color:var(--warning)]/35 bg-[color:var(--warning)]/8 p-4 text-[13px] backdrop-blur-md">
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--warning)]"><EyeOff className="h-3.5 w-3.5" /> Cannot tell you</p>
                <p className="mt-2 leading-6 text-foreground/90">{a.limitations}</p>
                <p className="mt-2 border-t border-[color:var(--warning)]/25 pt-2 text-[11px] leading-5 text-muted-foreground">Know what this signal cannot tell you before escalating.</p>
              </div>
            </div>
          </Card>

          {/* evidence grid */}
          <Card className="p-5">
            <PanelTitle title="Measured evidence" sub={`${a.evidence.length} observations recorded by the rule`} />
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {a.evidence.map((e, i) => (
                <div key={i} className="rounded-xl border border-border/60 bg-[color:var(--glass)] px-3 py-2.5 backdrop-blur-md">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{e.label}</p>
                  <p className="mono mt-1 break-words text-[12.5px] font-medium">{e.value}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* supporting transfers */}
          <Card className="p-5">
            <PanelTitle
              title="Supporting transfers"
              sub={`${txns.length} records tie this signal to the ledger`}
              right={
                <button
                  onClick={() => download(`${a.id}-evidence.csv`, toCSV(txns.map((t) => ({ id: t.id, sender: t.sender, receiver: t.receiver, amount: t.amount, currency: t.currency, ts: t.timestamp }))))}
                  className={btnGhost}
                  title="Download these records as CSV"
                >
                  <Download className="h-3.5 w-3.5" /> Export evidence
                </button>
              }
            />
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {["ID", "Sender", "Receiver", "Amount", "Channel", "Route", "When"].map((h) => <th key={h} className="py-2 pr-3">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {txns.map((t) => (
                    <tr key={t.id} className="border-b border-border/40 transition-colors hover:bg-[color:var(--glass-hi)]">
                      <td className="mono py-1.5 pr-3 text-[color:var(--teal)]">{t.id}</td>
                      <td className="mono max-w-[150px] truncate py-1.5 pr-3" title={t.sender}>{shortId(t.sender)}</td>
                      <td className="mono max-w-[150px] truncate py-1.5 pr-3" title={t.receiver}>{shortId(t.receiver)}</td>
                      <td className="tnum py-1.5 pr-3 font-semibold">{t.amount.toLocaleString("en-IN")} <span className="text-[10px] text-muted-foreground">{t.currency}</span></td>
                      <td className="py-1.5 pr-3 text-muted-foreground">{t.channel}</td>
                      <td className="mono py-1.5 pr-3 text-muted-foreground">{t.origin_country}→{t.dest_country}</td>
                      <td className="tnum whitespace-nowrap py-1.5 pr-3 text-muted-foreground">{t.timestamp.slice(0, 16).replace("T", " ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

        </div>

        {/* ── Diagnostics (replaces the old review desk) ── */}
        <div className="space-y-4">
          <Card className="p-5">
            <PanelTitle
              title="Signal diagnostics"
              sub="Where this signal is strong — and where it is thin"
              right={<Radar className="h-4 w-4" style={{ color: hex }} aria-hidden />}
            />
            <div className="mt-3 flex justify-center">
              <span
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold"
                style={{ color: provenance.color, borderColor: `color-mix(in srgb, ${provenance.color} 35%, transparent)`, background: `color-mix(in srgb, ${provenance.color} 10%, transparent)` }}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden /> {provenance.label}
              </span>
            </div>
            <div className="mt-2">
              <DiagnosticsRadar a={a} txns={txns} entitiesResolved={entitiesResolved} model={confirmed} hex={hex} />
            </div>
          </Card>
          <Card className="p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Reviewer notes ({ns.length})</p>
            <div className="mt-2.5 space-y-2">
              {ns.map((n, i) => (
                <div key={i} className="relative rounded-xl border border-border/60 bg-[color:var(--glass)] p-3 pl-4 text-[13px] backdrop-blur-md">
                  <span className="absolute bottom-3 left-0 top-3 w-0.5 rounded-full" style={{ background: "var(--primary)" }} aria-hidden />
                  <p className="leading-6">{n.text}</p>
                  <p className="mono mt-1.5 text-[11px] text-muted-foreground">{n.actor || "unknown"} · {new Date(n.at).toLocaleString()}</p>
                </div>
              ))}
              {ns.length === 0 && (
                <div className="rounded-xl border border-dashed border-border/70 px-3 py-5 text-center">
                  <p className="text-[13px] text-muted-foreground">No notes yet — record what you checked so the next reviewer doesn't repeat it.</p>
                </div>
              )}
            </div>
            <div className="mt-3 flex gap-1.5">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" className="flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-[13px] outline-none transition-colors focus:border-[color:var(--ring)]/60" />
              <button onClick={addNote} disabled={busy} className={`${btnPrimary} disabled:opacity-50`}>Add</button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
