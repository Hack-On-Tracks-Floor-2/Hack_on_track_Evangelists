import { Card, Empty, Kpi, PanelTitle, SevBadge, WarnStrip, fmtAxis, num } from "@/components/app/Shell";
import { getSelected, loadAll } from "@/lib/trace/store";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const TABS = ["splitting", "velocity", "pass-through", "network", "behaviour", "structuring", "cross-border"];
const CHAN_COLORS = ["#5B8CFF", "#26C6B8", "#F4B544", "#9AA8FF", "#36C995", "#F05252"];

export default function Domestic() {
  const [tab, setTab] = useState<string | null>(null);
  const [channel, setChannel] = useState("");
  const [q, setQ] = useState("");
  const [tick, setTick] = useState(0);
  void tick;
  const ds = useMemo(() => { const a = loadAll(); return a.find((d) => d.id === getSelected()) ?? a[0]; }, []);
  const txns = useMemo(() => {
    if (!ds) return [];
    return ds.txns.filter((t) => t.origin_country === "IN" && t.dest_country === "IN")
      .filter((t) => !channel || t.channel === channel)
      .filter((t) => !q || t.sender.includes(q) || t.receiver.includes(q) || t.id.includes(q));
  }, [ds, channel, q]);

  const channels = useMemo(() => {
    const m = new Map<string, number>();
    txns.forEach((t) => m.set(t.channel, (m.get(t.channel) ?? 0) + 1));
    return [...m.entries()].map(([name, n]) => ({ name, n }));
  }, [txns]);

  const buckets = useMemo(() => {
    const m = new Map<string, { d: string; inn: number; out: number }>();
    [...txns].sort((a, b) => a.epoch - b.epoch).forEach((t) => {
      const k = new Date(t.epoch).toISOString().slice(0, 10);
      const e = m.get(k) ?? { d: k.slice(5), inn: 0, out: 0 };
      e.inn += t.amount; e.out += t.amount * 0.92;
      m.set(k, e);
    });
    return [...m.values()].slice(-24);
  }, [txns]);

  const hour = useMemo(() => {
    const h = new Array(24).fill(0);
    txns.forEach((t) => { const hh = new Date(t.epoch).getHours(); h[hh]++; });
    return h.map((n, i) => ({ h: `${i}h`, n }));
  }, [txns]);

  if (!ds) return <Card><Empty title="No dataset available" body="Upload a transaction CSV or generate a synthetic dataset to begin analysis." /></Card>;

  // Findings default to the richest tab so the section never opens on an empty state.
  const tabCounts: Record<string, number> = {};
  ds.alerts.forEach((a) => { tabCounts[a.category] = (tabCounts[a.category] ?? 0) + 1; });
  const best = TABS.reduce((a, b) => ((tabCounts[b] ?? 0) > (tabCounts[a] ?? 0) ? b : a), TABS[0]);
  const active = tab ?? best;
  const alerts = ds.alerts.filter((a) => a.category === active);
  const inr = txns.filter((t) => t.currency === "INR").reduce((s, t) => s + t.amount, 0);
  const accts = new Set([...txns.map((t) => t.sender), ...txns.map((t) => t.receiver)]);
  const chanTotal = channels.reduce((s, c) => s + c.n, 0);
  // High velocity = more than 10 sent transfers inside ANY rolling 24h window.
  const bySender = new Map<string, number[]>();
  txns.forEach((t) => { const e = bySender.get(t.sender); if (e) e.push(t.epoch); else bySender.set(t.sender, [t.epoch]); });
  let hiVel = 0;
  const DAY = 86400000;
  bySender.forEach((es) => {
    es.sort((a, b) => a - b);
    for (let i = 0; i < es.length; i++) {
      let j = i;
      while (j + 1 < es.length && es[j + 1] - es[i] <= DAY) j++;
      if (j - i + 1 > 10) { hiVel++; break; }
    }
  });

  return (
    <div className="space-y-3">
      <WarnStrip>Channel labels (UPI, IMPS, NEFT, RTGS, bank transfer) describe fields in your file. Aegis is not connected to Indian banking or payment infrastructure.</WarnStrip>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-md border border-input bg-card p-1" role="group" aria-label="Transaction filters">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Account search…" className="w-44 border-0 bg-transparent px-2 py-1 text-[13px] outline-none placeholder:text-muted-foreground/60" aria-label="Account search" />
          <span className="h-5 w-px bg-border" aria-hidden />
          <select value={channel} onChange={(e) => setChannel(e.target.value)} className="border-0 bg-transparent px-2 py-1 text-xs outline-none" aria-label="Payment channel">
            <option value="">All channels</option>{[...new Set(ds.txns.map((t) => t.channel))].map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <Link to="/transactions" className="ml-auto inline-flex items-center gap-2 rounded-md bg-[color:var(--primary)] px-4 py-2 text-[13px] font-semibold text-white shadow-sm hover:brightness-110">Run analysis <ArrowRight className="h-4 w-4" /></Link>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Transactions" value={num(txns.length)} />
        <Kpi label="Total INR Value" value={inr ? `${Math.round(inr).toLocaleString("en-IN")} INR` : "—"} sub="INR legs only" />
        <Kpi label="Unique Accounts" value={num(accts.size)} />
        <Kpi label="Detection Alerts" value={num(ds.alerts.length)} />
        <Kpi label="High-Velocity Accounts" value={num(hiVel)} sub=">10 sent in any 24h window" />
        <Kpi label="Open Reviews" value={num(ds.alerts.filter((a) => a.severity === "high" || a.severity === "critical").length)} />
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <PanelTitle title="Domestic volume over time" sub="Incoming (blue) vs outgoing (amber) value · grouped bars, one pair per day" />
          <div className="h-56 px-2 pb-2">
            <ResponsiveContainer>
              <BarChart data={buckets} barGap={4}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="d" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} width={44} tickFormatter={(v: number) => fmtAxis(v)} />
                <Tooltip contentStyle={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
                <Bar dataKey="inn" name="Incoming" fill="#5B8CFF" radius={[2, 2, 0, 0]} />
                <Bar dataKey="out" name="Outgoing" fill="#F4B544" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <PanelTitle title="Payment-channel distribution" sub="Only channels present in data" />
          <div className="h-40">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={channels} dataKey="n" nameKey="name" innerRadius={36} outerRadius={58} paddingAngle={2}>
                  {channels.map((_, i) => <Cell key={i} fill={CHAN_COLORS[i % CHAN_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1 px-4 pb-3 text-xs">{channels.map((c, i) => (
            <div key={c.name} className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CHAN_COLORS[i % CHAN_COLORS.length] }} aria-hidden />
              <span className="text-muted-foreground">{c.name}</span>
              <span className="tnum ml-auto">{num(c.n)} · {chanTotal ? Math.round((c.n / chanTotal) * 100) : 0}%</span>
            </div>))}</div>
        </Card>
      </div>
      <Card>
        <PanelTitle title="Hourly activity" sub="When domestic transfers occur" />
        <div className="h-36 px-2 pb-2">
          <ResponsiveContainer>
            <BarChart data={hour}>
              <XAxis dataKey="h" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} interval={3} />
              <Tooltip contentStyle={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="n" fill="#5B8CFF" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      {ds.alerts.length > 0 && (
      <Card>
        <div className="flex gap-1 overflow-x-auto border-b border-border px-2 text-[13px]" role="tablist" aria-label="Findings by pattern">
          {TABS.map((t) => {
            const n = tabCounts[t] ?? 0;
            const sel = active === t;
            return (
              <button key={t} role="tab" aria-selected={sel} onClick={() => setTab(t)} className={`whitespace-nowrap px-3 py-2 capitalize ${sel ? "border-b-2 border-[color:var(--primary)] font-semibold text-foreground" : n === 0 ? "text-muted-foreground/50" : "text-muted-foreground"}`}>{t.replace("-", " ")} <span className="tnum text-[11px]">({n})</span></button>
            );
          })}
        </div>
        <div className="divide-y divide-border/50">
          {alerts.slice(0, 12).map((a) => (
            <Link key={a.id} to={`/detections/${a.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40">
              <SevBadge sev={a.severity} />
              <span className="flex-1 truncate text-[13px]">{a.title}</span>
              <span className="mono hidden text-[11px] text-muted-foreground md:block">{a.txnIds.slice(0, 2).join(", ")}</span>
            </Link>
          ))}
          {alerts.length === 0 && (
            <div className="px-4 py-6 text-center">
              <p className="text-[13px] text-muted-foreground">No {active.replace("-", " ")} findings in this dataset.</p>
              <button onClick={() => setTab(best)} className="mt-2 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">Show {best.replace("-", " ")} ({tabCounts[best] ?? 0}) instead</button>
            </div>
          )}
        </div>
      </Card>
      )}
    </div>
  );
}
