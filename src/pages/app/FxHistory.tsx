import { Card, PanelTitle, Skeleton, StatusDot, btnGhost, inputCls } from "@/components/app/Shell";
import { PAIRS, fetchHistory, fetchLiveQuotes } from "@/lib/trace/fx";
import { download } from "@/lib/trace/store";
import { toCSV } from "@/lib/trace/csv";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function FxHistory() {
  const [pair, setPair] = useState("USD/INR");
  const [days, setDays] = useState(60);
  const [view, setView] = useState<"chart" | "table">("chart");
  const live = useQuery({ queryKey: ["fx-quotes"], queryFn: () => fetchLiveQuotes(PAIRS) });
  const hist = useQuery({ queryKey: ["fx-hist", pair, days], queryFn: () => fetchHistory(pair, days) });
  const rows = hist.data ?? [];
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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={pair} onChange={(e) => setPair(e.target.value)} className={`${inputCls} w-40`} aria-label="Currency pair">
          {PAIRS.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={`${inputCls} w-36`} aria-label="Date range">
          <option value={14}>Last 14 days</option><option value={30}>Last 30 days</option><option value={60}>Last 60 days</option><option value={90}>Last 90 days</option>
        </select>
        <span className="rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground">Source: Frankfurter / ECB daily reference</span>
        <StatusDot state={live.data?.state ?? "loading"} />
        <div className="ml-auto flex gap-1 text-xs">
          <button onClick={() => setView("chart")} className={`rounded px-2.5 py-1.5 ${view === "chart" ? "bg-muted font-semibold" : "text-muted-foreground"}`}>Chart</button>
          <button onClick={() => setView("table")} className={`rounded px-2.5 py-1.5 ${view === "table" ? "bg-muted font-semibold" : "text-muted-foreground"}`}>Table</button>
        </div>
        <button onClick={() => download(`${pair}-history.csv`, toCSV(rows.map((r) => ({ date: r.date, rate: r.rate, source: "frankfurter-ecb-reference" }))))} disabled={!rows.length} className={`${btnGhost} disabled:opacity-40`}>Export actual data</button>
      </div>
      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[["Latest", `${stats.last.rate.toFixed(4)} · ${stats.last.date}`], ["Change", `${chg! >= 0 ? "+" : ""}${chg!.toFixed(2)}%`],
            ["High", `${stats.max.rate.toFixed(4)} · ${stats.max.date}`], ["Low", `${stats.min.rate.toFixed(4)} · ${stats.min.date}`],
            ["Observations", `${rows.length} daily points`]].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-border bg-card px-4 py-2.5">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</p>
              <p className="tnum text-sm font-bold">{v}</p>
            </div>
          ))}
        </div>
      )}
      <Card>
        <PanelTitle title={`${pair} — daily reference history`} sub={rows.length ? `${rows[0]?.date} → ${rows[rows.length - 1]?.date} · each point timestamped` : "Awaiting source response"} />
        {view === "chart" ? (
          <div className="h-72 px-2 pb-3">
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
        ) : (
          <div className="thin-scroll max-h-96 overflow-y-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="sticky top-0 bg-card"><tr className="border-y border-border text-[11px] uppercase tracking-wider text-muted-foreground"><th className="px-4 py-2 font-medium">Date</th><th className="px-4 py-2 font-medium">Rate</th><th className="px-4 py-2 font-medium">Source</th></tr></thead>
              <tbody>{[...rows].reverse().map((r) => (
                <tr key={r.date} className="border-b border-border/50"><td className="tnum px-4 py-1.5">{r.date}</td><td className="tnum px-4 py-1.5 font-semibold">{r.rate.toFixed(4)}</td><td className="mono px-4 py-1.5 text-xs text-muted-foreground">frankfurter-ecb</td></tr>
              ))}</tbody>
            </table>
            {rows.length === 0 && <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">No historical observations are available for this currency pair and time range.</p>}
          </div>
        )}
      </Card>
    </div>
  );
}
