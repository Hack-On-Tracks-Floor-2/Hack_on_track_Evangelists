import { Card } from "@/components/app/Shell";
import { PAIRS, convert, fetchHistory, fetchLiveQuotes, type Quote } from "@/lib/trace/fx";
import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function FxMarket() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [state, setState] = useState("loading");
  const [provider, setProvider] = useState("");
  const [watch, setWatch] = useState<string[]>(["USD/INR", "EUR/INR"]);
  const [sel, setSel] = useState("USD/INR");
  const [hist, setHist] = useState<{ date: string; rate: number }[]>([]);
  const [search, setSearch] = useState("");

  async function load() {
    const r = await fetchLiveQuotes(PAIRS);
    setQuotes(r.quotes); setState(r.state); setProvider(r.provider);
  }
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);
  useEffect(() => { fetchHistory(sel, 60).then(setHist); }, [sel]);

  const q = quotes.find((x) => x.pair === sel);

  return (
    <div className="space-y-4">
      <Card className={`p-3 text-[13px] ${state === "live" ? "border-neutral-200" : "border-amber-300 bg-amber-50"}`}>
        <span className={`mr-2 inline-block rounded px-2 py-0.5 text-xs font-medium ${state === "live" ? "bg-neutral-900 text-white" : "bg-amber-200"}`}>{state}</span>
        {provider} · refresh target 60s (provider cadence governs; values change only on new observations) · {q ? `source time ${q.sourceTime ?? "—"}` : ""}
        {state !== "live" && quotes.length === 0 && <span> — explicit unavailable state: no invented prices. Check network, then retry.</span>}
        <button onClick={load} className="ml-3 rounded border border-neutral-300 bg-white px-2 py-0.5 text-xs">Retry</button>
      </Card>
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="p-0 lg:col-span-2">
          <div className="border-b border-neutral-100 p-3"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search pairs…" className="w-full rounded border border-neutral-200 px-2.5 py-1.5 text-[13px]" /></div>
          <div className="max-h-[440px] overflow-auto">
            {PAIRS.filter((p) => p.toLowerCase().includes(search.toLowerCase())).map((p) => {
              const qq = quotes.find((x) => x.pair === p);
              return (
                <button key={p} onClick={() => setSel(p)} className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-[13px] tabular-nums hover:bg-neutral-50 ${sel === p ? "bg-neutral-100 font-semibold" : ""}`}>
                  <span>{p} <button onClick={(e) => { e.stopPropagation(); setWatch(watch.includes(p) ? watch.filter((x) => x !== p) : [...watch, p]); }} className="ml-1 text-neutral-400">{watch.includes(p) ? "★" : "☆"}</button></span>
                  <span>{qq ? qq.mid.toFixed(4) : "—"}</span>
                </button>
              );
            })}
          </div>
        </Card>
        <Card className="p-4 lg:col-span-3">
          <p className="text-sm font-semibold">{sel} {q && <span className="font-normal tabular-nums text-neutral-500">· mid {q.mid.toFixed(4)} · bid {q.bid?.toFixed(4)} · ask {q.ask?.toFixed(4)}</span>}</p>
          <p className="text-xs text-neutral-500">ECB reference history (daily observations — not intraday ticks). {hist.length ? `${hist.length} points, ${hist[0]?.date} → ${hist[hist.length - 1]?.date}` : "History unavailable — showing available range only."}</p>
          <div className="mt-2 h-64">
            <ResponsiveContainer>
              <LineChart data={hist}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} minTickGap={24} />
                <YAxis tick={{ fontSize: 10 }} width={52} domain={["auto", "auto"]} />
                <Tooltip />
                <Line type="monotone" dataKey="rate" stroke="#171717" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-neutral-500">Watchlist: {watch.join(", ") || "—"} · Mid is indicative only, never an executable offer.</p>
        </Card>
      </div>
    </div>
  );
}

export function FxConverter() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [state, setState] = useState("loading");
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("INR");
  const [amt, setAmt] = useState("1000");
  const [fee, setFee] = useState("0");
  const [log, setLog] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem("trace.fxlog") ?? "[]"); } catch { return []; } });

  useEffect(() => { fetchLiveQuotes().then((r) => { setQuotes(r.quotes); setState(r.state); }); }, []);

  const cur2usd: Record<string, number> = {};
  quotes.forEach((q) => {
    const [b, qq] = q.pair.split("/");
    if (b === "USD") cur2usd[qq] = q.mid;
  });
  cur2usd["USD"] = 1;
  // rate from→to = (to per USD) / (from per USD)
  const rate = from === to ? 1 : (from === "USD" ? 1 : 1 / (cur2usd[from] ?? NaN)) * (to === "USD" ? 1 : (cur2usd[to] ?? NaN));
  const valid = Number.isFinite(rate) && rate > 0;
  const gross = valid ? convert(parseFloat(amt || "0"), rate) : 0;
  const net = Math.max(0, gross - parseFloat(fee || "0"));

  function record() {
    if (!valid) return;
    const line = `${amt} ${from} → ${net} ${to} @ ${rate.toFixed(6)} (${state}, ${new Date().toISOString()})`;
    const l = [line, ...log].slice(0, 20);
    setLog(l); localStorage.setItem("trace.fxlog", JSON.stringify(l));
  }

  const CURS = ["USD", "EUR", "GBP", "AED", "SGD", "JPY", "AUD", "CAD", "INR"];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <p className="text-[13px] font-semibold">Conversion workbench</p>
        <p className="text-xs text-neutral-500">converted = amount × (destination per source) · quote direction validated</p>
        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <label className="text-xs">From<select value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full rounded border border-neutral-200 px-2 py-2 text-sm">{CURS.map((c) => <option key={c}>{c}</option>)}</select></label>
          <button onClick={() => { setFrom(to); setTo(from); }} className="rounded border border-neutral-200 px-2.5 py-2 text-sm" title="Swap">⇄</button>
          <label className="text-xs">To<select value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full rounded border border-neutral-200 px-2 py-2 text-sm">{CURS.map((c) => <option key={c}>{c}</option>)}</select></label>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-xs">Amount<input value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" className="mt-1 w-full rounded border border-neutral-200 px-2 py-2 text-sm tabular-nums" /></label>
          <label className="text-xs">Fee (in {to})<input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" className="mt-1 w-full rounded border border-neutral-200 px-2 py-2 text-sm tabular-nums" /></label>
        </div>
        <div className="mt-4 rounded-lg bg-neutral-50 p-4 text-center">
          {valid ? (<><p className="text-2xl font-semibold tabular-nums">{net.toLocaleString("en-IN", { maximumFractionDigits: 2 })} {to}</p>
            <p className="mt-1 text-xs tabular-nums text-neutral-500">1 {from} = {rate.toFixed(6)} {to} · gross {gross.toLocaleString()} · state: {state}</p></>)
            : <p className="text-sm text-neutral-500">Rate unavailable for {from}/{to} — provider coverage only. No substitution made.</p>}
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={record} disabled={!valid} className="rounded-md bg-neutral-900 px-4 py-2 text-[13px] text-white disabled:opacity-40">Record conversion</button>
          <span className="self-center text-xs text-neutral-500">Not executable · indicative only</span>
        </div>
      </Card>
      <Card className="p-5">
        <p className="text-[13px] font-semibold">Recent conversions</p>
        <div className="mt-2 space-y-1.5 font-mono text-xs">{log.map((l, i) => <p key={i} className="border-b border-neutral-100 pb-1.5">{l}</p>)}{log.length === 0 && <p className="font-sans text-neutral-400">None yet.</p>}</div>
      </Card>
    </div>
  );
}
