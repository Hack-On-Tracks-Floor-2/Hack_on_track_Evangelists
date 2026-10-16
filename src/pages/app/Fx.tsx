import { Card, FeedDown, PanelTitle, StatusDot, btnGhost, btnPrimary, inputCls } from "@/components/app/Shell";
import { PAIRS, convert, fetchHistory, fetchLiveQuotes, type Quote } from "@/lib/trace/fx";
import { download } from "@/lib/trace/store";
import { toCSV } from "@/lib/trace/csv";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/** Shared pair selection: FX Market and FX History stay on the same currency pair. */
function loadSelPair(): string {
  try {
    const p = localStorage.getItem("trace.fx.pair");
    return p && PAIRS.includes(p) ? p : "USD/INR";
  } catch { return "USD/INR"; }
}
function saveSelPair(p: string) {
  try { localStorage.setItem("trace.fx.pair", p); } catch { /* quota */ }
}

function useQuotes(pairs: string[] = PAIRS) {
  return useQuery({
    queryKey: ["fx-quotes"],
    queryFn: () => fetchLiveQuotes(pairs),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/** Gradient monogram for a pair's base currency ("USD/INR" → "USD"). */
function PairMark({ pair, size = 44 }: { pair: string; size?: number }) {
  const base = pair.split("/")[0];
  return (
    <div className="grad-bg flex items-center justify-center rounded-xl p-px shadow-[0_8px_24px_-10px_rgba(139,92,246,0.75)]" style={{ width: size, height: size }}>
      <span className="display flex h-full w-full items-center justify-center rounded-[10px] bg-[#0b0a1a]/85 text-[10px] font-bold tracking-wide text-[#c4b5fd]">
        {base}
      </span>
    </div>
  );
}

function ChangePill({ chg, chgPct }: { chg: number; chgPct: number }) {
  const up = chg >= 0;
  return (
    <span className={`tnum inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-semibold ${up ? "bg-[color:var(--success)]/12 text-[color:var(--success)]" : "bg-[color:var(--destructive)]/12 text-[color:var(--destructive)]"}`}>
      {up ? "▲" : "▼"} {Math.abs(chg).toFixed(4)}
      <span className="opacity-80">({up ? "+" : ""}{chgPct.toFixed(2)}%)</span>
    </span>
  );
}

export function FxMarket() {
  const { data, isPending, isError, refetch, dataUpdatedAt } = useQuotes();
  const [sel, setSel] = useState(loadSelPair);
  const selectPair = (p: string) => { setSel(p); saveSelPair(p); };
  const [search, setSearch] = useState("");
  const [watch, setWatch] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem("trace.watch") ?? '["USD/INR","EUR/INR"]'); } catch { return ["USD/INR", "EUR/INR"]; } });
  const [range, setRange] = useState(60);
  const quotes = data?.quotes ?? [];
  const state = data?.state ?? (isPending ? "loading" : "unavailable");

  const histQ = useQuery({ queryKey: ["fx-hist", sel, range], queryFn: () => fetchHistory(sel, range) });
  const hist = useMemo(() => histQ.data ?? [], [histQ.data]);
  // Detailed graph analysis for the selected pair: period statistics + daily-change series.
  const period = useMemo(() => {
    if (hist.length < 2) return null;
    const rates = hist.map((h) => h.rate);
    const first = rates[0], last = rates[rates.length - 1];
    const hi = Math.max(...rates), lo = Math.min(...rates);
    const mean = rates.reduce((s, r) => s + r, 0) / rates.length;
    const vol = Math.sqrt(rates.reduce((s, r) => s + (r - mean) ** 2, 0) / rates.length);
    return { hi, lo, mean, vol, chgP: ((last - first) / first) * 100 };
  }, [hist]);
  const dailyBars = useMemo(() => hist.slice(1).map((h, i) => ({
    date: h.date,
    chg: ((h.rate - hist[i].rate) / hist[i].rate) * 100,
  })), [hist]);
  const q = quotes.find((x) => x.pair === sel);
  const prev = hist.length > 1 ? hist[hist.length - 2].rate : null;
  const chg = q && prev ? q.mid - prev : null;
  const chgPct = q && prev && prev !== 0 ? (chg! / prev) * 100 : null;
  const sprBp = q?.bid && q?.ask ? (((q.ask - q.bid) / q.mid) * 10000).toFixed(1) : null;

  function toggleWatch(p: string) {
    const w = watch.includes(p) ? watch.filter((x) => x !== p) : [...watch, p];
    setWatch(w); localStorage.setItem("trace.watch", JSON.stringify(w));
  }

  const shown = PAIRS.filter((p) => p.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-3">
      {/* ── Spotlight: selected pair ─────────────────────────── */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-x-7 gap-y-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <PairMark pair={sel} />
            <div>
              <p className="display text-lg font-bold leading-tight tracking-tight">
                {sel.split("/")[0]}<span className="text-muted-foreground">/</span><span className="text-[color:var(--teal)]">{sel.split("/")[1]}</span>
              </p>
              <div className="mt-0.5 flex items-center gap-2">
                <StatusDot state={state} />
                <span className="mono text-[10px] text-muted-foreground">{data?.provider ?? "connecting…"}</span>
              </div>
            </div>
          </div>

          <div>
            <p className="tnum display text-3xl font-bold leading-none tracking-tight">{q ? q.mid.toFixed(4) : "—"}</p>
            <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">mid rate</p>
          </div>

          {chg !== null && chgPct !== null && <ChangePill chg={chg} chgPct={chgPct} />}

          <div className="flex gap-5">
            {([
              { k: "Bid", v: q?.bid?.toFixed(4) ?? "—" },
              { k: "Ask", v: q?.ask?.toFixed(4) ?? "—" },
              { k: "Spread", v: sprBp ? `${sprBp} bp` : "—" },
            ]).map((s) => (
              <div key={s.k}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{s.k}</p>
                <p className="tnum mt-1 text-[13px] font-bold">{s.v}</p>
              </div>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search pairs…" className={`${inputCls} w-40`} aria-label="Search pairs" />
            <button onClick={() => refetch()} className={btnGhost}>Refresh</button>
            <button onClick={() => toggleWatch(sel)} className={btnGhost}>{watch.includes(sel) ? "★ Watching" : "☆ Watch"}</button>
          </div>
        </div>
        <div className="mono flex flex-wrap gap-x-5 gap-y-1 border-t border-border/60 bg-[color:var(--glass)] px-5 py-2 text-[10.5px] text-muted-foreground">
          <span>last update {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : "—"}</span>
          <span>source {q?.source ?? "—"}</span>
          <span>source ts {q?.sourceTime ?? "—"}</span>
          <span>received {q?.receivedAt.slice(11, 19) ?? "—"}</span>
        </div>
      </Card>

      {isError && quotes.length === 0 && <FeedDown onRetry={() => refetch()} />}

      <div className="grid gap-3 xl:grid-cols-5">
        {/* ── Quote table ────────────────────────────────────── */}
        <Card className="overflow-hidden xl:col-span-2">
          <PanelTitle title={`Live quotes (${shown.length})`} sub="Click a row to analyse it · star to watchlist" />
          <div className="thin-scroll mt-1 max-h-[520px] overflow-y-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="sticky top-0 bg-card">
                <tr className="border-y border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Pair</th>
                  <th className="px-3 py-2 text-right font-medium">Quote</th>
                  <th className="px-3 py-2 text-right font-medium">Bid</th>
                  <th className="px-3 py-2 text-right font-medium">Ask</th>
                  <th className="px-3 py-2 text-right font-medium">Spread</th>
                  <th className="px-3 py-2 text-right font-medium">Δ</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => {
                  const qq = quotes.find((x) => x.pair === p);
                  const spr = qq?.bid && qq?.ask ? (((qq.ask - qq.bid) / qq.mid) * 10000).toFixed(1) : "—";
                  const on = sel === p;
                  return (
                    <tr key={p} onClick={() => selectPair(p)}
                      className={`cursor-pointer border-b border-l-2 border-border/50 transition-colors hover:bg-[color:var(--glass-hi)] ${on ? "border-l-[color:var(--primary)] bg-[color:var(--primary)]/10" : "border-l-transparent"}`}>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-1.5">
                          <button onClick={(e) => { e.stopPropagation(); toggleWatch(p); }} className="text-muted-foreground transition-colors hover:text-[#fbbf24]" title="Watchlist" aria-label={`Watch ${p}`}>
                            {watch.includes(p) ? "★" : "☆"}
                          </button>
                          <span className="font-semibold tracking-tight">{p.split("/")[0]}</span>
                          <span className="text-muted-foreground">/</span>
                          <span className="text-muted-foreground">{p.split("/")[1]}</span>
                        </span>
                      </td>
                      <td className="tnum px-3 py-2 text-right font-bold">{qq ? qq.mid.toFixed(4) : "—"}</td>
                      <td className="tnum px-3 py-2 text-right text-muted-foreground">{qq?.bid?.toFixed(4) ?? "—"}</td>
                      <td className="tnum px-3 py-2 text-right text-muted-foreground">{qq?.ask?.toFixed(4) ?? "—"}</td>
                      <td className="tnum px-3 py-2 text-right text-muted-foreground">{spr}{spr === "—" ? "" : " bp"}</td>
                      <td className="px-3 py-2 text-right">
                        {on && chgPct !== null ? (
                          <span className={`tnum inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${chgPct >= 0 ? "bg-[color:var(--success)]/12 text-[color:var(--success)]" : "bg-[color:var(--destructive)]/12 text-[color:var(--destructive)]"}`}>
                            {chgPct >= 0 ? "+" : ""}{chgPct.toFixed(2)}%
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2">{qq ? <StatusDot state={qq.state} /> : <span className="text-xs text-muted-foreground">—</span>}</td>
                    </tr>
                  );
                })}
                {shown.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-[13px] text-muted-foreground">No pair matches “{search}”.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* ── Detailed analysis ──────────────────────────────── */}
        <Card className="xl:col-span-3">
          <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
            <div>
              <p className="display text-sm font-semibold tracking-tight">Detailed analysis</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{sel} · ECB daily reference — not intraday ticks</p>
            </div>
            <div className="flex items-center gap-0.5 rounded-full border border-border bg-[color:var(--glass)] p-0.5">
              {[14, 30, 60, 90].map((d) => (
                <button key={d} onClick={() => setRange(d)}
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${range === d ? "bg-[color:var(--primary)]/20 text-[#c4b5fd] shadow-[0_0_12px_-4px_rgba(167,139,250,0.8)]" : "text-muted-foreground hover:text-foreground"}`}>
                  {d}D
                </button>
              ))}
            </div>
          </div>

          <div className="mt-2 h-72 px-3">
            {hist.length > 1 ? (
              <ResponsiveContainer>
                <AreaChart data={hist}>
                  <defs>
                    <linearGradient id="fxmkt" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#5B8CFF" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#5B8CFF" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickFormatter={(d: string) => d.slice(5)} minTickGap={28} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} width={56} domain={["auto", "auto"]} tickFormatter={(v: number) => v.toFixed(2)} />
                  <Tooltip contentStyle={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} labelFormatter={(d) => `Date ${d}`} formatter={(v) => [`${Number(v).toFixed(4)}`, "Rate"]} />
                  <Area type="monotone" dataKey="rate" stroke="#5B8CFF" strokeWidth={1.75} fill="url(#fxmkt)" dot={false} />
                  <ReferenceDot x={hist[hist.length - 1].date} y={hist[hist.length - 1].rate} r={3.5} fill="#26C6B8" stroke="var(--card)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-center">
                <p className="max-w-sm text-[13px] text-muted-foreground">No historical observations are available for this currency pair and time range. {histQ.isError ? "The reference source could not be reached." : "Loading…"}</p>
              </div>
            )}
          </div>

          {period && (
            <div className="mt-3 grid grid-cols-2 gap-2 px-5 sm:grid-cols-5">
              {([
                { k: "Period Δ", v: `${period.chgP >= 0 ? "+" : ""}${period.chgP.toFixed(2)}%`, good: period.chgP >= 0 },
                { k: "High", v: period.hi.toFixed(4) },
                { k: "Low", v: period.lo.toFixed(4) },
                { k: "Mean", v: period.mean.toFixed(4) },
                { k: "Volatility σ", v: period.vol.toFixed(4) },
              ]).map((s) => (
                <div key={s.k} className="relative overflow-hidden rounded-xl border border-border bg-[color:var(--glass)] px-3.5 py-2.5">
                  <span className="absolute left-0 top-0 h-full w-[3px]" style={{ background: s.good === undefined ? "var(--primary)" : s.good ? "var(--success)" : "var(--destructive)" }} aria-hidden />
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{s.k}</p>
                  <p className={`tnum mt-1 text-[15px] font-bold ${s.good === undefined ? "" : s.good ? "text-[color:var(--success)]" : "text-[color:var(--destructive)]"}`}>{s.v}</p>
                </div>
              ))}
            </div>
          )}

          {dailyBars.length > 0 && (
            <div className="mt-3 px-5">
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

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-5 py-3">
            <span className="mono text-[11px] text-muted-foreground">Watchlist: {watch.join(", ") || "—"}</span>
            <div className="flex gap-2">
              <button onClick={() => download(`${sel}-history.csv`, toCSV(hist.map((h) => ({ date: h.date, rate: h.rate, source: "frankfurter-ecb-reference" }))))} disabled={hist.length === 0} className={`${btnGhost} disabled:opacity-40`}>Export CSV</button>
              <Link to="/fx/history" className={btnGhost}>Open FX History →</Link>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Quote stream ─────────────────────────────────────── */}
      <Card>
        <PanelTitle title="Observed quote stream" sub="Genuine provider observations only — appended on successful polls, never animated" />
        <div className="grid gap-2 px-4 py-3 sm:grid-cols-2 lg:grid-cols-3">
          {quotes.slice(0, 6).map((x: Quote) => (
            <div key={x.pair} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-[color:var(--glass)] px-3 py-2">
              <span className="text-[12px] font-semibold">{x.pair}</span>
              <span className="tnum text-[12px] font-bold">{x.mid.toFixed(4)}</span>
              <span className="mono text-[10px] text-muted-foreground">{x.sourceTime ?? "n/a"}</span>
              <StatusDot state={x.state} />
            </div>
          ))}
          {quotes.length === 0 && <p className="text-[13px] text-muted-foreground">No observations yet.</p>}
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
