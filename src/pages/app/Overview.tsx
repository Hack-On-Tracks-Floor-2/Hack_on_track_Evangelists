import { Card, Empty, Kpi, PanelTitle, SevBadge, emit, fmtBig, num, shortId } from "@/components/app/Shell";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { getSelected, loadAll, setSelected } from "@/lib/trace/store";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

type Scope = "all" | "domestic" | "international";

export default function Overview() {
  const [tick, setTick] = useState(0);
  const [scope, setScope] = useState<Scope>("all");
  const [cur, setCur] = useState("");
  const [cat, setCat] = useState("");
  const [range, setRange] = useState("all");
  const [metric, setMetric] = useState<"count" | "value">("count");
  useEffect(() => {
    const f = () => setTick((t) => t + 1);
    window.addEventListener("trace:update", f);
    return () => window.removeEventListener("trace:update", f);
  }, []);

  const all = useMemo(() => loadAll(), [tick]);
  const ds = all.find((d) => d.id === getSelected()) ?? all[0];
  const inv = useQuery(api.trace.listInvestigations);
  const openInv = inv ? inv.filter((c) => c.status !== "closed").length : 0;

  const txns = useMemo(() => {
    if (!ds) return [];
    let t = ds.txns;
    if (scope === "domestic") t = t.filter((x) => x.origin_country === "IN" && x.dest_country === "IN");
    if (scope === "international") t = t.filter((x) => !(x.origin_country === "IN" && x.dest_country === "IN"));
    if (cur) t = t.filter((x) => x.currency === cur);
    if (range !== "all") {
      const days = Number(range);
      const cut = Date.now() - days * 86400e3;
      t = t.filter((x) => x.epoch >= cut);
    }
    return t;
  }, [ds, scope, cur, range]);

  const alerts = useMemo(() => {
    if (!ds) return [];
    return ds.alerts.filter((a) => (!cat || a.category === cat));
  }, [ds, cat]);

  const flaggedIds = useMemo(() => {
    const s = new Set<string>();
    alerts.forEach((a) => a.txnIds.forEach((id) => s.add(id)));
    return s;
  }, [alerts]);
  const hiIds = useMemo(() => {
    const s = new Set<string>();
    alerts.filter((a) => a.severity === "high" || a.severity === "critical").forEach((a) => a.txnIds.forEach((id) => s.add(id)));
    return s;
  }, [alerts]);

  const trend = useMemo(() => {
    const perCur = new Map<string, number>();
    txns.forEach((t) => perCur.set(t.currency, (perCur.get(t.currency) ?? 0) + 1));
    const topCur = [...perCur.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    const buckets = new Map<string, { d: string; n: number; v: number; f: number; h: number; tv: number }>();
    [...txns].sort((a, b) => a.epoch - b.epoch).forEach((t) => {
      const k = new Date(t.epoch).toISOString().slice(0, 10);
      const e = buckets.get(k) ?? { d: k.slice(5), n: 0, v: 0, f: 0, h: 0, tv: 0 };
      e.n++; e.v += t.amount;
      if (flaggedIds.has(t.id)) e.f++;
      if (hiIds.has(t.id)) e.h++;
      if (topCur && t.currency === topCur) e.tv += t.amount;
      buckets.set(k, e);
    });
    return [...buckets.values()].slice(-30);
  }, [txns, flaggedIds, hiIds]);

  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    alerts.forEach((a) => m.set(a.category, (m.get(a.category) ?? 0) + 1));
    return [...m.entries()].map(([c, n]) => ({ c, n }));
  }, [alerts]);

  const byCur = useMemo(() => {
    const m = new Map<string, { n: number; v: number }>();
    txns.forEach((t) => { const e = m.get(t.currency) ?? { n: 0, v: 0 }; e.n++; e.v += t.amount; m.set(t.currency, e); });
    return [...m.entries()].map(([c, e]) => ({ c, ...e })).sort((a, b) => b.n - a.n);
  }, [txns]);

  const byCh = useMemo(() => {
    const m = new Map<string, number>();
    txns.forEach((t) => { const k = t.channel || "unknown"; m.set(k, (m.get(k) ?? 0) + 1); });
    return [...m.entries()].map(([c, n]) => ({ c, n })).sort((a, b) => b.n - a.n).slice(0, 8);
  }, [txns]);

  const bySev = useMemo(() => {
    const m = new Map<string, number>();
    alerts.forEach((a) => m.set(a.severity, (m.get(a.severity) ?? 0) + 1));
    return (["critical", "high", "medium", "low"] as const).filter((s) => m.has(s)).map((s) => ({ s, n: m.get(s)! }));
  }, [alerts]);

  const domIntl = useMemo(() => {
    if (!ds) return [];
    const d = txns.filter((t) => t.origin_country === "IN" && t.dest_country === "IN");
    return [
      { k: "Domestic", n: d.length, v: d.reduce((s, t) => s + t.amount, 0) },
      { k: "Cross-border", n: txns.length - d.length, v: txns.reduce((s, t) => s + t.amount, 0) - d.reduce((s, t) => s + t.amount, 0) },
    ];
  }, [txns, ds]);

  if (!ds) {
    return (
      <Card>
        <Empty
          title="No dataset available"
          body="Upload a transaction CSV or generate a synthetic dataset to begin analysis."
          action={<Link to="/datasets" className="rounded-md bg-[color:var(--primary)] px-4 py-2 text-[13px] font-semibold text-white">Upload CSV</Link>}
        />
      </Card>
    );
  }

  const accts = new Set([...txns.map((t) => t.sender), ...txns.map((t) => t.receiver)]);
  const hi = alerts.filter((a) => a.severity === "high" || a.severity === "critical");
  const volSpark = trend.map((b) => b.n);
  const valSpark = trend.map((b) => Math.round(b.tv));
  const alertSpark = trend.map((b) => b.f);
  const hiSpark = trend.map((b) => b.h);

  const currencies = [...new Set(ds.txns.map((t) => t.currency))];
  const categories = [...new Set(ds.alerts.map((a) => a.category))];
  const COLORS = ["#8B5CF6", "#2DD4BF", "#FBBF24", "#FB7185", "#60A5FA", "#EC4899"];

  const seg = "px-3 py-1.5 capitalize transition-colors";
  return (
    <div className="space-y-5">
      {/* filter toolbar */}
      <div className="glass rise flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2.5">
        <div className="flex overflow-hidden rounded-full border border-border bg-[color:var(--glass)] text-[13px]">
          {(["all", "domestic", "international"] as Scope[]).map((s) => (
            <button key={s} onClick={() => setScope(s)} className={`${seg} ${scope === s ? "grad-bg font-semibold text-white shadow-[0_4px_16px_-6px_rgba(139,92,246,0.7)]" : "text-muted-foreground hover:bg-[color:var(--glass-hi)] hover:text-foreground"}`}>
              {s === "all" ? "All datasets" : s === "domestic" ? "Domestic India" : "International"}
          </button>
          ))}
        </div>
        <select value={ds.id} onChange={(e) => { setSelected(e.target.value); emit(); }} className="rounded-full border border-input bg-[color:var(--glass)] px-3 py-1.5 text-xs backdrop-blur-md transition-colors hover:border-[color:var(--glass-border-hi)]" aria-label="Selected dataset">
          {all.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={range} onChange={(e) => setRange(e.target.value)} className="rounded-full border border-input bg-[color:var(--glass)] px-3 py-1.5 text-xs backdrop-blur-md transition-colors hover:border-[color:var(--glass-border-hi)]" aria-label="Date range">
          <option value="all">All time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option>
        </select>
        <select value={cur} onChange={(e) => setCur(e.target.value)} className="rounded-full border border-input bg-[color:var(--glass)] px-3 py-1.5 text-xs backdrop-blur-md transition-colors hover:border-[color:var(--glass-border-hi)]" aria-label="Currency">
          <option value="">All currencies</option>{currencies.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded-full border border-input bg-[color:var(--glass)] px-3 py-1.5 text-xs backdrop-blur-md transition-colors hover:border-[color:var(--glass-border-hi)]" aria-label="Detection category">
          <option value="">All categories</option>{categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <span className="mono ml-auto hidden text-[11px] text-muted-foreground xl:block">original currencies · never summed across currencies</span>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        <div className="rise rise-1"><Kpi label="Transactions Analysed" value={num(txns.length)} sub={`tier ${ds.tier} · ${ds.source}`} spark={volSpark} /></div>
        <div className="rise rise-2"><Kpi label="Detection Alerts" value={num(alerts.length)} sub={`${byCat.length} categories`} spark={alertSpark} accent="var(--warning)" /></div>
        <div className="rise rise-3"><Kpi label="High-Priority Reviews" value={num(hi.length)} sub="high + critical" spark={hiSpark} accent="var(--destructive)" /></div>
        <div className="rise rise-4"><Kpi label="Connected Entities" value={num(accts.size)} sub="senders + receivers" /></div>
        <div className="rise rise-5"><Kpi label="Open Investigations" value={inv ? num(openInv) : "…"} sub="open · reviewing · escalated" /></div>
        <div className="rise rise-6"><Kpi label="Value (top currency)" value={byCur[0] ? fmtBig(byCur[0].v, byCur[0].c) : "—"} sub={byCur[0] ? `${num(byCur[0].n)} transfers · ${byCur[0].c} only` : "no data"} spark={valSpark} accent="var(--teal)" /></div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* activity */}
        <Card className="xl:col-span-2">
          <PanelTitle title="Transaction Activity" sub="Volume and value over time · hover for exact figures"
            right={<div className="flex overflow-hidden rounded-full border border-border text-xs">
              <button onClick={() => setMetric("count")} className={`px-2.5 py-1 transition-colors ${metric === "count" ? "grad-bg font-semibold text-white" : "text-muted-foreground hover:bg-[color:var(--glass-hi)]"}`}>Count</button>
              <button onClick={() => setMetric("value")} className={`px-2.5 py-1 transition-colors ${metric === "value" ? "grad-bg font-semibold text-white" : "text-muted-foreground hover:bg-[color:var(--glass-hi)]"}`}>Value</button>
            </div>} />
          <div className="h-64 px-2 pb-2 pt-2">
            <ResponsiveContainer>
              <ComposedChart data={trend}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="d" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} width={44} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} />
                <Tooltip contentStyle={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, backdropFilter: "blur(12px)" }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {metric === "count" ? (<>
                  <Bar dataKey="n" name="Transactions" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="f" name="Flagged in alerts" fill="#FB7185" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="h" name="High-priority" stroke="#FBBF24" strokeWidth={1.5} dot={false} />
                </>) : (
                  <Area dataKey="tv" name={`Value (${byCur[0]?.c ?? ""} only)`} fill="#2DD4BF" fillOpacity={0.25} stroke="#2DD4BF" strokeWidth={1.5} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
        {/* distribution */}
        <Card>
          <PanelTitle title="Detection Distribution" sub="Actual category totals · share of alerts" />
          <div className="relative h-52">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={byCat} dataKey="n" nameKey="c" innerRadius={56} outerRadius={80} paddingAngle={3} cornerRadius={4} stroke="var(--card)" strokeWidth={2}>
                  {byCat.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  formatter={(v, name) => [`${v} (${alerts.length ? Math.round((Number(v) / alerts.length) * 100) : 0}%)`, name]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="tnum text-2xl font-extrabold">{num(alerts.length)}</p>
              <p className="text-[11px] text-muted-foreground">alerts</p>
            </div>
          </div>
          <div className="space-y-1.5 px-4 pb-4 text-xs">
            {byCat.map((r, i) => (
              <div key={r.c} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="flex-1 truncate text-muted-foreground">{r.c}</span>
                <span className="tnum text-muted-foreground">{alerts.length ? Math.round((r.n / alerts.length) * 100) : 0}%</span>
                <span className="tnum font-semibold">{r.n}</span>
              </div>
            ))}
            {byCat.length === 0 && <p className="text-muted-foreground">No alerts were generated for this analysis run. This does not guarantee that all activity is legitimate.</p>}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <PanelTitle title="Domestic vs International" sub="Volume and value side by side" />
          <div className="space-y-3 px-4 py-3">
            {domIntl.map((r) => (
              <div key={r.k}>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">{r.k}</span><span className="tnum font-semibold">{num(r.n)} txns</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full transition-all duration-700" style={{ width: `${txns.length ? (r.n / txns.length) * 100 : 0}%`, background: r.k === "Domestic" ? "#8B5CF6" : "#2DD4BF" }} /></div>
                <p className="tnum mt-1 text-[11px] text-muted-foreground">aggregate {Math.round(r.v).toLocaleString("en-IN")} (mixed-currency sum shown only as indicative total)</p>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <PanelTitle title="Currency Exposure" sub="Original-currency distribution" />
          <div className="space-y-2 px-4 py-3 text-[13px]">
            {byCur.slice(0, 6).map((r) => (
              <div key={r.c} className="flex justify-between border-b border-border/60 pb-1.5">
                <span className="font-semibold">{r.c} <span className="tnum font-normal text-muted-foreground">· {num(r.n)}</span></span>
                <span className="tnum">{Math.round(r.v).toLocaleString("en-IN")}</span>
              </div>
            ))}
            {byCur.length === 0 && <p className="text-xs text-muted-foreground">No currency data in scope.</p>}
          </div>
        </Card>
        <Card>
          <PanelTitle title="Network Snapshot" sub="Top connected accounts" right={<Link to="/network" className="text-xs text-[color:var(--primary)] hover:underline">Open explorer →</Link>} />
          <MiniNet />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <PanelTitle title="Channel Mix" sub="Transfers per payment rail · actual counts" />
          <div className="h-56 px-2 pb-2">
            <ResponsiveContainer>
              <BarChart data={byCh} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                <YAxis type="category" dataKey="c" width={92} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                <Tooltip contentStyle={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="n" name="Transfers" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <PanelTitle title="Review Priority" sub="Alerts by severity · click through to investigate" />
          <div className="space-y-3 px-4 py-4">
            {bySev.map((r) => (
              <div key={r.s}>
                <div className="flex justify-between text-xs">
                  <span className="capitalize text-muted-foreground">{r.s}</span>
                  <span className="tnum font-semibold">{num(r.n)} alerts</span>
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full transition-all duration-700" style={{ width: `${alerts.length ? (r.n / alerts.length) * 100 : 0}%`, background: r.s === "critical" ? "#FB7185" : r.s === "high" ? "#FBBF24" : r.s === "medium" ? "#8B5CF6" : "#2DD4BF" }} />
                </div>
              </div>
            ))}
            {bySev.length === 0 && <p className="text-[13px] text-muted-foreground">No alerts in scope — no severity to distribute.</p>}
            <Link to="/detections" className="inline-block text-xs text-[color:var(--primary)] hover:underline">Open detection explorer →</Link>
          </div>
        </Card>
      </div>

      {/* recent alerts */}
      <Card>
        <PanelTitle title="Recent Detection Alerts" sub="Click a row for the full evidence workbench" right={<Link to="/detections" className="text-xs text-[color:var(--primary)] hover:underline">All alerts →</Link>} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-[13px]">
            <thead><tr className="border-y border-border text-[11px] uppercase tracking-wider text-muted-foreground">
              {["Alert ID", "Category", "Priority", "Entities", "Txns", "Score"].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {alerts.slice(0, 8).map((a) => (
                <tr key={a.id} className="border-b border-border/40 transition-colors hover:bg-[color:var(--glass-hi)]">
                  <td className="px-4 py-2.5"><Link to={`/detections/${a.id}`} className="mono text-xs text-[color:var(--primary)] transition-colors hover:text-[#c4b5fd]">{a.id}</Link></td>
                  <td className="px-4 py-2.5 text-muted-foreground">{a.category}</td>
                  <td className="px-4 py-2.5"><SevBadge sev={a.severity} /></td>
                  <td className="mono max-w-[220px] truncate px-4 py-2.5 text-xs text-muted-foreground" title={a.entities.slice(0, 3).join(", ")}>{a.entities.slice(0, 3).map(shortId).join(", ")}</td>
                  <td className="tnum px-4 py-2.5">{a.txnIds.length}</td>
                  <td className="tnum px-4 py-2.5 font-semibold">{a.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {alerts.length === 0 && <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">No alerts were generated for this analysis run. This does not guarantee that all activity is legitimate.</p>}
        </div>
      </Card>
    </div>
  );
}

function MiniNet() {
  const ds = (loadAll().find((d) => d.id === getSelected()) ?? loadAll()[0]);
  if (!ds) return <p className="px-4 py-6 text-xs text-muted-foreground">No graph data.</p>;
  const deg = new Map<string, number>();
  ds.txns.slice(0, 3000).forEach((t) => { deg.set(t.sender, (deg.get(t.sender) ?? 0) + 1); deg.set(t.receiver, (deg.get(t.receiver) ?? 0) + 1); });
  const top = [...deg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const max = Math.max(1, ...top.map(([, d]) => d));
  return (
    <div className="space-y-1.5 px-4 py-3">
      {top.map(([id, d]) => (
        <div key={id} className="flex items-center gap-2 text-xs">
          <span className="mono w-28 truncate text-muted-foreground">{id}</span>
          <div className="h-1.5 flex-1 rounded bg-muted"><div className="h-1.5 rounded bg-[color:var(--primary)]" style={{ width: `${(d / max) * 100}%` }} /></div>
          <span className="tnum w-8 text-right">{d}</span>
        </div>
      ))}
    </div>
  );
}
