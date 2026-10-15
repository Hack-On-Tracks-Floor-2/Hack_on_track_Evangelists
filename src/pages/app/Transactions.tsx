import { Card, Empty, PanelTitle, ScoreBar, btnGhost, num, shortId } from "@/components/app/Shell";
import { download, getSelected, loadAll } from "@/lib/trace/store";
import { toCSV } from "@/lib/trace/csv";
import { DEFAULT_RULES } from "@/lib/trace/detect";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { ArrowRight, ChevronLeft, ChevronRight, Download, Search, ShieldCheck, X } from "lucide-react";

const PAGE = 25;

/* Severity typing — one ladder for every signal surface on this page
   (overview strip · row chips · drawer cards). */
const SEV_NAMES = ["low", "medium", "high", "critical"] as const;
const SEV_RANK: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };
const SEV_COLORS = ["var(--muted-foreground)", "#60A5FA", "var(--warning)", "var(--destructive)"];
const sevColor = (rank: number) => SEV_COLORS[Math.min(3, Math.max(0, rank))] ?? SEV_COLORS[0];
const sevTint = (color: string) => ({
  color,
  borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
  background: `color-mix(in srgb, ${color} 10%, transparent)`,
});

function statusColor(s: string) {
  const x = s.toLowerCase();
  if (x.includes("complet") || x === "settled" || x.includes("success")) return "var(--success)";
  if (x.includes("pend") || x.includes("process")) return "var(--warning)";
  if (x.includes("fail") || x.includes("reject") || x.includes("cancel")) return "var(--destructive)";
  return "var(--muted-foreground)";
}

const selectCls =
  "rounded-full border border-input bg-[color:var(--glass)] px-3 py-1.5 text-xs text-foreground backdrop-blur-md transition-colors hover:border-[color:var(--glass-border-hi)]";

