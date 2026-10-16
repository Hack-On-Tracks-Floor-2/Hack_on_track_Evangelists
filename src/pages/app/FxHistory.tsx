import { Card, PanelTitle, Skeleton, StatusDot, btnGhost, inputCls } from "@/components/app/Shell";
import { PAIRS, fetchHistory, fetchLiveQuotes } from "@/lib/trace/fx";
import { download } from "@/lib/trace/store";
import { toCSV } from "@/lib/trace/csv";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function FxHistory() {
  // Reads (and writes back) the shared pair so it stays in sync with FX Market.
  const [pair, setPair] = useState(() => {
    try { const p = localStorage.getItem("trace.fx.pair"); return p && PAIRS.includes(p) ? p : "USD/INR"; } catch { return "USD/INR"; }
  });
  const selectPair = (p: string) => {
    setPair(p);
    try { localStorage.setItem("trace.fx.pair", p); } catch { /* quota */ }
  };
  const [days, setDays] = useState(60);
  const [view, setView] = useState<"chart" | "table">("chart");
  const live = useQuery({ queryKey: ["fx-quotes"], queryFn: () => fetchLiveQuotes(PAIRS) });
  const hist = useQuery({ queryKey: ["fx-hist", pair, days], queryFn: () => fetchHistory(pair, days) });
  const rows = useMemo(() => hist.data ?? [], [hist.data]);
  const stats = rows.length ? {
    first: rows[0], last: rows[rows.length - 1],
    min: rows.reduce((a, b) => (b.rate < a.rate ? b : a)),
    max: rows.reduce((a, b) => (b.rate > a.rate ? b : a)),
  } : null;
  const chg = stats ? ((stats.last.rate - stats.first.rate) / stats.first.rate) * 100 : null;
  const hLoading = hist.isLoading;
  const hError = hist.isError ? ((hist.error as Error)?.message || "Source unreachable") : null;
  const withAvg = useMemo(() => rows.map((r, i) => {
    const win = rows.slice(Math.max(0, i - 6), i + 1);
    return { ...r, avg: win.reduce((s, x) => s + x.rate, 0) / win.length };
  }), [rows]);
  const dailyBars = useMemo(() => rows.slice(1).map((r, i) => ({
    date: r.date,
    chg: ((r.rate - rows[i].rate) / rows[i].rate) * 100,
  })), [rows]);
  const up = (chg ?? 0) >= 0;

  return (
    <div className="space-y-3">
      {/* ── Spotlight ────────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-x-7 gap-y-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grad-bg flex h-11 w-11 items-center justify-center rounded-xl p-px shadow-[0_8px_24px_-10px_rgba(139,92,246,0.75)]">
              <span className="display flex h-full w-full items-center justify-center rounded-[10px] bg-[#0b0a1a]/85 text-[10px] font-bold tracking-wide text-[#c4b5fd]">
                {pair.split("/")[0]}
              </span>
            </div>
            <div>
              <p className="display text-lg font-bold leading-tight tracking-tight">
                {pair.split("/")[0]}<span className="text-muted-foreground">/</span><span className="text-[color:var(--teal)]">{pair.split("/")[1]}</span>
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Daily reference history · Frankfurter / ECB</p>
            </div>
          </div>

          {stats && (
            <div>
              <p className="tnum display text-3xl font-bold leading-none tracking-tight">{stats.last.rate.toFixed(4)}</p>
              <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">latest · {stats.last.date}</p>
            </div>
          )}

          {stats && chg !== null && (
            <span className={`tnum inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-semibold ${up ? "bg-[color:var(--success)]/12 text-[color:var(--success)]" : "bg-[color:var(--destructive)]/12 text-[color:var(--destructive)]"}`}>
              {up ? "▲" : "▼"} {Math.abs(chg).toFixed(2)}%
            </span>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select value={pair} onChange={(e) => selectPair(e.target.value)} className={`${inputCls} w-36`} aria-label="Currency pair">
              {PAIRS.map((p) => <option key={p}>{p}</option>)}
            </select>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={`${inputCls} w-36`} aria-label="Date range">
              <option value={14}>Last 14 days</option><option value={30}>Last 30 days</option><option value={60}>Last 60 days</option><option value={90}>Last 90 days</option>
            </select>
            <StatusDot state={live.data?.state ?? "loading"} />
            <div className="flex items-center gap-0.5 rounded-full border border-border bg-[color:var(--glass)] p-0.5 text-xs">
              <button onClick={() => setView("chart")} className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${view === "chart" ? "bg-[color:var(--primary)]/20 text-[#c4b5fd] shadow-[0_0_12px_-4px_rgba(167,139,250,0.8)]" : "text-muted-foreground hover:text-foreground"}`}>Chart</button>
              <button onClick={() => setView("table")} className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${view === "table" ? "bg-[color:var(--primary)]/20 text-[#c4b5fd] shadow-[0_0_12px_-4px_rgba(167,139,250,0.8)]" : "text-muted-foreground hover:text-foreground"}`}>Table</button>
            </div>
            <button onClick={() => download(`${pair}-history.csv`, toCSV(rows.map((r) => ({ date: r.date, rate: r.rate, source: "frankfurter-ecb-reference" }))))} disabled={!rows.length} className={`${btnGhost} disabled:opacity-40`}>Export CSV</button>
          </div>
        </div>
        <div className="mono flex flex-wrap gap-x-5 gap-y-1 border-t border-border/60 bg-[color:var(--glass)] px-5 py-2 text-[10.5px] text-muted-foreground">
          <span>{rows.length ? `${rows[0].date} → ${rows[rows.length - 1].date}` : "awaiting source response"}</span>
          <span>{rows.length} observations</span>
          <span>ECB daily reference rates</span>
        </div>
      </Card>

      {/* ── KPI strip ────────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {([
            { k: "Latest", v: stats.last.rate.toFixed(4), s: stats.last.date },
            { k: "Period change", v: `${chg! >= 0 ? "+" : ""}${chg!.toFixed(2)}%`, s: `${stats.first.date} → ${stats.last.date}`, good: chg! >= 0 },
            { k: "High", v: stats.max.rate.toFixed(4), s: stats.max.date },
            { k: "Low", v: stats.min.rate.toFixed(4), s: stats.min.date },
            { k: "Observations", v: `${rows.length}`, s: "daily points" },
          ]).map((s) => (
            <div key={s.k} className="relative overflow-hidden rounded-xl border border-border bg-[color:var(--glass)] px-4 py-3">
              <span className="absolute left-0 top-0 h-full w-[3px]" style={{ background: s.good === undefined ? "var(--primary)" : s.good ? "var(--success)" : "var(--destructive)" }} aria-hidden />
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{s.k}</p>
              <p className={`tnum mt-1 text-lg font-bold ${s.good === undefined ? "" : s.good ? "text-[color:var(--success)]" : "text-[color:var(--destructive)]"}`}>{s.v}</p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={s.s}>{s.s}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Chart / table ────────────────────────────────────── */}
      <Card>
        <PanelTitle title={`${pair} — daily reference history`} sub={rows.length ? `Each point timestamped · 7-day average overlaid · high/low marked` : "Awaiting source response"} />
        {view === "chart" ? (
          <div className="px-3 pb-4">
            <div className="h-72">
              {hLoading ? (
                <Skeleton className="h-full w-full" />
              ) : hError ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                  <p className="text-sm font-semibold">History feed unavailable</p>
                  <p className="mono max-w-md break-words text-[11px] text-muted-foreground">{hError}</p>
                  <button onClick={() => hist.refetch()} className={`${btnGhost} mt-1 text-xs`}>Retry feed</button>
                </div>
              ) : rows.length > 1 ? (
                <ResponsiveContainer>
                  <ComposedChart data={withAvg}>
                    <defs>
                      <linearGradient id="fxg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#5B8CFF" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#5B8CFF" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickFormatter={(d: string) => d.slice(5)} minTickGap={30} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} width={56} domain={["auto", "auto"]} tickFormatter={(v: number) => v.toFixed(2)} />
                    <Tooltip contentStyle={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={(v, name) => [`${Number(v).toFixed(4)}`, name]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="rate" name="Daily reference" stroke="#5B8CFF" strokeWidth={1.75} fill="url(#fxg)" dot={false} />
                    <Line type="monotone" dataKey="avg" name="7-day average" stroke="#26C6B8" strokeWidth={1.25} strokeDasharray="4 3" dot={false} />
                    {stats && <ReferenceDot x={stats.max.date} y={stats.max.rate} r={3.5} fill="#F4B544" stroke="var(--card)" />}
                    {stats && <ReferenceDot x={stats.min.date} y={stats.min.rate} r={3.5} fill="#26C6B8" stroke="var(--card)" />}
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                  <p className="text-[13px] text-muted-foreground">No historical observations are available for this currency pair and time range.</p>
                  <button onClick={() => hist.refetch()} className={`${btnGhost} text-xs`}>Retry feed</button>
                </div>
              )}
            </div>
            {dailyBars.length > 0 && !hError && (
              <div className="mt-3 border-t border-border/60 pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Daily change (%)</p>
                <div className="mt-1 h-24">
                  <ResponsiveContainer>
                    <BarChart data={dailyBars} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                      <XAxis dataKey="date" hide />
                      <YAxis hide domain={["auto", "auto"]} />
                      <Tooltip
                        contentStyle={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                        labelFormatter={(d) => `Date ${d}`}
                        formatter={(v) => [`${Number(v).toFixed(4)}%`, "Change"]}
                        cursor={{ fill: "rgba(255,255,255,0.05)" }}
                      />
                      <Bar dataKey="chg">
                        {dailyBars.map((b) => <Cell key={b.date} fill={b.chg >= 0 ? "#34d399" : "#fb7185"} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="thin-scroll max-h-96 overflow-y-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="sticky top-0 bg-card"><tr className="border-y border-border text-[11px] uppercase tracking-wider text-muted-foreground"><th className="px-4 py-2 font-medium">Date</th><th className="px-4 py-2 text-right font-medium">Rate</th><th className="px-4 py-2 font-medium">Source</th></tr></thead>
              <tbody>{[...rows].reverse().map((r) => (
                <tr key={r.date} className="border-b border-border/50"><td className="tnum px-4 py-1.5">{r.date}</td><td className="tnum px-4 py-1.5 text-right font-semibold">{r.rate.toFixed(4)}</td><td className="mono px-4 py-1.5 text-xs text-muted-foreground">frankfurter-ecb</td></tr>
              ))}</tbody>
            </table>
            {rows.length === 0 && <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">No historical observations are available for this currency pair and time range.</p>}
          </div>
        )}
      </Card>
    </div>
  );
}
