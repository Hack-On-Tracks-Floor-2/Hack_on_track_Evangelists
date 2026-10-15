import { Card, Empty, FeedDown, PanelTitle, StatusDot, btnGhost, btnPrimary, inputCls } from "@/components/app/Shell";
import { PAIRS, convert, fetchHistory, fetchLiveQuotes, type Quote } from "@/lib/trace/fx";
import { download } from "@/lib/trace/store";
import { toCSV } from "@/lib/trace/csv";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

function useQuotes(pairs: string[] = PAIRS) {
  return useQuery({
    queryKey: ["fx-quotes"],
    queryFn: () => fetchLiveQuotes(pairs),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function FxMarket() {
  const { data, isPending, isError, refetch, dataUpdatedAt } = useQuotes();
  const [sel, setSel] = useState("USD/INR");
  const [search, setSearch] = useState("");
  const [watch, setWatch] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem("trace.watch") ?? '["USD/INR","EUR/INR"]'); } catch { return ["USD/INR", "EUR/INR"]; } });
  const [range, setRange] = useState(60);
  const quotes = data?.quotes ?? [];
  const state = data?.state ?? (isPending ? "loading" : "unavailable");

  const histQ = useQuery({ queryKey: ["fx-hist", sel, range], queryFn: () => fetchHistory(sel, range) });
  const hist = histQ.data ?? [];
  const q = quotes.find((x) => x.pair === sel);
  const prev = hist.length > 1 ? hist[hist.length - 2].rate : null;
  const chg = q && prev ? q.mid - prev : null;
  const chgPct = q && prev && prev !== 0 ? (chg! / prev) * 100 : null;

  function toggleWatch(p: string) {
    const w = watch.includes(p) ? watch.filter((x) => x !== p) : [...watch, p];
    setWatch(w); localStorage.setItem("trace.watch", JSON.stringify(w));
  }

  return (
    <div className="space-y-3">
      {/* market header */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-[13px]">
        <StatusDot state={state} />
        <span className="text-muted-foreground">·</span>
        <span className="mono text-xs text-muted-foreground">{data?.provider ?? "connecting…"}</span>
        <span className="text-muted-foreground">·</span>
        <span className="tnum text-xs text-muted-foreground">last update {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : "—"}</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-xs text-muted-foreground">source ts {q?.sourceTime ?? "—"}</span>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search pairs…" className="ml-auto w-44 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs outline-none" aria-label="Search pairs" />
        <button onClick={() => refetch()} className={btnGhost}>Refresh</button>
      </div>
      {isError && quotes.length === 0 && <FeedDown onRetry={() => refetch()} />}

      <div className="grid gap-3 xl:grid-cols-5">
        {/* quote table */}
        <Card className="overflow-hidden xl:col-span-2">
          <PanelTitle title={`Live quote table (${PAIRS.filter((p) => p.toLowerCase().includes(search.toLowerCase())).length})`} sub="Bid/ask only when supplied · mid derived" />
          <div className="thin-scroll mt-1 max-h-[460px] overflow-y-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="sticky top-0 bg-card"><tr className="border-y border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                {["Pair", "Quote", "Bid", "Ask", "Spread", "Δ", "Status"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
              </tr></thead>
              <tbody>
                {PAIRS.filter((p) => p.toLowerCase().includes(search.toLowerCase())).map((p) => {
                  const qq = quotes.find((x) => x.pair === p);
                  const spr = qq?.bid && qq?.ask ? (((qq.ask - qq.bid) / qq.mid) * 10000).toFixed(1) : "—";
                  return (
                    <tr key={p} onClick={() => setSel(p)} className={`cursor-pointer border-b border-border/50 hover:bg-muted/40 ${sel === p ? "bg-[color:var(--primary)]/10" : ""}`}>
                      <td className="px-3 py-2 font-semibold">{p} <button onClick={(e) => { e.stopPropagation(); toggleWatch(p); }} className="ml-1 text-muted-foreground hover:text-foreground" title="Watchlist">{watch.includes(p) ? "★" : "☆"}</button></td>
                      <td className="tnum px-3 py-2 font-bold">{qq ? qq.mid.toFixed(4) : "—"}</td>
                      <td className="tnum px-3 py-2 text-muted-foreground">{qq?.bid?.toFixed(4) ?? "—"}</td>
                      <td className="tnum px-3 py-2 text-muted-foreground">{qq?.ask?.toFixed(4) ?? "—"}</td>
                      <td className="tnum px-3 py-2 text-muted-foreground">{spr}{spr === "—" ? "" : " bp"}</td>
                      <td className="tnum px-3 py-2">{p === sel && chgPct !== null ? <span className={chgPct >= 0 ? "text-[color:var(--success)]" : "text-[color:var(--destructive)]"}>{chgPct >= 0 ? "+" : ""}{chgPct.toFixed(2)}%</span> : <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-2">{qq ? <StatusDot state={qq.state} /> : <span className="text-xs text-muted-foreground">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        {/* pair panel */}
        <Card className="p-4 xl:col-span-3">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="text-lg font-bold">{sel}</p>
            <p className="tnum text-2xl font-bold">{q ? q.mid.toFixed(4) : "—"}</p>
            {chg !== null && chgPct !== null && (
              <p className={`tnum text-sm font-semibold ${chg >= 0 ? "text-[color:var(--success)]" : "text-[color:var(--destructive)]"}`}>
                {chg >= 0 ? "+" : ""}{chg.toFixed(4)} ({chgPct >= 0 ? "+" : ""}{chgPct.toFixed(2)}%)
              </p>
            )}
            <button onClick={() => toggleWatch(sel)} className={`${btnGhost} ml-auto`}>{watch.includes(sel) ? "★ Watching" : "☆ Watch"}</button>
          </div>
          <p className="mono mt-1 text-[11px] text-muted-foreground">
            bid {q?.bid?.toFixed(4) ?? "—"} · ask {q?.ask?.toFixed(4) ?? "—"} · source {q?.source ?? "—"} · source ts {q?.sourceTime ?? "—"} · received {q?.receivedAt.slice(11, 19) ?? "—"}
          </p>
          <div className="mt-2 flex gap-1 text-xs">
            {[14, 30, 60, 90].map((d) => (
              <button key={d} onClick={() => setRange(d)} className={`rounded px-2 py-1 ${range === d ? "bg-muted font-semibold" : "text-muted-foreground"}`}>{d}D</button>
            ))}
            <span className="self-center text-[11px] text-muted-foreground">ECB daily reference — not intraday ticks</span>
          </div>
          <div className="mt-1 h-64">
            {hist.length > 1 ? (
              <ResponsiveContainer>
                <LineChart data={hist}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickFormatter={(d: string) => d.slice(5)} minTickGap={28} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} width={56} domain={["auto", "auto"]} tickFormatter={(v: number) => v.toFixed(2)} />
                  <Tooltip contentStyle={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} labelFormatter={(d) => `Date ${d}`} formatter={(v) => [`${Number(v).toFixed(4)}`, "Rate"]} />
                  <Line type="monotone" dataKey="rate" stroke="#5B8CFF" strokeWidth={1.5} dot={false} />
                  <ReferenceDot x={hist[hist.length - 1].date} y={hist[hist.length - 1].rate} r={3} fill="#26C6B8" stroke="none" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-center">
                <p className="max-w-sm text-[13px] text-muted-foreground">No historical observations are available for this currency pair and time range. {histQ.isError ? "The reference source could not be reached." : "Loading…"}</p>
              </div>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={() => download(`${sel}-history.csv`, toCSV(hist.map((h) => ({ date: h.date, rate: h.rate, source: "frankfurter-ecb-reference" }))))} disabled={hist.length === 0} className={`${btnGhost} disabled:opacity-40`}>Export actual data</button>
            <span className="self-center text-[11px] text-muted-foreground">Watchlist: {watch.join(", ") || "—"}</span>
          </div>
        </Card>
      </div>
      {/* quote update stream */}
      <Card>
        <PanelTitle title="Observed quote stream" sub="Only genuine provider observations — rows appear on successful polls, never animated" />
        <div className="mono space-y-1 px-4 py-3 text-[11px] text-muted-foreground">
          {quotes.slice(0, 6).map((x: Quote) => (
            <p key={x.pair}>{new Date().toISOString().slice(11, 19)} · {x.pair} {x.mid.toFixed(4)} · src {x.sourceTime ?? "n/a"} · {x.state}</p>
          ))}
          {quotes.length === 0 && <p>No observations yet.</p>}
        </div>
      </Card>
    </div>
  );
}

export function FxConverter() {
  const { data } = useQuotes();
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("INR");
  const [amt, setAmt] = useState("1000");
  const [fee, setFee] = useState("0");
  const [mode, setMode] = useState<"market" | "reference">("market");
  const [refRate, setRefRate] = useState("");
  const [basket, setBasket] = useState<{ c: string; a: string }[]>([{ c: "EUR", a: "500" }, { c: "GBP", a: "250" }]);
  const [log, setLog] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem("trace.fxlog") ?? "[]"); } catch { return []; } });
  const quotes = data?.quotes ?? [];
  const state = data?.state ?? "loading";

  const cur2usd: Record<string, number> = useMemo(() => {
    const m: Record<string, number> = { USD: 1 };
    quotes.forEach((x) => { const [, qq] = x.pair.split("/"); if (x.pair.startsWith("USD/")) m[qq] = x.mid; });
    return m;
  }, [quotes]);
  const marketRate = from === to ? 1 : (from === "USD" ? 1 : 1 / (cur2usd[from] ?? NaN)) * (to === "USD" ? 1 : (cur2usd[to] ?? NaN));
  const rate = mode === "market" ? marketRate : Number(refRate);
  const valid = Number.isFinite(rate) && rate > 0;
  const gross = valid ? convert(parseFloat(amt || "0"), rate) : 0;
  const net = Math.max(0, gross - parseFloat(fee || "0"));

  function record() {
    if (!valid) return;
    const line = `${amt} ${from} → ${net} ${to} @ ${rate.toFixed(6)} [${mode}, ${state}, ${new Date().toISOString()}]`;
    const l = [line, ...log].slice(0, 20);
    setLog(l); localStorage.setItem("trace.fxlog", JSON.stringify(l));
  }

  const CURS = ["USD", "EUR", "GBP", "AED", "SGD", "JPY", "AUD", "CAD", "INR"];
  const basketTotal = basket.reduce((s, b) => {
    const r = b.c === to ? 1 : (b.c === "USD" ? 1 : 1 / (cur2usd[b.c] ?? NaN)) * (to === "USD" ? 1 : (cur2usd[to] ?? NaN));
    return s + (Number.isFinite(r) && r > 0 ? convert(parseFloat(b.a || "0"), r) : 0);
  }, 0);

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <Card className="p-5">
        <PanelTitle title="Conversion workbench" sub="Source Amount × Destination Units per Source Unit = Converted Amount" />
        <div className="mt-3 flex gap-1 text-xs">
          <button onClick={() => setMode("market")} className={`rounded px-2.5 py-1.5 ${mode === "market" ? "bg-muted font-semibold" : "text-muted-foreground"}`}>Market quote</button>
          <button onClick={() => setMode("reference")} className={`rounded px-2.5 py-1.5 ${mode === "reference" ? "bg-muted font-semibold" : "text-muted-foreground"}`}>Historical / reference rate</button>
        </div>
        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <label className="text-xs text-muted-foreground">From<select value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} mt-1`}>{CURS.map((c) => <option key={c}>{c}</option>)}</select></label>
          <button onClick={() => { setFrom(to); setTo(from); }} className={btnGhost} title="Swap currencies">⇄</button>
          <label className="text-xs text-muted-foreground">To<select value={to} onChange={(e) => setTo(e.target.value)} className={`${inputCls} mt-1`}>{CURS.map((c) => <option key={c}>{c}</option>)}</select></label>
        </div>
        {mode === "reference" && (
          <label className="mt-2 block text-xs text-muted-foreground">Reference rate (destination units per 1 source unit)<input value={refRate} onChange={(e) => setRefRate(e.target.value)} placeholder="e.g. 83.20 for USD→INR" inputMode="decimal" className={`${inputCls} mt-1 mono`} /></label>
        )}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-xs text-muted-foreground">Amount<input value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" className={`${inputCls} tnum mt-1`} /></label>
          <label className="text-xs text-muted-foreground">Fee (in {to})<input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" className={`${inputCls} tnum mt-1`} /></label>
        </div>
        <div className="mt-4 rounded-lg border border-border bg-background p-4 text-center">
          {valid ? (<>
            <p className="tnum text-2xl font-bold">{net.toLocaleString("en-IN", { maximumFractionDigits: 2 })} {to}</p>
            <p className="tnum mono mt-1 text-[11px] text-muted-foreground">1 {from} = {rate.toFixed(6)} {to} · gross {gross.toLocaleString()} · quote {mode} · {state}</p>
          </>) : <p className="text-sm text-muted-foreground">Rate unavailable for {from}→{to} under {mode} mode. No substitution is made.</p>}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button onClick={record} disabled={!valid} className={btnPrimary}>Record conversion</button>
          <span className="text-xs text-muted-foreground">Market quotes and reference rates are indicative — never guaranteed purchase prices.</span>
        </div>
      </Card>
      <div className="space-y-3">
        <Card className="p-5">
          <PanelTitle title={`Multi-currency basket → ${to}`} sub="Converted leg by leg at current market rates" />
          <div className="mt-2 space-y-1.5">
            {basket.map((b, i) => (
              <div key={i} className="flex gap-2">
                <select value={b.c} onChange={(e) => setBasket(basket.map((x, j) => j === i ? { ...x, c: e.target.value } : x))} className="w-24 rounded-md border border-input bg-background px-2 py-1.5 text-[13px]">{CURS.map((c) => <option key={c}>{c}</option>)}</select>
                <input value={b.a} onChange={(e) => setBasket(basket.map((x, j) => j === i ? { ...x, a: e.target.value } : x))} inputMode="decimal" className={`${inputCls} tnum`} />
                <button onClick={() => setBasket(basket.filter((_, j) => j !== i))} className={btnGhost}>Remove</button>
              </div>
            ))}
          </div>
          <button onClick={() => setBasket([...basket, { c: "USD", a: "100" }])} className={`${btnGhost} mt-2`}>Add currency</button>
          <p className="tnum mt-2 text-sm font-bold">Basket total: {basketTotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })} {to}</p>
        </Card>
        <Card className="p-5">
          <PanelTitle title="Conversion history" />
          <div className="mono mt-2 space-y-1.5 text-[11px] text-muted-foreground">{log.map((l, i) => <p key={i} className="border-b border-border/50 pb-1.5">{l}</p>)}{log.length === 0 && <p>None yet.</p>}</div>
        </Card>
      </div>
    </div>
  );
}
