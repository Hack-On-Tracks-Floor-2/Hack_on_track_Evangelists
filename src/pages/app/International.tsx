import { Card, Empty, Kpi, PanelTitle, RiskCharacter, ScoreBar, btnGhost, fmtAxis, num, shortId } from "@/components/app/Shell";
import { FindingCard } from "@/components/app/FindingCard";
import { download, getSelected, loadAll } from "@/lib/trace/store";
import type { Alert } from "@/lib/trace/detect";
import { useReviewStore } from "@/lib/trace/reviews";
import { useAuth } from "@/hooks/use-auth";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/* This page's chart palette deliberately avoids the global violet: teal → blue
   reads as movement for flows; amber/emerald/rose differentiate categories. */
const TEAL = "#2DD4BF";
const BLUE = "#60A5FA";
const BAR_COLORS = [TEAL, BLUE, "#FBBF24", "#34D399", "#FB7185"];
const selectCls =
  "rounded-full border border-input bg-[color:var(--glass)] px-3 py-1.5 text-xs text-foreground backdrop-blur-md transition-colors hover:border-[color:var(--glass-border-hi)]";

export default function International() {
  const [country, setCountry] = useState("");
  const [cur, setCur] = useState("");
  const ds = useMemo(() => { const a = loadAll(); return a.find((d) => d.id === getSelected()) ?? a[0]; }, []);
  const txns = useMemo(() => {
    if (!ds) return [];
    return ds.txns.filter((t) => !(t.origin_country === "IN" && t.dest_country === "IN"))
      .filter((t) => !country || t.origin_country === country || t.dest_country === country)
      .filter((t) => !cur || t.currency === cur);
  }, [ds, country, cur]);

  const corridors = useMemo(() => {
    const m = new Map<string, { r: string; n: number; v: number }>();
    txns.forEach((t) => {
      const k = `${t.origin_country}→${t.dest_country}`;
      const e = m.get(k) ?? { r: k, n: 0, v: 0 };
      e.n++; e.v += t.amount; m.set(k, e);
    });
    return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 14);
  }, [txns]);

  const byCur = useMemo(() => {
    const m = new Map<string, number>();
    txns.forEach((t) => m.set(t.currency, (m.get(t.currency) ?? 0) + t.amount));
    return [...m.entries()].map(([c, v]) => ({ c, v: Math.round(v) })).sort((a, b) => b.v - a.v);
  }, [txns]);

  // Daily transfer counts — feeds the KPI sparkline so "cross-border Txns"
  // shows the shape of activity, not just a total.
  const sparkDaily = useMemo(() => {
    const m = new Map<string, number>();
    txns.forEach((t) => { const d = t.timestamp.slice(0, 10); m.set(d, (m.get(d) ?? 0) + 1); });
    return [...m.keys()].sort().map((k) => m.get(k) ?? 0);
  }, [txns]);

  // Aggregate repetitive alerts (e.g. ten identical pass-through hits for one
  // account) into one row per entity + pattern.
  const SEVRANK: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };
  interface IntlGroup { key: string; entity: string; title: string; severity: string; category: string; items: Alert[] }
  const groups = useMemo(() => {
    if (!ds) return [] as IntlGroup[];
    const list = ds.alerts.filter((a) => a.category === "cross-border" || a.category === "pass-through" || a.category === "network");
    const m = new Map<string, IntlGroup>();
    list.forEach((a) => {
      const entity = a.entities[0] ?? "unlinked";
      const key = `${entity}::${a.title}`;
      const g = m.get(key) ?? { key, entity, title: a.title, severity: a.severity, category: a.category, items: [] as Alert[] };
      g.items.push(a);
      if ((SEVRANK[a.severity] ?? 0) > (SEVRANK[g.severity] ?? 0)) { g.severity = a.severity; g.category = a.category; }
      m.set(key, g);
    });
    return [...m.values()].sort((x, y) => y.items.length - x.items.length || (SEVRANK[y.severity] ?? 0) - (SEVRANK[x.severity] ?? 0));
  }, [ds]);
  const [detail, setDetail] = useState<IntlGroup | null>(null);
  const [hideDis, setHideDis] = useState(false);
  const [v, setV] = useState(0);
  void v;
  const store = useReviewStore();
  const { user } = useAuth();
  const alertCount = groups.reduce((s, g) => s + g.items.length, 0);

  if (!ds) return <Card><Empty title="No dataset available" body="Upload a transaction CSV or generate a synthetic dataset to begin analysis." /></Card>;

  const maxN = Math.max(1, ...corridors.map((c) => c.n));
  const scopeSub = [country || "all origins", cur || "all currencies"].join(" · ");
  const ccySub = byCur.length === 0
    ? "none in scope"
    : byCur.slice(0, 3).map((x) => x.c).join(" · ") + (byCur.length > 3 ? ` +${byCur.length - 3} more` : "");

  const dismissed = (g: IntlGroup) => g.items.every((a) => store.statusOf(a.id) === "false-positive");
  async function dismissGroup(g: IntlGroup) {
    const actor = String(user?.email ?? "analyst");
    for (const a of g.items) { await store.setStatus(a.id, "false-positive", actor); }
    setV((x) => x + 1);
    toast.success(`Dismissed ${g.items.length} signal${g.items.length === 1 ? "" : "s"} · ${shortId(g.entity)}`, { description: "Recorded as false positive — synced across reviewers." });
  }
  function exportGroup(g: IntlGroup) {
    download(`${ds.name}-${g.entity}-alerts.json`, JSON.stringify(g.items, null, 2), "application/json");
    toast.success("Group exported", { description: `${g.items.length} alert${g.items.length === 1 ? "" : "s"} saved as JSON.` });
  }
  function exportAll() {
    download(`${ds.name}-intl-alerts.json`, JSON.stringify(groups.flatMap((g) => g.items), null, 2), "application/json");
    toast.success("Alert list exported", { description: `${alertCount} signals saved as JSON.` });
  }

  return (
    <div className="space-y-4">
      {/* ── Toolbar: scope at a glance, filters right-aligned ── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-[color:var(--glass)] px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-md">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: TEAL, boxShadow: `0 0 8px -1px ${TEAL}` }} aria-hidden />
          <span className="tnum font-semibold text-foreground">{num(txns.length)}</span>
          cross-border transfers
        </span>
        {(country || cur) && (
          <button
            onClick={() => { setCountry(""); setCur(""); }}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-[color:var(--glass-hi)] hover:text-foreground"
            title="Clear country and currency filters"
          >
            Clear filters <X className="h-3 w-3" />
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <select value={country} onChange={(e) => setCountry(e.target.value)} className={selectCls} aria-label="Country filter">
            <option value="">All countries</option>{[...new Set([...ds.txns.map((t) => t.origin_country), ...ds.txns.map((t) => t.dest_country)])].map((c) => <option key={c}>{c}</option>)}
          </select>
          <select value={cur} onChange={(e) => setCur(e.target.value)} className={selectCls} aria-label="Currency filter">
            <option value="">All currencies</option>{[...new Set(ds.txns.map((t) => t.currency))].map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* ── KPI strip: each tile carries its own context line ── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Cross-border Txns" value={num(txns.length)} sub={scopeSub} accent={TEAL} spark={sparkDaily} />
        <Kpi label="Active Corridors" value={String(corridors.length)} sub={corridors[0] ? `${corridors[0].r} busiest` : "none in scope"} accent={BLUE} />
        <Kpi label="Currencies" value={String(byCur.length)} sub={ccySub} accent="#FBBF24" />
        <Kpi label="Intl Alerts" value={String(alertCount)} sub={`${groups.length} entit${groups.length === 1 ? "y" : "ies"} grouped`} accent="#FB7185" />
      </div>

      {/* ── Charts: flows left, currency aggregates right — same content height ── */}
      <div className="grid gap-3 xl:grid-cols-2">
        <Card>
          <PanelTitle title="Corridor flows" sub="Bar length = transfer count · click a corridor to filter · compact values (k/M)" />
          <div className="thin-scroll max-h-64 space-y-1 overflow-y-auto px-4 pb-4 pt-2">
            {corridors.map((c) => {
              const [o, d] = c.r.split("→");
              return (
                <button
                  key={c.r}
                  onClick={() => setCountry(o)}
                  title={`Filter to ${o} — ${c.n} transfers · ${fmtAxis(Math.round(c.v))}`}
                  className="group grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[color:var(--glass-hi)]"
                >
                  <span className="mono flex shrink-0 items-center gap-1 text-[11px] font-bold tracking-wide">
                    <span className="rounded-md border border-border bg-muted/70 px-1.5 py-0.5 text-foreground">{o}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="rounded-md border border-border bg-muted/70 px-1.5 py-0.5 text-foreground">{d}</span>
                  </span>
                  <span className="relative h-2.5 overflow-hidden rounded-full bg-muted/70">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 group-hover:brightness-125"
                      style={{
                        width: `${(c.n / maxN) * 100}%`,
                        background: `linear-gradient(90deg, ${TEAL}, ${BLUE})`,
                        boxShadow: "0 0 12px -3px rgba(45, 212, 191, 0.85)",
                      }}
                    />
                  </span>
                  <span className="tnum shrink-0 whitespace-nowrap text-right text-[11px] text-muted-foreground">
                    <span className="font-semibold text-foreground">{c.n}</span> txns · {fmtAxis(Math.round(c.v))}
                  </span>
                </button>
              );
            })}
            {corridors.length === 0 && <p className="px-2 py-8 text-center text-[13px] text-muted-foreground">No cross-border transfers in scope — showing a network graph instead of a map avoids fabricating geography.</p>}
          </div>
        </Card>
        <Card>
          <PanelTitle title="Value by currency" sub="Original-currency aggregates · largest on top · compact axis (k/M)" />
          <div className="h-64 px-2 pb-2">
            <ResponsiveContainer>
              <BarChart data={byCur} layout="vertical" margin={{ right: 12 }}>
                <CartesianGrid stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickFormatter={(t: number) => fmtAxis(t)} />
                <YAxis type="category" dataKey="c" reversed tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={48} />
                <Tooltip
                  cursor={{ fill: "rgba(255, 255, 255, 0.04)" }}
                  contentStyle={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, backdropFilter: "blur(10px)" }}
                  formatter={(val) => [`${num(Number(val))}`, "value"]}
                />
                <Bar dataKey="v" radius={[0, 8, 8, 0]} barSize={18}>
                  {byCur.map((c, i) => <Cell key={c.c} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* ── Findings: one row per account — click for the full picture ── */}
      <Card>
        <PanelTitle
          title="International findings"
          sub="One row per account · grouped triggers · click for the full picture"
          right={
            <div className="flex shrink-0 items-center gap-2">
              <span className="tnum hidden text-xs text-muted-foreground sm:block">{alertCount} signals · {groups.length} accounts</span>
              <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground" title="Hide accounts fully recorded as false positive">
                <input type="checkbox" checked={hideDis} onChange={(e) => setHideDis(e.target.checked)} className="h-3.5 w-3.5 accent-[#2DD4BF]" />
                Hide dismissed
              </label>
              {groups.length > 0 && (
                <button onClick={exportAll} className="rounded-full border border-border bg-[color:var(--glass)] px-3 py-1.5 text-xs font-medium backdrop-blur-md transition-colors hover:bg-[color:var(--glass-hi)]" title="Download the whole list as JSON">Export all</button>
              )}
            </div>
          }
        />
        {/* clean rows: risk character · account · condition · group chip · score. Click for the full card. */}
        <div className="space-y-1.5 px-3 pb-3 pt-2.5">
          {groups.filter((g) => !hideDis || !dismissed(g)).slice(0, 20).map((g) => {
            const dis = dismissed(g);
            const top = g.items.reduce((b, x) => (x.score > b.score ? x : b), g.items[0]);
            return (
              <button key={g.key} onClick={() => setDetail(g)} disabled={dis}
                className={`group flex w-full items-center gap-3 rounded-xl border border-border/60 bg-[color:var(--glass)] px-3 py-2.5 text-left backdrop-blur-md transition-all hover:translate-x-0.5 hover:border-[color:var(--glass-border-hi)] ${dis ? "opacity-45 hover:translate-x-0" : ""}`}>
                <RiskCharacter severity={g.severity} size={28} />
                <span className="mono min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground group-hover:text-[#5eead4]" title={g.entity}>{shortId(g.entity)}</span>
                <span className="hidden min-w-0 flex-1 truncate text-[12px] text-muted-foreground sm:block">{g.title.split("—")[0].trim()}</span>
                {g.items.length > 1 && (
                  <span className="tnum shrink-0 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground" title={`${g.items.length} triggers grouped`}>×{g.items.length}</span>
                )}
                {dis && <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">dismissed</span>}
                <ScoreBar score={top.score} w={56} />
              </button>
            );
          })}
          {groups.length === 0 && <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">No international findings. Upload cross-border data or widen the filters.</p>}
        </div>
      </Card>
      {/* full detail card — everything about one finding, on demand */}
      {detail && (
        <FindingCard
          a={detail.items.reduce((b, x) => (x.score > b.score ? x : b), detail.items[0])}
          onClose={() => setDetail(null)}
          note={detail.items.length > 1 ? `${detail.items.length} triggers grouped for this account · showing the highest-priority one` : undefined}
          extra={
            <>
              {!dismissed(detail) && (
                <button onClick={() => { dismissGroup(detail); setDetail(null); }} className={btnGhost} title="Record every trigger in this group as false positive">Dismiss group</button>
              )}
              <button onClick={() => exportGroup(detail)} className={btnGhost} title="Download this group as JSON">Export</button>
            </>
          }
        />
      )}
    </div>
  );
}
