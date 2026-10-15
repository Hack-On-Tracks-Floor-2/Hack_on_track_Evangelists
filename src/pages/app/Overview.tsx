import { Card, emit, num } from "@/components/app/Shell";
import { fetchLiveQuotes } from "@/lib/trace/fx";
import { getSelected, loadAll } from "@/lib/trace/store";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function Overview() {
  const [tick, setTick] = useState(0);
  const [fx, setFx] = useState<{ pair: string; mid: number; state: string }[]>([]);
  useEffect(() => {
    const f = () => setTick((t) => t + 1);
    window.addEventListener("trace:update", f);
    return () => window.removeEventListener("trace:update", f);
  }, []);
  useEffect(() => {
    fetchLiveQuotes(["USD/INR", "EUR/INR", "GBP/INR"]).then((r) =>
      setFx(r.quotes.map((q) => ({ pair: q.pair, mid: Math.round(q.mid * 100) / 100, state: r.state }))));
  }, []);

  const all = useMemo(() => loadAll(), [tick]);
  const ds = all.find((d) => d.id === getSelected()) ?? all[0];
  const txns = ds?.txns ?? [];
  const alerts = ds?.alerts ?? [];

  const byCur = useMemo(() => {
    const m = new Map<string, { n: number; v: number }>();
    txns.forEach((t) => { const e = m.get(t.currency) ?? { n: 0, v: 0 }; e.n++; e.v += t.amount; m.set(t.currency, e); });
    return [...m.entries()].map(([c, e]) => ({ c, ...e }));
  }, [ds]);
  const bySev = useMemo(() => {
    const order = ["critical", "high", "medium", "low"];
    return order.map((s) => ({ s, n: alerts.filter((a) => a.severity === s).length }));
  }, [ds]);
  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    alerts.forEach((a) => m.set(a.category, (m.get(a.category) ?? 0) + 1));
    return [...m.entries()].map(([c, n]) => ({ c, n }));
  }, [ds]);
  const trend = useMemo(() => {
    if (!txns.length) return [];
    const sorted = [...txns].sort((a, b) => a.epoch - b.epoch);
    const buckets = new Map<string, number>();
    sorted.forEach((t) => { const k = new Date(t.epoch).toISOString().slice(0, 10); buckets.set(k, (buckets.get(k) ?? 0) + 1); });
    const keys = [...buckets.keys()].sort().slice(-20);
    return keys.map((k) => ({ d: k.slice(5), n: buckets.get(k)! }));
  }, [ds]);

  if (!ds) {
    return (
      <Card className="p-10 text-center">
        <p className="text-sm font-semibold">No dataset yet</p>
        <p className="mx-auto mt-2 max-w-md text-[13px] leading-6 text-neutral-500">Upload a CSV or generate a synthetic set to populate this compliance overview.</p>
        <div className="mt-5 flex justify-center gap-2">
          <Link to="/datasets" className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white">Upload CSV</Link>
          <Link to="/studio" className="rounded-md border border-neutral-300 px-4 py-2 text-sm">Open Studio</Link>
        </div>
      </Card>
    );
  }

  const dom = txns.filter((t) => t.origin_country === "IN" && t.dest_country === "IN");
  const intl = txns.length - dom.length;
  const accts = new Set([...txns.map((t) => t.sender), ...txns.map((t) => t.receiver)]).size;
  const metrics = [
    ["Transactions", num(txns.length)], ["Accounts", num(accts)],
    ["Domestic", num(dom.length)], ["International", num(intl)],
    ["Alerts", num(alerts.length)], ["High / Critical", num(alerts.filter((a) => a.severity === "high" || a.severity === "critical").length)],
    ["Quality warnings", num(ds.report.warnings.length)], ["Tier", `Tier ${ds.tier}`],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="rounded-full border border-neutral-300 bg-white px-3 py-1 font-medium">{ds.name}</span>
        <span className="text-neutral-500">{num(txns.length)} records · {ds.source} · readiness Tier {ds.tier}</span>
        <Link to={`/datasets/${ds.id}`} className="ml-auto underline underline-offset-4">Dataset detail →</Link>
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200 md:grid-cols-4">
        {metrics.map(([k, v]) => (
          <div key={k} className="bg-white px-4 py-3.5">
            <p className="text-[11px] uppercase tracking-wider text-neutral-400">{k}</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums">{v}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <p className="text-[13px] font-semibold">Volume trend</p>
          <p className="text-xs text-neutral-500">Daily transaction counts, actual data</p>
          <div className="mt-2 h-52">
            <ResponsiveContainer>
              <BarChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
                <XAxis dataKey="d" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} width={36} />
                <Tooltip />
                <Bar dataKey="n" fill="#171717" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-[13px] font-semibold">Alerts by severity</p>
          <div className="mt-2 h-52">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={bySev} dataKey="n" nameKey="s" innerRadius={42} outerRadius={70} paddingAngle={2}>
                  {bySev.map((e, i) => <Cell key={i} fill={["#171717", "#525252", "#a3a3a3", "#e5e5e5"][i % 4]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 space-y-1 text-xs tabular-nums">
            {bySev.map((e) => <div key={e.s} className="flex justify-between"><span className="capitalize text-neutral-500">{e.s}</span><span>{e.n}</span></div>)}
          </div>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4">
          <p className="text-[13px] font-semibold">Value by currency</p>
          <p className="text-xs text-neutral-500">Original amounts — never summed across currencies</p>
          <div className="mt-2 space-y-2 text-[13px] tabular-nums">
            {byCur.slice(0, 6).map((r) => (
              <div key={r.c} className="flex justify-between border-b border-neutral-100 pb-1.5">
                <span className="font-medium">{r.c} <span className="font-normal text-neutral-400">· {num(r.n)}</span></span>
                <span>{r.v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
              </div>
            ))}
            {byCur.length === 0 && <p className="text-neutral-400">No data.</p>}
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-[13px] font-semibold">Findings by category</p>
          <div className="mt-2 space-y-2 text-[13px]">
            {byCat.map((r) => (
              <div key={r.c} className="flex items-center gap-2">
                <span className="w-28 truncate text-neutral-500">{r.c}</span>
                <div className="h-1.5 flex-1 rounded bg-neutral-100"><div className="h-1.5 rounded bg-neutral-800" style={{ width: `${Math.min(100, (r.n / Math.max(1, alerts.length)) * 100)}%` }} /></div>
                <span className="tabular-nums">{r.n}</span>
              </div>
            ))}
            {byCat.length === 0 && <p className="text-neutral-400 text-[13px]">No alerts yet — run detection.</p>}
          </div>
          <Link to="/detections" className="mt-3 inline-block text-[13px] underline underline-offset-4">Review detections →</Link>
        </Card>
        <Card className="p-4">
          <p className="text-[13px] font-semibold">FX snapshot</p>
          <p className="text-xs text-neutral-500">Genuine provider quotes</p>
          <div className="mt-2 space-y-2 text-[13px] tabular-nums">
            {fx.map((q) => <div key={q.pair} className="flex justify-between"><span>{q.pair}</span><span>{q.mid} <span className="text-[11px] text-neutral-400">{q.state}</span></span></div>)}
            {fx.length === 0 && <p className="text-neutral-400">Fetching…</p>}
          </div>
          <Link to="/fx-market" className="mt-3 inline-block text-[13px] underline underline-offset-4">Open FX market →</Link>
        </Card>
      </div>
    </div>
  );
}
