import { Card, Empty, Kpi, PanelTitle, fmtAxis, fmtBig, num, shortId } from "@/components/app/Shell";
import { ChartBoundary } from "@/components/app/safety";
import { toCSV, type NormalizedTxn } from "@/lib/trace/csv";
import { download, getSelected, loadAll } from "@/lib/trace/store";
import { Download, Info } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const med = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const sum = (a: NormalizedTxn[]) => a.reduce((s, t) => s + t.amount, 0);
const shortDate = (ts: number) => new Date(ts).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
const nodeLabel = (id: string) => { const s = shortId(id); return s.length > 18 ? s.slice(0, 17) + "…" : s; };

type Ribbon = { s: string; r: string; v: number; n: number; sy0: number; sy1: number; ty0: number; ty1: number };
type PassRow = { id: string; inN: number; outN: number; inV: number; outV: number; lagH: number | null };
type Journey = { mid: string; from: string; to: string; inId: string; outId: string; gapH: number; share: number; v: number; flagged: boolean };

export default function FundFlows() {
  const ds = useMemo(() => { const a = loadAll(); return a.find((d) => d.id === getSelected()) ?? a[0]; }, []);
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q);
  const [scope, setScope] = useState("");
  const [cur, setCur] = useState("");
  const [minAmt, setMinAmt] = useState("");
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    if (!ds) return [];
    const lo = Number(minAmt) || 0;
    return ds.txns.filter((t) => {
      if (scope === "domestic" && !(t.origin_country === "IN" && t.dest_country === "IN")) return false;
      if (scope === "international" && (t.origin_country === "IN" && t.dest_country === "IN")) return false;
      if (t.amount < lo) return false;
      if (dq && !t.sender.includes(dq) && !t.receiver.includes(dq) && !t.id.includes(dq)) return false;
      return true;
    });
  }, [ds, scope, minAmt, dq]);

  // Currency view: value panels always operate on ONE currency (default = the
  // dataset's largest); counts state which currencies they cover. Never cross-sum.
  const ccyTotals = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((t) => m.set(t.currency, (m.get(t.currency) ?? 0) + t.amount));
    return [...m.entries()].map(([c, v]) => ({ c, v })).sort((a, b) => b.v - a.v);
  }, [filtered]);
  const ccy = cur || ccyTotals[0]?.c || "";
  const ccyTxns = useMemo(() => filtered.filter((t) => t.currency === ccy), [filtered, ccy]);

  const alertTxnIds = useMemo(() => new Set((ds?.alerts ?? []).flatMap((a) => a.txnIds)), [ds]);
  const alertEntities = useMemo(() => new Set((ds?.alerts ?? []).flatMap((a) => a.entities)), [ds]);

  // Flow map model: aggregate (sender, receiver) pairs in the selected currency,
  // keep top links and their endpoints — two columns, pass-through appears on both.
  const sankey = useMemo(() => {
    if (!ccyTxns.length) return null;
    const linkMap = new Map<string, { s: string; r: string; v: number; n: number }>();
    ccyTxns.forEach((t) => {
      if (t.sender === t.receiver) return;
      const k = t.sender + "\u0000" + t.receiver;
      const e = linkMap.get(k) ?? { s: t.sender, r: t.receiver, v: 0, n: 0 };
      e.v += t.amount; e.n++;
      linkMap.set(k, e);
    });
    const links = [...linkMap.values()].sort((a, b) => b.v - a.v).slice(0, 18);
    const outBy = new Map<string, number>(); const inBy = new Map<string, number>();
    links.forEach((l) => { outBy.set(l.s, (outBy.get(l.s) ?? 0) + l.v); inBy.set(l.r, (inBy.get(l.r) ?? 0) + l.v); });
    const sources = [...outBy.keys()].sort((a, b) => outBy.get(b)! - outBy.get(a)!).slice(0, 9);
    const sinks = [...inBy.keys()].sort((a, b) => inBy.get(b)! - inBy.get(a)!).slice(0, 9);
    const sSet = new Set(sources); const tSet = new Set(sinks);
    const keep = links.filter((l) => sSet.has(l.s) && tSet.has(l.r));
    if (!keep.length) return null;
    const H = 350; const Y0 = 42; const GAP = 11;
    const outTot = sources.reduce((s, id) => s + outBy.get(id)!, 0);
    const inTot = sinks.reduce((s, id) => s + inBy.get(id)!, 0);
    const scale = Math.min((H - GAP * sources.length) / outTot, (H - GAP * sinks.length) / inTot);
    const place = (ids: string[], tot: Map<string, number>) => {
      const m2 = new Map<string, { y0: number; y1: number }>();
      let y = Y0;
      for (const id of ids) { const h = Math.max(2, tot.get(id)! * scale); m2.set(id, { y0: y, y1: y + h }); y += h + GAP; }
      return m2;
    };
    const srcBox = place(sources, outBy); const tgtBox = place(sinks, inBy);
    const srcCur = new Map(sources.map((id) => [id, srcBox.get(id)!.y0]));
    const tgtCur = new Map(sinks.map((id) => [id, tgtBox.get(id)!.y0]));
    const ordered = [...keep].sort((a, b) => (srcBox.get(a.s)!.y0 - srcBox.get(b.s)!.y0) || (tgtBox.get(a.r)!.y0 - tgtBox.get(b.r)!.y0));
    const ribbons: Ribbon[] = ordered.map((l) => {
      const h = Math.max(1, l.v * scale);
      const sy0 = srcCur.get(l.s)!; srcCur.set(l.s, sy0 + h);
      const ty0 = tgtCur.get(l.r)!; tgtCur.set(l.r, ty0 + h);
      return { ...l, sy0, sy1: sy0 + h, ty0, ty1: ty0 + h };
    });
    const outTotals = new Map(sources.map((id) => [id, sum(ccyTxns.filter((t) => t.sender === id))]));
    const inTotals = new Map(sinks.map((id) => [id, sum(ccyTxns.filter((t) => t.receiver === id))]));
    return { srcBox, tgtBox, ribbons, sources, sinks, outTotals, inTotals };
  }, [ccyTxns]);
  const [hover, setHover] = useState<Ribbon | null>(null);

  // Trend: fixed calendar buckets over the selected currency's transfers.
  const trend = useMemo(() => {
    if (!ccyTxns.length) return [];
    const epochs = ccyTxns.map((t) => t.epoch);
    const t0 = Math.min(...epochs); const span = Math.max(...epochs) - t0;
    const bucketMs = span <= 21 * 86400e3 ? 86400e3 : 7 * 86400e3;
    const m = new Map<number, { k: number; label: string; v: number; n: number; a: number }>();
    ccyTxns.forEach((t) => {
      const k = Math.floor((t.epoch - t0) / bucketMs);
      const e = m.get(k) ?? { k, label: shortDate(t0 + k * bucketMs), v: 0, n: 0, a: 0 };
      e.v += t.amount; e.n++; if (alertTxnIds.has(t.id)) e.a++;
      m.set(k, e);
    });
    return [...m.values()].sort((a, b) => a.k - b.k);
  }, [ccyTxns, alertTxnIds]);

  const dest = useMemo(() => {
    const m = new Map<string, { id: string; label: string; v: number; n: number }>();
    ccyTxns.forEach((t) => {
      const e = m.get(t.receiver) ?? { id: t.receiver, label: shortId(t.receiver), v: 0, n: 0 };
      e.v += t.amount; e.n++;
      m.set(t.receiver, e);
    });
    return [...m.values()].sort((a, b) => b.v - a.v).slice(0, 10);
  }, [ccyTxns]);

  // Pass-through: per account with ≥2 in and ≥2 out in the selected currency —
  // aggregate ratio + median hours to the first outbound within 30 days of an inbound.
  const passRows = useMemo<PassRow[]>(() => {
    const ins = new Map<string, NormalizedTxn[]>(); const outs = new Map<string, NormalizedTxn[]>();
    ccyTxns.forEach((t) => {
      if (!ins.has(t.receiver)) ins.set(t.receiver, []);
      ins.get(t.receiver)!.push(t);
      if (!outs.has(t.sender)) outs.set(t.sender, []);
      outs.get(t.sender)!.push(t);
    });
    const rows: PassRow[] = [];
    ins.forEach((list, id) => {
      const o = outs.get(id);
      if (!o || list.length < 2 || o.length < 2) return;
      const inV = sum(list); const outV = sum(o);
      if (inV <= 0) return;
      const lags: number[] = [];
      for (const inn of list) {
        const nxt = o.find((x) => x.epoch >= inn.epoch && x.epoch - inn.epoch <= 30 * 86400e3);
        if (nxt) lags.push((nxt.epoch - inn.epoch) / 3600e3);
      }
      rows.push({ id, inN: list.length, outN: o.length, inV, outV, lagH: lags.length ? Math.round(med(lags) * 10) / 10 : null });
    });
    return rows.sort((a, b) => b.outV - a.outV).slice(0, 8);
  }, [ccyTxns]);

  // Two-hop journeys: busiest intermediate accounts, recent inbound paired with
  // the first outbound ≥30% of its value within 7 days — same currency by construction.
  const journeys = useMemo<Journey[]>(() => {
    const ins = new Map<string, NormalizedTxn[]>(); const outs = new Map<string, NormalizedTxn[]>();
    ccyTxns.forEach((t) => {
      if (!ins.has(t.receiver)) ins.set(t.receiver, []);
      ins.get(t.receiver)!.push(t);
      if (!outs.has(t.sender)) outs.set(t.sender, []);
      outs.get(t.sender)!.push(t);
    });
    const activity = (id: string) => sum(ins.get(id) ?? []) + sum(outs.get(id) ?? []);
    const mids = [...ins.keys()].filter((k) => (outs.get(k)?.length ?? 0) > 0)
      .sort((a, b) => activity(b) - activity(a)).slice(0, 12);
    const out: Journey[] = [];
    for (const mid of mids) {
      const inL = [...(ins.get(mid) ?? [])].sort((x, y) => y.epoch - x.epoch).slice(0, 3);
      const outL = [...(outs.get(mid) ?? [])].sort((x, y) => x.epoch - y.epoch);
      for (const inn of inL) {
        const nxt = outL.find((o) => o.epoch >= inn.epoch && o.epoch - inn.epoch <= 7 * 86400e3 && o.amount / inn.amount >= 0.3);
        if (!nxt) continue;
        out.push({
          mid, from: inn.sender, to: nxt.receiver, inId: inn.id, outId: nxt.id,
          gapH: Math.round(((nxt.epoch - inn.epoch) / 3600e3) * 10) / 10,
          share: Math.min(1.5, nxt.amount / inn.amount), v: inn.amount + nxt.amount,
          flagged: alertEntities.has(mid) || alertEntities.has(inn.sender) || alertEntities.has(nxt.receiver),
        });
        if (out.length >= 8) break;
      }
      if (out.length >= 8) break;
    }
    return out.sort((a, b) => b.v - a.v);
  }, [ccyTxns, alertEntities]);

  const chanRows = useMemo(() => {
    const m = new Map<string, { name: string; n: number; v: number; amts: number[] }>();
    filtered.forEach((t) => {
      const e = m.get(t.channel) ?? { name: t.channel, n: 0, v: 0, amts: [] };
      e.n++;
      if (t.currency === ccy) { e.v += t.amount; e.amts.push(t.amount); }
      m.set(t.channel, e);
    });
    return [...m.values()].map((e) => ({ name: e.name, n: e.n, v: e.v, med: e.amts.length ? med(e.amts) : 0 }))
      .sort((a, b) => b.v - a.v || b.n - a.n).slice(0, 6);
  }, [filtered, ccy]);

  const corridors = useMemo(() => {
    const m = new Map<string, { route: string; n: number; v: number; first: number; last: number }>();
    filtered.forEach((t) => {
      const route = `${t.origin_country} → ${t.dest_country}`;
      const e = m.get(route) ?? { route, n: 0, v: 0, first: t.epoch, last: t.epoch };
      e.n++;
      if (t.currency === ccy) e.v += t.amount;
      e.first = Math.min(e.first, t.epoch); e.last = Math.max(e.last, t.epoch);
      m.set(route, e);
    });
    return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 8);
  }, [filtered, ccy]);

  const xborder = useMemo(() => {
    const legs = filtered.filter((t) => t.origin_country !== t.dest_country);
    return { n: legs.length, pct: filtered.length ? Math.round((legs.length / filtered.length) * 100) : 0, v: sum(legs.filter((t) => t.currency === ccy)) };
  }, [filtered, ccy]);
  const largest = useMemo(() => ccyTxns.reduce<NormalizedTxn | null>((m2, t) => (!m2 || t.amount > m2.amount ? t : m2), null), [ccyTxns]);
  const corridorCount = useMemo(() => new Set(filtered.map((t) => t.sender + "\u0000" + t.receiver)).size, [filtered]);
  const entityCount = useMemo(() => { const s = new Set<string>(); filtered.forEach((t) => { s.add(t.sender); s.add(t.receiver); }); return s.size; }, [filtered]);

  if (!ds) return <Card><Empty title="No dataset available" body="Upload a transaction CSV or generate a synthetic dataset to begin analysis." /></Card>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter account or txn id…" className="w-52 rounded-full border border-input bg-[color:var(--glass-hi)] px-3 py-1.5 text-[13px] outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-[color:var(--ring)]/60" aria-label="Filter account" />
        <select value={scope} onChange={(e) => setScope(e.target.value)} className="rounded-full border border-input bg-[color:var(--glass)] px-3 py-1.5 text-xs backdrop-blur-md transition-colors hover:border-[color:var(--glass-border-hi)]" aria-label="Scope">
          <option value="">Domestic + International</option><option value="domestic">Domestic</option><option value="international">International</option>
        </select>
        <select value={cur} onChange={(e) => setCur(e.target.value)} className="rounded-full border border-input bg-[color:var(--glass)] px-3 py-1.5 text-xs backdrop-blur-md transition-colors hover:border-[color:var(--glass-border-hi)]" aria-label="Currency">
          <option value="">{ccyTotals[0] ? `All — value shown in ${ccyTotals[0].c}` : "All currencies"}</option>
          {ccyTotals.map((c) => <option key={c.c} value={c.c}>{c.c}</option>)}
        </select>
        <input value={minAmt} onChange={(e) => setMinAmt(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="Min amount" inputMode="decimal" className="w-24 rounded-full border border-input bg-[color:var(--glass-hi)] px-3 py-1.5 text-xs outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-[color:var(--ring)]/60" aria-label="Minimum amount" />
        <span className="text-xs text-muted-foreground">{num(filtered.length)} transfers · value panels in <span className="font-semibold text-foreground">{ccy || "—"}</span></span>
        <button onClick={() => download(`${ds.name}-fund-flows.csv`, toCSV(filtered.map((t) => ({ id: t.id, sender: t.sender, receiver: t.receiver, amount: t.amount, currency: t.currency, timestamp: t.timestamp, channel: t.channel, route: `${t.origin_country}-${t.dest_country}` }))))} className="ml-auto inline-flex items-center gap-1 rounded-full border border-border bg-[color:var(--glass)] px-3.5 py-1.5 text-[13px] font-medium backdrop-blur-md transition-all hover:border-[color:var(--glass-border-hi)] hover:bg-[color:var(--glass-hi)]"><Download className="h-3.5 w-3.5" /> Export scope</button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        <div className="rise rise-1"><Kpi label={`Value moved (${ccy || "—"})`} value={ccyTotals[0] ? fmtBig(ccyTotals.find((c) => c.c === ccy)?.v ?? 0, ccy) : "—"} sub="single-currency total · never cross-summed" spark={trend.map((b) => b.v)} accent="var(--warning)" /></div>
        <div className="rise rise-2"><Kpi label="Transfers in scope" value={num(filtered.length)} sub={`${num(ccyTxns.length)} in ${ccy} · ${num(filtered.length - ccyTxns.length)} in other currencies`} /></div>
        <div className="rise rise-3"><Kpi label="Active corridors" value={num(corridorCount)} sub="distinct sender → receiver pairs" accent="var(--teal)" /></div>
        <div className="rise rise-4"><Kpi label="Entities moving money" value={num(entityCount)} sub="senders + receivers under filters" accent="var(--teal)" /></div>
        <div className="rise rise-5"><Kpi label="Cross-border legs" value={`${xborder.pct}%`} sub={`${num(xborder.n)} transfers · ${fmtBig(xborder.v, ccy)} in ${ccy}`} accent="var(--primary)" /></div>
        <div className="rise rise-6"><Kpi label={`Largest transfer (${ccy || "—"})`} value={largest ? fmtBig(largest.amount, ccy) : "—"} sub={largest ? `${shortId(largest.sender)} → ${shortId(largest.receiver)}` : "no transfers"} accent="var(--destructive)" /></div>
      </div>
      <Card>
        <PanelTitle title="Flow map — where the money goes" sub={`Top ${sankey ? sankey.ribbons.length : 0} money routes by value · sender column (violet) → receiver column (teal) · shown in ${ccy || "—"}`} />
        <p className="mt-1 flex items-start gap-1.5 px-5 text-[11px] leading-[18px] text-muted-foreground/90">
          <Info className="mt-[3px] h-3 w-3 shrink-0 text-[color:var(--teal)]" />
          <span><span className="font-semibold text-foreground/70">How it's computed — </span>every (sender, receiver) pair in {ccy} is summed and the top 18 links are drawn between the 9 largest senders and 9 largest receivers. Node height and ribbon thickness are linear to value; an account appearing in both columns is a pass-through. Rose rings mark accounts mentioned in a detection alert. No identity or ownership is inferred — names come straight from the file.</span>
        </p>
        <div className="px-4 pb-2 pt-3">
          {sankey ? (
            <svg viewBox="0 0 1000 420" className="w-full select-none" role="img" aria-label="Money flow map from top senders to top receivers">
              <defs>
                <linearGradient id="ffFlow" x1="0" x2="1"><stop offset="0" stopColor="#8b5cf6" /><stop offset="1" stopColor="#2dd4bf" /></linearGradient>
              </defs>
              <text x={202} y={26} textAnchor="middle" className="fill-[#a8a3c7] text-[10px] font-semibold uppercase tracking-[0.16em]">Top senders</text>
              <text x={800} y={26} textAnchor="middle" className="fill-[#a8a3c7] text-[10px] font-semibold uppercase tracking-[0.16em]">Top receivers</text>
              {sankey.ribbons.map((r, i) => {
                const x1 = 202; const x2 = 798; const cx = (x1 + x2) / 2;
                const d = `M ${x1} ${r.sy0} C ${cx} ${r.sy0} ${cx} ${r.ty0} ${x2} ${r.ty0} L ${x2} ${r.ty1} C ${cx} ${r.ty1} ${cx} ${r.sy1} ${x1} ${r.sy1} Z`;
                const dim = hover && hover !== r;
                return (
                  <path key={i} d={d} fill="url(#ffFlow)" className="cursor-pointer transition-opacity duration-150"
                    opacity={hover ? (dim ? 0.12 : 0.75) : 0.3}
                    onMouseEnter={() => setHover(r)} onMouseLeave={() => setHover(null)}
                    onClick={() => navigate(`/entities/${encodeURIComponent(r.s)}`)}>
                    <title>{`${shortId(r.s)} → ${shortId(r.r)}: ${num(r.n)} transfers, ${Math.round(r.v).toLocaleString("en-IN")} ${ccy}`}</title>
                  </path>
                );
              })}
              {sankey.sources.map((id) => {
                const b = sankey.srcBox.get(id)!; const h = b.y1 - b.y0;
                return (
                  <g key={id} className="cursor-pointer" onClick={() => navigate(`/entities/${encodeURIComponent(id)}`)}>
                    <rect x={192} y={b.y0} width={10} height={h} rx={3} fill="#8b5cf6" stroke={alertEntities.has(id) ? "#fb7185" : "transparent"} strokeWidth={2}>
                      <title>{`${shortId(id)} — sends ${Math.round(sankey.outTotals.get(id)!).toLocaleString("en-IN")} ${ccy}`}</title>
                    </rect>
                    <text x={184} y={(b.y0 + b.y1) / 2 - 2} textAnchor="end" className="fill-[#f2f0fb] text-[11px] font-semibold">{nodeLabel(id)}</text>
                    <text x={184} y={(b.y0 + b.y1) / 2 + 11} textAnchor="end" className="fill-[#a8a3c7] text-[10px]">{fmtBig(sankey.outTotals.get(id)!, ccy)}</text>
                  </g>
                );
              })}
              {sankey.sinks.map((id) => {
                const b = sankey.tgtBox.get(id)!; const h = b.y1 - b.y0;
                return (
                  <g key={id} className="cursor-pointer" onClick={() => navigate(`/entities/${encodeURIComponent(id)}`)}>
                    <rect x={798} y={b.y0} width={10} height={h} rx={3} fill="#2dd4bf" stroke={alertEntities.has(id) ? "#fb7185" : "transparent"} strokeWidth={2}>
                      <title>{`${shortId(id)} — receives ${Math.round(sankey.inTotals.get(id)!).toLocaleString("en-IN")} ${ccy}`}</title>
                    </rect>
                    <text x={816} y={(b.y0 + b.y1) / 2 - 2} className="fill-[#f2f0fb] text-[11px] font-semibold">{nodeLabel(id)}</text>
                    <text x={816} y={(b.y0 + b.y1) / 2 + 11} className="fill-[#a8a3c7] text-[10px]">{fmtBig(sankey.inTotals.get(id)!, ccy)}</text>
                  </g>
                );
              })}
            </svg>
          ) : (
            <p className="px-1 py-16 text-center text-[13px] text-muted-foreground">No transfers in {ccy || "this currency"} under the current filters — widen the scope or clear the search.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 pb-4 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#8b5cf6]" /> sender</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#2dd4bf]" /> receiver</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border-2 border-[#fb7185] bg-[#0b0a1a]" /> mentioned in ≥ 1 detection alert</span>
          <span>· ribbon thickness = value in {ccy || "—"} · hover for detail · click to profile</span>
          <span className="ml-auto font-semibold text-foreground/70">{hover ? `${shortId(hover.s)} → ${shortId(hover.r)} · ${num(hover.n)} transfers · ${Math.round(hover.v).toLocaleString("en-IN")} ${ccy}` : ""}</span>
        </div>
      </Card>
      <Card>
        <PanelTitle title="Flow over time" sub={`Value per ${trend.length > 1 && (Math.max(...ccyTxns.map((t) => t.epoch), 0) - Math.min(...ccyTxns.map((t) => t.epoch), Infinity)) <= 21 * 86400e3 ? "day" : "week"} in ${ccy || "—"} · teal line = transfers · amber dashed = alert-covered transfers`} />
        <p className="mt-1 flex items-start gap-1.5 px-5 text-[11px] leading-[18px] text-muted-foreground/90">
          <Info className="mt-[3px] h-3 w-3 shrink-0 text-[color:var(--teal)]" />
          <span><span className="font-semibold text-foreground/70">How it's computed — </span>transfers in {ccy || "the selected currency"} are bucketed into fixed calendar windows (daily when the visible span is ≤ 21 days, weekly otherwise). Bars sum {ccy} value per bucket; the amber line counts transfers whose id appears in this dataset's alert list — an overlay from Detections, not a new judgement by this page.</span>
        </p>
        <div className="h-64 px-3 pb-4 pt-3">
          <ChartBoundary label="Flow trend">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trend} margin={{ top: 6, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#a8a3c7", fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis yAxisId="v" tickFormatter={fmtAxis} tick={{ fill: "#a8a3c7", fontSize: 10 }} axisLine={false} tickLine={false} width={52} />
                <YAxis yAxisId="n" orientation="right" tickFormatter={fmtAxis} tick={{ fill: "#a8a3c7", fontSize: 10 }} axisLine={false} tickLine={false} width={34} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} contentStyle={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, backdropFilter: "blur(12px)" }}
                  formatter={(v, name) => [name === "v" ? `${Math.round(Number(v)).toLocaleString("en-IN")} ${ccy}` : num(Number(v)), name === "v" ? "Value" : name === "n" ? "Transfers" : "Alert-covered"]} />
                <Bar yAxisId="v" dataKey="v" fill="#8b5cf6" fillOpacity={0.75} radius={[3, 3, 0, 0]} maxBarSize={26} />
                <Line yAxisId="n" dataKey="n" stroke="#2dd4bf" strokeWidth={2} dot={false} />
                <Line yAxisId="n" dataKey="a" stroke="#fbbf24" strokeWidth={2} strokeDasharray="5 3" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartBoundary>
        </div>
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <PanelTitle title={`Top destinations (${ccy || "—"})`} sub="Receivers ranked by value received under filters" right={<Link to="/entities" className="text-xs text-[color:var(--primary)] hover:underline">All entities →</Link>} />
          <p className="mt-1 flex items-start gap-1.5 px-5 text-[11px] leading-[18px] text-muted-foreground/90">
            <Info className="mt-[3px] h-3 w-3 shrink-0 text-[color:var(--teal)]" />
            <span><span className="font-semibold text-foreground/70">How it's computed — </span>received amounts are summed per receiver in {ccy || "the selected currency"} and the top 10 charted; the full account id appears in the tooltip and on the entity page. Receivers of other currencies rank separately — switch the currency selector to compare.</span>
          </p>
          <div className="h-72 px-3 pb-4 pt-3">
            <ChartBoundary label="Top destinations">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dest} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
                  <XAxis type="number" tickFormatter={fmtAxis} tick={{ fill: "#a8a3c7", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="label" width={118} tick={{ fill: "#a8a3c7", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} contentStyle={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                    formatter={(v) => [`${Math.round(Number(v)).toLocaleString("en-IN")} ${ccy}`, "Received"]}
                    labelFormatter={(_l, p) => (p && p[0] ? p[0].payload.id : "")} />
                  <Bar dataKey="v" fill="#2dd4bf" fillOpacity={0.8} radius={[0, 3, 3, 0]} maxBarSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </ChartBoundary>
          </div>
        </Card>

        <Card>
          <PanelTitle title="Pass-through vs retention" sub={`Accounts that both receive and re-send in ${ccy || "—"} · who forwards, who keeps`} />
          <p className="mt-1 flex items-start gap-1.5 px-5 text-[11px] leading-[18px] text-muted-foreground/90">
            <Info className="mt-[3px] h-3 w-3 shrink-0 text-[color:var(--teal)]" />
            <span><span className="font-semibold text-foreground/70">How it's computed — </span>for each account with ≥ 2 inbound and ≥ 2 outbound transfers in {ccy || "the selected currency"}, the track shows total received and the fill shows the part re-sent (out/in, capped at 100% of the track). "Median hop" is the median hours from an inbound transfer to the account's first outbound within 30 days. A high ratio with a short hop describes intermediary mechanics — lawful for payroll and settlement houses, and a classic laundering trait when unexplained.</span>
          </p>
          <div className="space-y-2.5 px-5 pb-4 pt-3">
            {passRows.length === 0 && <p className="py-10 text-center text-[13px] text-muted-foreground">No account under these filters has both ≥ 2 inbound and ≥ 2 outbound transfers in {ccy || "this currency"}.</p>}
            {passRows.map((r) => {
              const fwd = Math.min(r.outV, r.inV);
              const pct = Math.round((fwd / r.inV) * 100);
              return (
                <div key={r.id} className="group">
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <Link to={`/entities/${encodeURIComponent(r.id)}`} className="mono truncate font-semibold text-foreground group-hover:text-[color:var(--primary)] group-hover:underline" title={r.id}>{shortId(r.id)}</Link>
                    <span className="tnum shrink-0 text-muted-foreground">{pct}% forwarded{r.lagH != null ? ` · median hop ${r.lagH < 1 ? "<1" : Math.round(r.lagH)}h` : ""}</span>
                  </div>
                  <div className="relative mt-1 h-2.5 overflow-hidden rounded-full bg-muted" title={`Received ${Math.round(r.inV).toLocaleString("en-IN")} ${ccy} across ${r.inN} transfers · sent ${Math.round(r.outV).toLocaleString("en-IN")} across ${r.outN}`}>
                    <div className="absolute inset-y-0 left-0 rounded-full bg-[color:var(--primary)]/70 transition-all duration-500" style={{ width: `${Math.max(2, pct)}%` }} />
                  </div>
                  <div className="tnum mt-0.5 flex justify-between text-[10px] text-muted-foreground">
                    <span>in {fmtBig(r.inV, ccy)} ({r.inN})</span>
                    <span>out {fmtBig(r.outV, ccy)} ({r.outN})</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
      <Card>
        <PanelTitle title="Two-hop journeys" sub="Real in → mid → out chains found in the ledger · same currency on both legs" right={<span className="text-xs text-muted-foreground">{journeys.length} chains shown</span>} />
        <p className="mt-1 flex items-start gap-1.5 px-5 text-[11px] leading-[18px] text-muted-foreground/90">
          <Info className="mt-[3px] h-3 w-3 shrink-0 text-[color:var(--teal)]" />
          <span><span className="font-semibold text-foreground/70">How it's computed — </span>the scan takes the busiest intermediate accounts (highest combined in + out in {ccy || "the selected currency"}), pairs their 3 most recent inbound transfers with the account's first outbound ≥ 30% of the inbound value within 7 days. Both legs must share a currency — cross-currency legs are never netted without an FX policy. The badge marks chains where any of the three accounts appears in a detection alert.</span>
        </p>
        <div className="grid gap-3 px-4 pb-4 pt-3 lg:grid-cols-2 2xl:grid-cols-4">
          {journeys.length === 0 && <p className="col-span-full py-8 text-center text-[13px] text-muted-foreground">No two-hop chains match under these filters — try a lower minimum amount or clear the search.</p>}
          {journeys.map((j, i) => (
            <div key={i} className="rounded-xl border border-border bg-[color:var(--glass)] p-3.5 backdrop-blur-md transition-colors hover:border-[color:var(--glass-border-hi)]">
              <div className="flex items-center gap-1 text-[13px] font-semibold">
                <Link to={`/entities/${encodeURIComponent(j.from)}`} className="mono truncate text-xs hover:underline" title={j.from}>{shortId(j.from)}</Link>
                <span className="shrink-0 text-[color:var(--teal)]">→</span>
                <Link to={`/entities/${encodeURIComponent(j.mid)}`} className={`mono truncate text-xs hover:underline ${alertEntities.has(j.mid) ? "text-[color:var(--warning)]" : ""}`} title={j.mid}>{shortId(j.mid)}</Link>
                <span className="shrink-0 text-[color:var(--teal)]">→</span>
                <Link to={`/entities/${encodeURIComponent(j.to)}`} className="mono truncate text-xs hover:underline" title={j.to}>{shortId(j.to)}</Link>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
                {([["hop gap", j.gapH < 1 ? "<1h" : `${j.gapH}h`], ["forwarded", `${Math.round(j.share * 100)}%`], ["combined", fmtBig(j.v, ccy)]] as [string, string][]).map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-[color:var(--glass-hi)] px-1.5 py-1.5">
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{k}</p>
                    <p className="tnum text-xs font-bold">{v}</p>
                  </div>
                ))}
              </div>
              <p className="mono mt-2 truncate text-[10px] text-[color:var(--primary)]" title={`${j.inId} → ${j.outId}`}>{j.inId} → {j.outId}</p>
              {j.flagged && <p className="mt-1 text-[10px] font-semibold text-[color:var(--warning)]">⚑ a chain account appears in a detection alert</p>}
            </div>
          ))}
        </div>
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <PanelTitle title="Channel rails" sub={`Which payment rails move the value · counts cover all currencies, value covers ${ccy || "—"}`} />
          <p className="mt-1 flex items-start gap-1.5 px-5 text-[11px] leading-[18px] text-muted-foreground/90">
            <Info className="mt-[3px] h-3 w-3 shrink-0 text-[color:var(--teal)]" />
            <span><span className="font-semibold text-foreground/70">How it's computed — </span>transfers are grouped by the channel field from the file (UPI, IMPS, NEFT, RTGS, SWIFT, card…). The count includes every currency under the filters; the value bar and median sum only {ccy || "the selected currency"} legs, so rails carrying foreign-currency traffic are not understated in count or overstated in value.</span>
          </p>
          <div className="space-y-2.5 px-5 pb-4 pt-3">
            {chanRows.map((c) => {
              const maxV = Math.max(...chanRows.map((x) => x.v), 1);
              return (
                <div key={c.name} className="group">
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="mono font-semibold uppercase tracking-wide">{c.name || "unknown"}</span>
                    <span className="tnum text-muted-foreground">{num(c.n)} tx · {fmtBig(c.v, ccy)} · median {fmtBig(c.med, ccy)}</span>
                  </div>
                  <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-muted" title={`${Math.round((c.n / Math.max(1, filtered.length)) * 100)}% of transfers under filters`}>
                    <div className="h-full rounded-full bg-gradient-to-r from-[#8b5cf6] to-[#2dd4bf] transition-all duration-500" style={{ width: `${Math.max(2, (c.v / maxV) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
            {chanRows.length === 0 && <p className="py-10 text-center text-[13px] text-muted-foreground">No channels under these filters.</p>}
          </div>
        </Card>

        <Card>
          <PanelTitle title="Cross-border corridors" sub="Origin → destination country pairs · value counts only the selected currency's legs" right={<Link to="/international" className="text-xs text-[color:var(--primary)] hover:underline">Cross-border desk →</Link>} />
          <p className="mt-1 flex items-start gap-1.5 px-5 text-[11px] leading-[18px] text-muted-foreground/90">
            <Info className="mt-[3px] h-3 w-3 shrink-0 text-[color:var(--teal)]" />
            <span><span className="font-semibold text-foreground/70">How it's computed — </span>every transfer's origin_country → dest_country pair is counted; the value column adds only legs denominated in {ccy || "the selected currency"}, so mixed-corridor totals never mix currencies. First/last seen are the extreme timestamps of the pair under the current filters.</span>
          </p>
          <div className="overflow-x-auto px-4 pb-4 pt-3">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead><tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                {["Corridor", "Transfers", `Value (${ccy || "—"})`, "First → last seen"].map((h) => <th key={h} className="px-2 py-1.5 font-medium">{h}</th>)}
              </tr></thead>
              <tbody>
                {corridors.map((c) => (
                  <tr key={c.route} className="border-b border-border/40 transition-colors hover:bg-[color:var(--glass-hi)]">
                    <td className="mono px-2 py-1.5 font-semibold">{c.route}</td>
                    <td className="tnum px-2 py-1.5">{num(c.n)}</td>
                    <td className="tnum px-2 py-1.5">{fmtBig(c.v, ccy)}</td>
                    <td className="tnum px-2 py-1.5 text-muted-foreground">{shortDate(c.first)} → {shortDate(c.last)}</td>
                  </tr>
                ))}
                {corridors.length === 0 && <tr><td colSpan={4} className="px-2 py-8 text-center text-muted-foreground">No corridors under these filters.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <Card>
        <PanelTitle title="How this page works" sub="Implementation notes and honest limits — every number above obeys these rules" />
        <div className="grid gap-x-6 gap-y-2 px-5 pb-5 pt-3 text-[12px] leading-5 text-muted-foreground md:grid-cols-2">
          {([
            ["Pipeline", "filter (search · scope · min amount) → currency view → aggregation → bound top-N. Every panel recomputes when any control changes; nothing is cached from a previous filter state."],
            ["Currency policy", `Value panels never cross-sum. The page operates on one currency at a time (${ccy || "none"} right now, defaulting to the dataset's largest); counts always state which currencies they cover.`],
            ["Flow map", "Aggregation key is the exact (sender, receiver) pair; top 18 links and their top endpoints are drawn. Node height and ribbon thickness are linear to value; both columns = pass-through. No identity or ownership is inferred from names."],
            ["Alert overlay", `Amber marks and rose rings come from this dataset's own ${num(ds.alerts.length)} detection alerts (txn ids and entity names matched exactly). This page adds no severity of its own.`],
            ["Journeys", "Two-hop chains only: inbound → account → outbound, ≥ 30% forwarded within 7 days, same currency on both legs. Longer paths live in the Entity Network graph."],
            ["Bounds", "Top-N limits (Sankey links, top receivers, top corridors, 8 pass rows, 8 journeys) exist for readability — the full evidence always remains in the ledger and in the CSV export."],
            ["Limitations", "No FX netting between currencies; no external country-risk or ownership data; aggregates hide individual outliers — cross-check suspicious accounts in Detections and the entity profile before concluding anything."],
          ] as [string, string][]).map(([k, v]) => (
            <p key={k}><span className="font-semibold text-foreground">{k}. </span>{v}</p>
          ))}
        </div>
      </Card>
    </div>
  );
}
