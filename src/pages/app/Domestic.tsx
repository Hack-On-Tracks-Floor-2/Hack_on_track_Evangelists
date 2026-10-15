import { Card, Empty, Kpi, PanelTitle, RiskCharacter, ScoreBar, btnPrimary, fmtAxis, num, shortId } from "@/components/app/Shell";
import { FindingCard } from "@/components/app/FindingCard";
import type { Alert } from "@/lib/trace/detect";
import { getSelected, loadAll } from "@/lib/trace/store";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const TABS = ["splitting", "velocity", "pass-through", "network", "behaviour", "structuring", "cross-border"];
const CHAN_COLORS = ["#8B5CF6", "#2DD4BF", "#FBBF24", "#60A5FA", "#34D399", "#FB7185"];

export default function Domestic() {
  const [tab, setTab] = useState<string | null>(null);
  const [channel, setChannel] = useState("");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<Alert | null>(null);
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
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-md border border-input bg-card p-1" role="group" aria-label="Transaction filters">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Account search…" className="w-44 border-0 bg-transparent px-2 py-1 text-[13px] outline-none placeholder:text-muted-foreground/60" aria-label="Account search" />
          <span className="h-5 w-px bg-border" aria-hidden />
          <select value={channel} onChange={(e) => setChannel(e.target.value)} className="border-0 bg-transparent px-2 py-1 text-xs outline-none" aria-label="Payment channel">
            <option value="">All channels</option>{[...new Set(ds.txns.map((t) => t.channel))].map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <Link to="/transactions" className={`${btnPrimary} ml-auto`}>Run analysis <ArrowRight className="h-4 w-4" /></Link>
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
          <PanelTitle title="Domestic volume over time" sub="Incoming (violet) vs outgoing (amber) value · grouped bars, one pair per day" />
          <div className="h-64 px-2 pb-2">
            <ResponsiveContainer>
              <BarChart data={buckets} barGap={2} barCategoryGap="18%">
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="d" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} width={44} tickFormatter={(v: number) => fmtAxis(v)} />
                <Tooltip contentStyle={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
                <Bar dataKey="inn" name="Incoming" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="out" name="Outgoing" fill="#FBBF24" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="flex flex-col">
          <PanelTitle title="Payment-channel distribution" sub="Share of transfers per rail · only channels present in data" />
          <div className="relative min-h-44 flex-1 px-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <defs>
                  {CHAN_COLORS.map((c, i) => (
                    <linearGradient key={c} id={`chan-${i}`} x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor={c} stopOpacity={1} />
                      <stop offset="100%" stopColor={c} stopOpacity={0.55} />
                    </linearGradient>
                  ))}
                </defs>
                <Pie
                  data={channels}
                  dataKey="n"
                  nameKey="name"
                  innerRadius="62%"
                  outerRadius="94%"
                  paddingAngle={3}
                  cornerRadius={6}
                  stroke="var(--elevated)"
                  strokeWidth={2}
                  cursor="pointer"
                  isAnimationActive
                  animationDuration={700}
                >
                  {channels.map((_, i) => <Cell key={i} fill={`url(#chan-${i % CHAN_COLORS.length})`} />)}
                </Pie>
                <Tooltip
                  cursor={false}
                  contentStyle={{
                    background: "color-mix(in srgb, var(--elevated) 88%, transparent)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    fontSize: 12,
                    backdropFilter: "blur(10px)",
                    boxShadow: "0 10px 30px -12px rgba(139, 92, 246, 0.45)",
                  }}
                  formatter={(v, n) => [`${num(Number(v))} transfers`, String(n) === "n" ? "count" : String(n)]}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Center: total the donut represents */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="display tnum text-3xl font-extrabold leading-none">{num(chanTotal)}</span>
              <span className="mt-1 text-[10px] tracking-[0.18em] text-muted-foreground uppercase">transfers</span>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-dashed px-4 pt-3 pb-4 text-xs">
            {channels.map((c, i) => (
              <div key={c.name} className="flex items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-[color:var(--glass-hi)]">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CHAN_COLORS[i % CHAN_COLORS.length] }} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{c.name}</span>
                <span className="tnum font-medium">{chanTotal ? Math.round((c.n / chanTotal) * 100) : 0}%</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card>
        <PanelTitle title="Hourly activity" sub="When domestic transfers occur" />
        <div className="h-36 px-2 pb-2">
          <ResponsiveContainer>
            <BarChart data={hour}>
              <XAxis dataKey="h" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} interval={3} />
              <Tooltip contentStyle={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="n" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      {ds.alerts.length > 0 && (
      <Card>
        <div className="flex gap-1.5 overflow-x-auto px-3 pt-3" role="tablist" aria-label="Findings by pattern">
          {TABS.map((t) => {
            const n = tabCounts[t] ?? 0;
            const sel = active === t;
            return (
              <button key={t} role="tab" aria-selected={sel} onClick={() => setTab(t)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] capitalize transition-all ${sel ? "border-[color:var(--primary)]/55 bg-[color:var(--primary)]/15 font-semibold text-[#c4b5fd] shadow-[0_0_18px_-6px_rgba(167,139,250,0.7)]" : n === 0 ? "border-transparent text-muted-foreground/45" : "border-border bg-[color:var(--glass)] text-muted-foreground hover:border-[color:var(--glass-border-hi)] hover:text-foreground"}`}>
                {t.replace("-", " ")}
                <span className={`tnum rounded-full px-1.5 text-[10px] ${sel ? "bg-[color:var(--primary)]/25" : "bg-muted"}`}>{n}</span>
              </button>
            );
          })}
        </div>
        {/* clean rows: account · condition · risk score. Click for the full card. */}
        <div className="space-y-1.5 px-3 pb-3 pt-2.5">
          {alerts.slice(0, 12).map((a) => {
            const acct = a.entities[0] ?? a.title.split("—").pop()?.trim() ?? "unknown";
            const condition = a.title.split("—")[0].trim();
            return (
              <button key={a.id} onClick={() => setDetail(a)}
                className="group flex w-full items-center gap-3 rounded-xl border border-border/60 bg-[color:var(--glass)] px-3 py-2.5 text-left backdrop-blur-md transition-all hover:translate-x-0.5 hover:border-[color:var(--glass-border-hi)]">
                <RiskCharacter severity={a.severity} size={28} />
                <span className="mono min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground group-hover:text-[#c4b5fd]" title={acct}>{shortId(acct)}</span>
                <span className="hidden min-w-0 flex-1 truncate text-[12px] text-muted-foreground sm:block">{condition}</span>
                <ScoreBar score={a.score} w={56} />
              </button>
            );
          })}
          {alerts.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-[13px] text-muted-foreground">No {active.replace("-", " ")} findings in this dataset.</p>
              <button onClick={() => setTab(best)} className="mt-2 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[color:var(--glass-hi)]">Show {best.replace("-", " ")} ({tabCounts[best] ?? 0}) instead</button>
            </div>
          )}
          {alerts.length > 12 && (
            <Link to="/detections" className="block pt-1 text-center text-xs text-[color:var(--primary)] hover:underline">View all {alerts.length} {active.replace("-", " ")} findings in the detection workbench →</Link>
          )}
        </div>
      </Card>
      )}
      {/* full detail card — everything about one finding, on demand */}
      {detail && <FindingCard a={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}