export default function Transactions() {
  const params = new URLSearchParams(window.location.search);
  const [q, setQ] = useState(params.get("q") ?? "");
  const [channel, setChannel] = useState("");
  const [cur, setCur] = useState("");
  const [minAmt, setMinAmt] = useState("");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const ds = useMemo(() => { const a = loadAll(); return a.find((d) => d.id === getSelected()) ?? a[0]; }, []);

  const rows = useMemo(() => {
    if (!ds) return [];
    return ds.txns.filter((t) =>
      (!q || t.id.toLowerCase().includes(q.toLowerCase()) || t.sender.toLowerCase().includes(q.toLowerCase()) || t.receiver.toLowerCase().includes(q.toLowerCase())) &&
      (!channel || t.channel === channel) && (!cur || t.currency === cur) &&
      (!minAmt || t.amount >= Number(minAmt)));
  }, [ds, q, channel, cur, minAmt]);

  // One pass over every alert → per-transaction signal count + strongest severity.
  // Feeds the overview strip, the row chips and the drawer without re-scanning.
  const sigByTxn = useMemo(() => {
    const m = new Map<string, { n: number; rank: number }>();
    if (!ds) return m;
    for (const a of ds.alerts) {
      const r = SEV_RANK[a.severity] ?? 0;
      for (const id of a.txnIds) {
        const e = m.get(id) ?? { n: 0, rank: 0 };
        e.n++;
        if (r > e.rank) e.rank = r;
        m.set(id, e);
      }
    }
    return m;
  }, [ds]);

  // Signals overview for the current scope: flagged count + severity breakdown.
  const summary = useMemo(() => {
    let flagged = 0;
    const bySev = [0, 0, 0, 0];
    for (const t of rows) {
      const s = sigByTxn.get(t.id);
      if (s && s.n > 0) { flagged++; bySev[s.rank]++; }
    }
    return { flagged, bySev };
  }, [rows, sigByTxn]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  if (!ds) return <Card><Empty title="No dataset available" body="Upload a transaction CSV or generate a synthetic dataset to begin analysis." /></Card>;

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const slice = rows.slice(page * PAGE, page * PAGE + PAGE);
  const detail = open ? ds.txns.find((t) => t.id === open) : null;
  const signals = open ? ds.alerts.filter((a) => a.txnIds.includes(open)).sort((a, b) => b.score - a.score) : [];
  const pct = rows.length ? Math.round((summary.flagged / rows.length) * 100) : 0;
  const filtersActive = Boolean(q || channel || cur || minAmt);

  function exportFiltered() {
    download(`${ds.name}-transactions.csv`, toCSV(rows.slice(0, 5000).map((t) => ({ id: t.id, ts: t.timestamp, sender: t.sender, receiver: t.receiver, amount: t.amount, currency: t.currency, channel: t.channel, status: t.status }))));
    toast.success("Export started", { description: `${num(Math.min(rows.length, 5000))} filtered transfers saved as CSV.` });
  }
  function exportOne() {
    if (!detail) return;
    download(`${ds.name}-${detail.id}.json`, JSON.stringify({ txn: detail, signals }, null, 2), "application/json");
    toast.success("Record exported", { description: `${detail.id} saved with its ${signals.length} signal${signals.length === 1 ? "" : "s"}.` });
  }

  return (
    <div className="space-y-4">
      {/* ── Toolbar: search, scope filters, export ── */}
      <div className="glass rise flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }}
            placeholder="Search ID, sender, receiver…"
            className="w-72 rounded-full border border-input bg-[color:var(--glass-hi)] py-1.5 pl-9 pr-3 text-[13px] outline-none backdrop-blur-md transition-all placeholder:text-muted-foreground/60 focus:border-[color:var(--ring)]/60"
            aria-label="Search transactions"
          />
        </div>
        <select value={channel} onChange={(e) => { setChannel(e.target.value); setPage(0); }} className={selectCls} aria-label="Channel">
          <option value="">All channels</option>{[...new Set(ds.txns.map((t) => t.channel))].map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={cur} onChange={(e) => { setCur(e.target.value); setPage(0); }} className={selectCls} aria-label="Currency">
          <option value="">All currencies</option>{[...new Set(ds.txns.map((t) => t.currency))].map((c) => <option key={c}>{c}</option>)}
        </select>
        <input
          value={minAmt} onChange={(e) => { setMinAmt(e.target.value); setPage(0); }}
          placeholder="Min amount" inputMode="numeric"
          className="w-28 rounded-full border border-input bg-[color:var(--glass-hi)] px-3.5 py-1.5 text-[13px] outline-none backdrop-blur-md transition-all focus:border-[color:var(--ring)]/60"
          aria-label="Minimum amount"
        />
        {filtersActive && (
          <button
            onClick={() => { setQ(""); setChannel(""); setCur(""); setMinAmt(""); setPage(0); }}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-[color:var(--glass-hi)] hover:text-foreground"
            title="Clear search and filters"
          >
            Clear <X className="h-3 w-3" />
          </button>
        )}
        <button
          onClick={exportFiltered}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-[color:var(--glass)] px-3.5 py-1.5 text-[13px] backdrop-blur-md transition-all hover:border-[color:var(--glass-border-hi)] hover:bg-[color:var(--glass-hi)]"
          title="Download the current filter result as CSV (max 5,000 rows)"
        >
          <Download className="h-3.5 w-3.5" /> Export filtered (≤5k)
        </button>
      </div>

      {/* ── Signals overview: how much of this scope carries detections ── */}
      <div className="glass rise flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl px-4 py-3">
        {summary.flagged > 0 ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="display tnum text-xl font-bold tracking-tight" style={{ color: "var(--warning)" }}>{num(summary.flagged)}</span>
              <span className="text-xs text-muted-foreground">flagged of <span className="tnum font-semibold text-foreground">{num(rows.length)}</span> transfers in scope</span>
            </div>
            <span className="hidden h-4 w-px bg-border sm:block" aria-hidden />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {SEV_NAMES.map((s, i) => (summary.bySev[i] === 0 ? null : (
                <span key={s} className="inline-flex items-center gap-1.5 text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ background: SEV_COLORS[i] }} aria-hidden />
                  <span className="tnum font-semibold text-foreground">{summary.bySev[i]}</span>
                  <span className="capitalize text-muted-foreground">{s}</span>
                </span>
              )))}
            </div>
            <span className="ml-auto text-xs text-muted-foreground"><span className="tnum font-semibold text-foreground">{pct}%</span> of scope · <span className="tnum">{num(rows.length - summary.flagged)}</span> clean</span>
          </>
        ) : (
          <>
            <ShieldCheck className="h-4 w-4 shrink-0" style={{ color: "var(--success)" }} />
            <span className="text-[13px] text-muted-foreground">No detector signals in this scope — <span className="tnum font-semibold text-foreground">{num(rows.length)}</span> transfers are clear under the current rules.</span>
          </>
        )}
      </div>

      {/* ── Table ── */}
      <Card>
        <PanelTitle title="Transactions" sub={`${ds.name} · click any row for the exact record and its signals`} />
        <div className="overflow-x-auto">
          <table className="mt-2 w-full min-w-[860px] text-left text-[13px]">
            <thead>
              <tr className="border-y border-border text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <th className="px-3 py-2.5">Transaction</th>
                <th className="px-3 py-2.5">When</th>
                <th className="px-3 py-2.5">Route</th>
                <th className="px-3 py-2.5 text-right">Amount</th>
                <th className="px-3 py-2.5">Channel</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">Signals</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((t) => {
                const s = sigByTxn.get(t.id);
                const sigTitles = s && s.n > 0 ? ds.alerts.filter((a) => a.txnIds.includes(t.id)).map((a) => a.title).join(" · ") : "";
                const sel = open === t.id;
                return (
                  <tr
                    key={t.id}
                    onClick={() => setOpen(t.id)}
                    className={`cursor-pointer border-b border-border/40 transition-colors hover:bg-[color:var(--glass-hi)] ${sel ? "bg-[color:var(--glass-hi)] shadow-[inset_2px_0_0_var(--teal)]" : ""}`}
                  >
                    <td className="px-3 py-2.5"><span className="mono text-[12px] font-medium text-[color:var(--teal)]">{t.id}</span></td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <p className="tnum text-[12px] font-medium">{t.timestamp.slice(0, 10)}</p>
                      <p className="tnum text-[10px] text-muted-foreground">{t.timestamp.slice(11, 16)}</p>
                    </td>
                    <td className="max-w-[300px] px-3 py-2.5">
                      <p className="mono truncate text-[12px]" title={`${t.sender} → ${t.receiver}`}>
                        {shortId(t.sender)} <span className="text-muted-foreground">→</span> {shortId(t.receiver)}
                      </p>
                      <p className="mono text-[10px] text-muted-foreground">{t.origin_country} → {t.dest_country}</p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      <span className="tnum text-[13px] font-semibold">{t.amount.toLocaleString("en-IN")}</span>
                      <span className="ml-1 text-[10px] text-muted-foreground">{t.currency}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-block rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground">{t.channel}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] text-muted-foreground">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: statusColor(t.status) }} aria-hidden />
                        {t.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {s && s.n > 0 ? (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                          style={sevTint(sevColor(s.rank))}
                          title={sigTitles}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                          <span className="tnum">{s.n}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">No transactions match these filters.</p>}
        </div>
        {/* ── Pagination: range left, controls right ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
          <p className="tnum text-xs text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{rows.length === 0 ? 0 : page * PAGE + 1}–{page * PAGE + slice.length}</span> of {num(rows.length)}
          </p>
          <div className="flex items-center gap-2">
            <button disabled={page === 0} onClick={() => setPage(page - 1)} className={btnGhost + " disabled:opacity-40"}>
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </button>
            <span className="tnum px-1 text-xs text-muted-foreground">Page {page + 1} / {pages}</span>
            <button disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} className={btnGhost + " disabled:opacity-40"}>
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </Card>

      {/* ── Exact-record drawer ── */}
      {detail && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(null)} />
          <aside className="thin-scroll relative h-full w-full max-w-md overflow-y-auto border-l border-border bg-[color:var(--elevated)]/95 backdrop-blur-2xl animate-in slide-in-from-right duration-300">
            {/* header */}
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-[color:var(--elevated)]/90 px-6 py-4 backdrop-blur-xl">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Exact record</p>
                <p className="mono mt-0.5 truncate text-[15px] font-bold">{detail.id}</p>
              </div>
              <button onClick={() => setOpen(null)} className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-[color:var(--glass-hi)] hover:text-foreground" aria-label="Close record">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* amount hero + route */}
            <div className="border-b border-border px-6 py-5">
              <p className="display tnum text-3xl font-extrabold tracking-tight">
                {detail.amount.toLocaleString("en-IN")}
                <span className="ml-2 text-sm font-semibold text-muted-foreground">{detail.currency}</span>
              </p>
              <div className="mt-2.5 flex items-center gap-2 text-[12px]">
                <span className="mono min-w-0 truncate font-medium" title={detail.sender}>{shortId(detail.sender)}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="mono min-w-0 truncate font-medium" title={detail.receiver}>{shortId(detail.receiver)}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: statusColor(detail.status) }} aria-hidden />
                  {detail.status}
                </span>
                <span className="mono rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground">{detail.origin_country} → {detail.dest_country}</span>
                <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground">{detail.channel}</span>
              </div>
            </div>

            {/* field grid — micro-label over mono value */}
            <div className="grid grid-cols-2 gap-px border-b border-border bg-border">
              {([
                ["Timestamp", detail.timestamp.replace("T", " ").slice(0, 19)],
                ["Channel", detail.channel],
                ["Route", `${detail.origin_country} → ${detail.dest_country}`],
                ["Purpose", detail.purpose || "—"],
              ] as [string, string][]).map(([k, val]) => (
                <div key={k} className="min-w-0 bg-[color:var(--elevated)] px-6 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{k}</p>
                  <p className="mono mt-1 truncate text-[12px] font-medium" title={val}>{val}</p>
                </div>
              ))}
            </div>

            {/* detection signals — one card per rule hit, strongest first */}
            <div className="px-6 py-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Detection signals ({signals.length})</p>
              {signals.map((a) => {
                const rank = SEV_RANK[a.severity] ?? 0;
                return (
                  <Link
                    key={a.id}
                    to={`/detections/${a.id}`}
                    className="mt-2.5 block rounded-xl border border-border bg-[color:var(--glass)] p-3 backdrop-blur-md transition-colors hover:border-[color:var(--glass-border-hi)] hover:bg-[color:var(--glass-hi)]"
                    style={{ borderLeft: `3px solid ${sevColor(rank)}` }}
                    title="Open this signal in Detections"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize tracking-wide" style={sevTint(sevColor(rank))}>
                        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                        {a.severity}
                      </span>
                      <ScoreBar score={a.score} w={48} />
                    </div>
                    <p className="mt-2 text-[13px] font-semibold leading-snug">{a.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{DEFAULT_RULES.find((r) => r.id === a.ruleId)?.name ?? a.ruleId} · {a.category}</p>
                    {a.evidence.slice(0, 3).map((e, i) => (
                      <p key={i} className="mt-1 text-[12px] leading-5"><span className="text-muted-foreground">{e.label}:</span> <span className="tnum font-medium">{e.value}</span></p>
                    ))}
                    {a.evidence.length > 3 && <p className="mt-1 text-[11px] text-muted-foreground">+{a.evidence.length - 3} more observation{a.evidence.length - 3 === 1 ? "" : "s"}</p>}
                    <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: "var(--teal)" }}>
                      Open in Detections <ArrowRight className="h-3 w-3" />
                    </p>
                  </Link>
                );
              })}
              {signals.length === 0 && (
                <p className="mt-2 text-[13px] text-muted-foreground">No detector flagged this record under the current rules.</p>
              )}
            </div>

            {/* footer */}
            <div className="sticky bottom-0 flex gap-2 border-t border-border bg-[color:var(--elevated)]/90 px-6 py-3 backdrop-blur-xl">
              <button onClick={() => setOpen(null)} className={btnGhost + " flex-1"}>Close</button>
              <button onClick={exportOne} className={btnGhost + " flex-1"} title="Download this record with its signals as JSON">
                <Download className="h-3.5 w-3.5" /> Export record
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
