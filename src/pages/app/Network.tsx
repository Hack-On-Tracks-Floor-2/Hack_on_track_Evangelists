import { Card, Empty, Kpi, PanelTitle, RiskCharacter, SevBadge, btnGhost, btnPrimary, fmtAxis, fmtBig, num, shortId } from "@/components/app/Shell";
import { FraudSim } from "@/components/app/FraudSim";
import { download, getSelected, loadAll } from "@/lib/trace/store";
import cytoscape from "cytoscape";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/* ── One persistent graph core for the whole session ─────────────────────
   cytoscape's destroy() (via destroyRenderer()) nulls the core's renderer,
   but the cose layout always queues one more animation frame after stop();
   that frame ends in done() → positions() → endBatch() → renderer.notify()
   and throws "Cannot read properties of null (reading 'notify')" whenever
   the renderer is already gone. So this page never destroys the core: on
   unmount we stop it and call unmount(), which swaps in cytoscape's no-op
   NullRenderer (notify() becomes a counter increment), and the next visit's
   mount() brings the canvas renderer back on the new container. */
let core: cytoscape.Core | null = null;

type EdgeRow = { id: string; ts: number; amt: number; ccy: string };
type EdgeInfo = { s: string; r: string; ids: string[]; n: number; v: number; ccy: string; mixed: boolean; first: number; last: number; rows: EdgeRow[] };
type NodeStat = { inn: number; out: number; peers: number; ccy: string; alerts: number };

const SEV_NAME = ["low", "medium", "high", "critical"] as const;
const sevRank = (s: string) => (s === "critical" ? 3 : s === "high" ? 2 : s === "medium" ? 1 : 0);
const shortDate = (ts: number) => (ts ? new Date(ts).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }) : "—");

/** Latest per-mount UI callbacks + model. Graph handlers are attached once
 *  at creation and read from here, so they never go stale or stack up. */
const bridge: {
  setSel: (id: string | null) => void;
  setEdge: (e: EdgeInfo | null) => void;
  edges: EdgeInfo[];
} = {
  setSel: () => {},
  setEdge: () => {},
  edges: [],
};

export default function Network() {
  const ds = useMemo(() => { const a = loadAll(); return a.find((d) => d.id === getSelected()) ?? a[0]; }, []);
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q);
  const [layoutName, setLayoutName] = useState<"cose" | "concentric" | "circle" | "grid">("cose");
  const [minAmt, setMinAmt] = useState("");
  const [scope, setScope] = useState("");
  const [cur, setCur] = useState("");
  const [maxN] = useState(40);
  const [sel, setSel] = useState<string | null>(null);
  const [sim, setSim] = useState(false);
  const [edge, setEdge] = useState<EdgeInfo | null>(null);
  const [highlight, setHighlight] = useState<"none" | "cycles" | "fan">("none");
  const cyRef = useRef<HTMLDivElement>(null);
  const cy = useRef<cytoscape.Core | null>(null);
  const layoutRef = useRef<cytoscape.Layouts | null>(null);

  // Graph model: filters → top-degree entities → aggregated directed links.
  // Everything the page draws derives from this plus the raw ledger.
  const model = useMemo(() => {
    if (!ds) return null;
    let txns = ds.txns.filter((t) => (!minAmt || t.amount >= Number(minAmt)) && (!cur || t.currency === cur));
    if (scope === "domestic") txns = txns.filter((t) => t.origin_country === "IN" && t.dest_country === "IN");
    if (scope === "international") txns = txns.filter((t) => !(t.origin_country === "IN" && t.dest_country === "IN"));
    const accounts = new Set<string>();
    const ccyAgg = new Map<string, { n: number; v: number }>();
    txns.forEach((t) => {
      accounts.add(t.sender); accounts.add(t.receiver);
      const e = ccyAgg.get(t.currency) ?? { n: 0, v: 0 }; e.n++; e.v += t.amount; ccyAgg.set(t.currency, e);
    });
    const byCur = [...ccyAgg.entries()].map(([c, e]) => ({ c, ...e })).sort((a, b) => b.n - a.n);
    const deg = new Map<string, number>();
    txns.slice(0, 6000).forEach((t) => { deg.set(t.sender, (deg.get(t.sender) ?? 0) + 1); deg.set(t.receiver, (deg.get(t.receiver) ?? 0) + 1); });
    let top = [...deg.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxN).map(([id]) => id);
    if (dq) {
      const hit = top.filter((id) => id.toLowerCase().includes(dq.toLowerCase()));
      const nbr = new Set(hit);
      txns.forEach((t) => { if (hit.includes(t.sender)) nbr.add(t.receiver); if (hit.includes(t.receiver)) nbr.add(t.sender); });
      top = [...nbr].slice(0, maxN);
    }
    const set = new Set(top);
    const agg = new Map<string, EdgeInfo>();
    txns.forEach((t) => {
      if (!set.has(t.sender) || !set.has(t.receiver)) return;
      const k = `${t.sender}→${t.receiver}`;
      const e = agg.get(k) ?? { s: t.sender, r: t.receiver, n: 0, v: 0, ids: [], ccy: t.currency, mixed: false, first: t.epoch, last: t.epoch, rows: [] };
      e.n++; e.v += t.amount;
      if (t.currency !== e.ccy) e.mixed = true;
      e.first = Math.min(e.first, t.epoch); e.last = Math.max(e.last, t.epoch);
      if (e.ids.length < 8) e.ids.push(t.id);
      if (e.rows.length < 6) e.rows.push({ id: t.id, ts: t.epoch, amt: t.amount, ccy: t.currency });
      agg.set(k, e);
    });
    const ranked = top.map((id) => ({ id, deg: deg.get(id) ?? 0 }));
    const labelSet = new Set(ranked.slice(0, 14).map((n) => n.id));
    return {
      nodes: ranked.map((n) => ({ ...n, lbl: labelSet.has(n.id) ? n.id : "" })),
      edges: [...agg.values()].slice(0, 120),
      txnCount: txns.length, accounts: accounts.size, byCur,
    };
  }, [ds, dq, minAmt, scope, cur, maxN]);

  // Alert severity per entity (real detection output), for rose rings + panels.
  const alertSet = useMemo(() => {
    const m = new Map<string, { n: number; worst: number }>();
    if (!ds) return m;
    ds.alerts.forEach((a) => a.entities.forEach((en) => {
      const p = m.get(en) ?? { n: 0, worst: 0 };
      p.n++; p.worst = Math.max(p.worst, sevRank(a.severity)); m.set(en, p);
    }));
    return m;
  }, [ds]);

  // Structure metrics of the drawn subgraph (real graph theory on real links).
  const stats = useMemo(() => {
    if (!model) return null;
    const ids = new Set(model.nodes.map((n) => n.id));
    const edges = model.edges.filter((e) => ids.has(e.s) && ids.has(e.r));
    const n = ids.size, m = edges.length;
    const adj = new Map<string, string[]>();
    ids.forEach((x) => adj.set(x, []));
    edges.forEach((e) => { adj.get(e.s)!.push(e.r); adj.get(e.r)!.push(e.s); });
    let comps = 0; const seen = new Set<string>();
    for (const s of ids) {
      if (seen.has(s)) continue;
      comps++; const stack = [s]; seen.add(s);
      while (stack.length) { const c = stack.pop()!; for (const nx of adj.get(c) ?? []) if (!seen.has(nx)) { seen.add(nx); stack.push(nx); } }
    }
    const eset = new Set(edges.map((e) => `${e.s}\u0000${e.r}`));
    let rec = 0; edges.forEach((e) => { if (eset.has(`${e.r}\u0000${e.s}`)) rec++; });
    let flaggedEdges = 0; edges.forEach((e) => { if (alertSet.has(e.s) || alertSet.has(e.r)) flaggedEdges++; });
    return {
      n, m, flaggedEdges,
      density: n > 1 ? m / (n * (n - 1)) : 0,
      avgDeg: n ? (2 * m) / n : 0,
      comps, reciprocity: m ? rec / m : 0,
      hub: model.nodes[0] ?? null,
    };
  }, [model, alertSet]);

  // Daily transfer buckets over the drawn accounts (real timestamps).
  const flowTrend = useMemo(() => {
    if (!ds || !model) return [] as { d: string; n: number; f: number }[];
    const ids = new Set(model.nodes.map((x) => x.id));
    const flagged = new Set<string>();
    ds.alerts.forEach((a) => { if (a.entities.some((en) => ids.has(en))) a.txnIds.forEach((id) => flagged.add(id)); });
    const buckets = new Map<string, { d: string; n: number; f: number }>();
    ds.txns.forEach((t) => {
      if (!ids.has(t.sender) && !ids.has(t.receiver)) return;
      const k = new Date(t.epoch).toISOString().slice(0, 10);
      const b = buckets.get(k) ?? { d: k.slice(5), n: 0, f: 0 };
      b.n++; if (flagged.has(t.id)) b.f++;
      buckets.set(k, b);
    });
    return [...buckets.values()].slice(-30);
  }, [ds, model]);

  // Per-account ledger roll-ups for the hubs table (real in/out + currencies).
  const nodeStats = useMemo(() => {
    const m = new Map<string, NodeStat>();
    if (!ds || !model) return m;
    model.nodes.forEach((n) => m.set(n.id, { inn: 0, out: 0, peers: 0, ccy: "", alerts: 0 }));
    const peers = new Map<string, Set<string>>();
    const ccyBy = new Map<string, Map<string, number>>();
    m.forEach((_, id) => { peers.set(id, new Set()); ccyBy.set(id, new Map()); });
    ds.txns.forEach((t) => {
      const a = m.get(t.sender), b = m.get(t.receiver);
      if (a) { a.out++; peers.get(t.sender)!.add(t.receiver); const cm = ccyBy.get(t.sender)!; cm.set(t.currency, (cm.get(t.currency) ?? 0) + t.amount); }
      if (b) { b.inn++; peers.get(t.receiver)!.add(t.sender); const cm = ccyBy.get(t.receiver)!; cm.set(t.currency, (cm.get(t.currency) ?? 0) + t.amount); }
    });
    m.forEach((s, id) => {
      s.peers = peers.get(id)!.size;
      const top = [...(ccyBy.get(id) ?? new Map<string, number>()).entries()].sort((x, y) => y[1] - x[1])[0];
      s.ccy = top?.[0] ?? "";
      s.alerts = alertSet.get(id)?.n ?? 0;
    });
    return m;
  }, [ds, model, alertSet]);

  // Full ledger roll-up for the selected entity (real in/out, peers, days).
  const selInfo = useMemo(() => {
    if (!sel || !ds) return null;
    const tx = ds.txns.filter((t) => t.sender === sel || t.receiver === sel);
    let selIn = 0, selOut = 0, inN = 0, outN = 0, first = Infinity, last = 0;
    const peers = new Map<string, number>();
    const days = new Map<string, { d: string; n: number }>();
    const ccy = new Map<string, { n: number; v: number }>();
    tx.forEach((t) => {
      if (t.receiver === sel) { inN++; selIn += t.amount; peers.set(t.sender, (peers.get(t.sender) ?? 0) + 1); }
      else { outN++; selOut += t.amount; peers.set(t.receiver, (peers.get(t.receiver) ?? 0) + 1); }
      const k = new Date(t.epoch).toISOString().slice(0, 10);
      const b = days.get(k) ?? { d: k.slice(5), n: 0 }; b.n++; days.set(k, b);
      const c = ccy.get(t.currency) ?? { n: 0, v: 0 }; c.n++; c.v += t.amount; ccy.set(t.currency, c);
      first = Math.min(first, t.epoch); last = Math.max(last, t.epoch);
    });
    const alerts = ds.alerts.filter((a) => a.entities.includes(sel));
    return {
      tx, inN, outN, selIn, selOut, peers: peers.size, activeDays: days.size,
      topPeers: [...peers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
      days: [...days.values()].slice(-21),
      ccy: [...ccy.entries()].map(([c, e]) => ({ c, ...e })).sort((a, b) => b.n - a.n),
      alerts, first: Number.isFinite(first) ? first : 0, last,
    };
  }, [sel, ds]);

  // Degree histogram of the drawn accounts (real distribution).
  const degDist = useMemo(() => {
    if (!model || !model.nodes.length) return [] as { lbl: string; n: number }[];
    const maxDeg = Math.max(...model.nodes.map((x) => x.deg), 1);
    const buckets = Math.min(8, Math.max(4, Math.ceil(Math.sqrt(model.nodes.length))));
    const size = Math.max(1, Math.ceil(maxDeg / buckets));
    const arr = Array.from({ length: buckets }, (_, i) => ({ lbl: `${i * size + 1}–${(i + 1) * size}`, n: 0 }));
    model.nodes.forEach((x) => { arr[Math.min(buckets - 1, Math.floor((x.deg - 1) / size))].n++; });
    return arr.filter((b) => b.n > 0);
  }, [model]);

  // Currency totals of the drawn accounts — one bar per currency, never summed.
  const ccyMix = useMemo(() => {
    if (!ds || !model) return [] as { c: string; n: number; v: number }[];
    const ids = new Set(model.nodes.map((x) => x.id));
    const m = new Map<string, { n: number; v: number }>();
    ds.txns.forEach((t) => {
      if (!ids.has(t.sender) && !ids.has(t.receiver)) return;
      const e = m.get(t.currency) ?? { n: 0, v: 0 }; e.n++; e.v += t.amount; m.set(t.currency, e);
    });
    return [...m.entries()].map(([c, e]) => ({ c, ...e })).sort((a, b) => b.v - a.v).slice(0, 8);
  }, [ds, model]);

  // Cross-border corridors touching the drawn accounts (real country pairs).
  const corridors = useMemo(() => {
    if (!ds || !model) return [] as { o: string; d: string; n: number; v: number; ccy: string }[];
    const ids = new Set(model.nodes.map((x) => x.id));
    const m = new Map<string, { o: string; d: string; n: number; ccy: Map<string, number> }>();
    ds.txns.forEach((t) => {
      if (!ids.has(t.sender) && !ids.has(t.receiver)) return;
      const k = `${t.origin_country}→${t.dest_country}`;
      const e = m.get(k) ?? { o: t.origin_country, d: t.dest_country, n: 0, ccy: new Map<string, number>() };
      e.n++; e.ccy.set(t.currency, (e.ccy.get(t.currency) ?? 0) + t.amount);
      m.set(k, e);
    });
    return [...m.values()].map((e) => {
      const top = [...e.ccy.entries()].sort((a, b) => b[1] - a[1])[0];
      return { o: e.o, d: e.d, n: e.n, ccy: top?.[0] ?? "", v: top?.[1] ?? 0 };
    }).sort((a, b) => b.n - a.n).slice(0, 8);
  }, [ds, model]);

  const cycleNodes = useMemo(() => {
    if (!model || highlight !== "cycles") return new Set<string>();
    const adj = new Map<string, string[]>();
    model.edges.forEach((e) => { if (!adj.has(e.s)) adj.set(e.s, []); adj.get(e.s)!.push(e.r); });
    const hit = new Set<string>();
    for (const s of model.nodes.map((n) => n.id).slice(0, 60)) {
      const seen = new Set([s]);
      const stack = [s];
      while (stack.length) {
        const c = stack.pop()!;
        for (const nx of adj.get(c) ?? []) {
          if (nx === s && seen.size >= 2) { seen.forEach((x) => hit.add(x)); }
          else if (!seen.has(nx) && seen.size < 4) { seen.add(nx); stack.push(nx); }
        }
      }
    }
    return hit;
  }, [model, highlight]);

  const fanNodes = useMemo(() => {
    if (!model || highlight !== "fan") return new Set<string>();
    const inn = new Map<string, Set<string>>(), out = new Map<string, Set<string>>();
    model.edges.forEach((e) => {
      if (!inn.has(e.r)) inn.set(e.r, new Set());
      inn.get(e.r)!.add(e.s);
      if (!out.has(e.s)) out.set(e.s, new Set());
      out.get(e.s)!.add(e.r);
    });
    const hit = new Set<string>();
    inn.forEach((s, k) => { if (s.size >= 4) hit.add(k); });
    out.forEach((s, k) => { if (s.size >= 4) hit.add(k); });
    return hit;
  }, [model, highlight]);

  function stopLayout() {
    try { layoutRef.current?.stop(); } catch { /* already finished */ }
    layoutRef.current = null;
  }
  /** Focus an entity from the tables: panel state + graph selection stay in sync. */
  function focusEntity(id: string) {
    setSel(id); setEdge(null);
    try { core?.nodes().unselect(); core?.nodes().filter((n) => n.id() === id).select(); } catch { /* graph not mounted */ }
  }
  useEffect(() => {
    bridge.setSel = setSel;
    bridge.setEdge = setEdge;
    return () => { bridge.setSel = () => {}; bridge.setEdge = () => {}; };
  }, [setSel, setEdge]);

  useEffect(() => () => {
    stopLayout();
    try { core?.stop(); } catch { /* already stopped */ }
    // Detach instead of destroy(): unmount() swaps in the no-op NullRenderer,
    // so a cose frame that was already queued drains harmlessly instead of
    // crashing on a null renderer (see the module comment).
    try { core?.unmount(); } catch { /* not mounted */ }
    bridge.edges = [];
    cy.current = null;
  }, []);

  useEffect(() => {
    if (!cyRef.current || !model) return;
    bridge.edges = model.edges;
    stopLayout();
    const hot = highlight === "none" ? null : highlight === "cycles" ? cycleNodes : fanNodes;
    const els = [
      ...model.nodes.map((n) => ({ data: { id: n.id, deg: n.deg, lbl: n.lbl }, classes: alertSet.has(n.id) ? "flagged" : "" })),
      ...model.edges.map((e, i) => ({ data: { id: `e${i}`, source: e.s, target: e.r, n: e.n, v: Math.round(e.v) } })),
    ];
    const existing = core;
    let graph: cytoscape.Core;
    if (!existing || existing.destroyed()) {
      graph = cytoscape({ container: cyRef.current, elements: els,
        style: [
          { selector: "node", style: { "background-color": "#6ea8ff", label: "data(lbl)", color: "#96A5BA", "font-size": 9, "font-family": "JetBrains Mono, monospace", width: "mapData(deg, 1, 20, 14, 42)", height: "mapData(deg, 1, 20, 14, 42)", "border-width": 2, "border-color": "#253247", "underlay-color": "#5B8CFF", "underlay-opacity": 0.16, "underlay-padding": 5 } },
          { selector: "node.flagged", style: { "border-color": "#fb7185", "border-width": 2.5 } },
          { selector: "node.hot", style: { "underlay-color": "#a78bfa", "underlay-opacity": 0.45, "underlay-padding": 8 } },
          { selector: "node.highlight", style: { "background-color": "#F4B544", "border-color": "#F4B544", label: "data(id)", "underlay-color": "#F4B544", "underlay-opacity": 0.4, "underlay-padding": 6 } },
          { selector: "node:selected", style: { "background-color": "#26C6B8", "border-color": "#26C6B8", "border-width": 3, label: "data(id)", "underlay-color": "#26C6B8", "underlay-opacity": 0.5, "underlay-padding": 8 } },
          { selector: ".dim", style: { opacity: 0.12 } },
          { selector: "edge", style: { width: "mapData(n, 1, 10, 1, 5)", "line-color": "#3b4c68", "target-arrow-color": "#3b4c68", "target-arrow-shape": "triangle", "curve-style": "bezier", opacity: 0.8 } },
          { selector: "edge:selected", style: { "line-color": "#26C6B8", "target-arrow-color": "#26C6B8", width: 3 } },
        ],
        layout: { name: "cose", animate: false, randomize: false, nodeRepulsion: 8000, idealEdgeLength: 100, padding: 24 },
      });
      core = graph;
      // Attached once for the session; they read live state from `bridge`.
      graph.on("tap", "node", (e) => { bridge.setSel(e.target.id()); bridge.setEdge(null); });
      graph.on("tap", "edge", (e) => {
        const d = e.target.data();
        const m = bridge.edges.find((x) => x.s === d.source && x.r === d.target) ?? null;
        bridge.setEdge(m);
      });
      graph.on("tap", (e) => { if (e.target === graph) { bridge.setSel(null); bridge.setEdge(null); } });
      graph.on("mouseover", "node", (e) => {
        e.target.addClass("hot");
        const nb = e.target.closedNeighborhood();
        core?.elements().not(nb).addClass("dim");
      });
      graph.on("mouseout", "node", (e) => { e.target.removeClass("hot"); core?.elements().removeClass("dim"); });
    } else {
      // Returning to the page: re-home the canvas renderer on this mount's
      // container, then swap in the current model's elements.
      graph = existing;
      graph.mount(cyRef.current);
      graph.batch(() => {
        graph.elements().remove();
        graph.add(els);
      });
    }
    cy.current = graph;
    stopLayout();
    layoutRef.current = graph.layout({ name: "cose", animate: true, animationDuration: 600, randomize: false, nodeRepulsion: 8000, idealEdgeLength: 100, padding: 24, fit: true });
    layoutRef.current.run();
    if (hot && hot.size) graph.nodes().filter((n) => hot.has(n.id())).addClass("highlight");
    return () => { stopLayout(); };
    // The highlight sets and alert classes derive from `model` (and its filter
    // inputs), so re-running this effect on model changes is sufficient.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  useEffect(() => {
    if (!cy.current) return;
    const base = { animate: true, animationDuration: 500, padding: 24, fit: true };
    const opts = layoutName === "cose"
      ? { ...base, name: "cose" as const, randomize: false, nodeRepulsion: 8000, idealEdgeLength: 100 }
      : { ...base, name: layoutName as "concentric" | "circle" | "grid" };
    stopLayout();
    layoutRef.current = cy.current.layout(opts);
    layoutRef.current.run();
    return () => { stopLayout(); };
  }, [layoutName]);

  useEffect(() => {
    if (!cy.current) return;
    cy.current.nodes().removeClass("highlight");
    const hot = highlight === "none" ? null : highlight === "cycles" ? cycleNodes : fanNodes;
    if (hot && hot.size) cy.current.nodes().filter((n) => hot.has(n.id())).addClass("highlight");
  }, [highlight, cycleNodes, fanNodes]);

  if (!ds) return <Card><Empty title="No dataset available" body="Upload a transaction CSV or generate a synthetic dataset to begin analysis." /></Card>;
  if (!model || !stats) return null;
  const topCcy = model.byCur[0]?.c ?? "";
  const alertLinked = model.nodes.filter((n) => alertSet.has(n.id)).length;

  return (
    <div className="space-y-4">
      {/* KPI strip — every figure computed from the filtered ledger */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        <div className="rise rise-1"><Kpi label="Accounts in scope" value={num(model.accounts)} sub={`${num(model.txnCount)} transfers under filters`} /></div>
        <div className="rise rise-2"><Kpi label="Entities in view" value={num(stats.n)} sub={`top-degree hubs of ${num(model.accounts)}`} accent="var(--teal)" /></div>
        <div className="rise rise-3"><Kpi label="Connections drawn" value={num(stats.m)} sub="bounded for readability" accent="var(--teal)" /></div>
        <div className="rise rise-4"><Kpi label="Active days in view" value={num(flowTrend.length)} sub={`${num(flowTrend.reduce((s, b) => s + b.n, 0))} transfers plotted`} spark={flowTrend.map((b) => b.n)} /></div>
        <div className="rise rise-5"><Kpi label={topCcy ? `Value (${topCcy} only)` : "Value"} value={model.byCur[0] ? fmtBig(model.byCur[0].v, topCcy) : "—"} sub="single-currency aggregate · never cross-summed" accent="var(--warning)" /></div>
        <div className="rise rise-6"><Kpi label="Alert-linked entities" value={num(alertLinked)} sub={`${num(stats.flaggedEdges)} links touch a flagged account`} accent="var(--destructive)" /></div>
      </div>

      {/* graph + context panel */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <div className="flex flex-wrap items-center gap-2 px-4 pt-4">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search entity…" className="w-44 rounded-full border border-input bg-[color:var(--glass-hi)] px-3 py-1.5 text-[13px] outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-[color:var(--ring)]/60" aria-label="Search entity" />
            <select value={scope} onChange={(e) => setScope(e.target.value)} className="rounded-full border border-input bg-[color:var(--glass)] px-3 py-1.5 text-xs backdrop-blur-md transition-colors hover:border-[color:var(--glass-border-hi)]" aria-label="Scope"><option value="">Domestic + Intl</option><option value="domestic">Domestic</option><option value="international">International</option></select>
            <select value={cur} onChange={(e) => setCur(e.target.value)} className="rounded-full border border-input bg-[color:var(--glass)] px-3 py-1.5 text-xs backdrop-blur-md transition-colors hover:border-[color:var(--glass-border-hi)]" aria-label="Currency"><option value="">All currencies</option>{[...new Set(ds.txns.map((t) => t.currency))].map((c) => <option key={c}>{c}</option>)}</select>
            <input value={minAmt} onChange={(e) => setMinAmt(e.target.value)} placeholder="Min amount" inputMode="numeric" className="w-24 rounded-full border border-input bg-[color:var(--glass-hi)] px-3 py-1.5 text-xs outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-[color:var(--ring)]/60" aria-label="Minimum amount" />
            <select value={highlight} onChange={(e) => setHighlight(e.target.value as never)} className="rounded-full border border-input bg-[color:var(--glass)] px-3 py-1.5 text-xs backdrop-blur-md transition-colors hover:border-[color:var(--glass-border-hi)]" aria-label="Highlight">
              <option value="none">No highlight</option><option value="cycles">Circular routes</option><option value="fan">Fan-in / fan-out</option>
            </select>
            <div className="flex overflow-hidden rounded-full border border-border text-xs" role="group" aria-label="Graph layout">
              {( (["cose", "concentric", "circle", "grid"] as unknown) as ("cose" | "concentric" | "circle" | "grid")[]).map((l) => (
                <button key={l} onClick={() => setLayoutName(l)} className={`px-2.5 py-1.5 capitalize transition-colors ${layoutName === l ? "bg-[color:var(--primary)]/15 font-semibold text-[#c4b5fd]" : "text-muted-foreground hover:bg-[color:var(--glass-hi)] hover:text-foreground"}`}>{l}</button>
              ))}
            </div>
            <div className="ml-auto flex gap-1.5">
              <button onClick={() => cy.current?.zoom(cy.current.zoom() * 1.25)} className={btnGhost}>+</button>
              <button onClick={() => cy.current?.zoom(cy.current.zoom() / 1.25)} className={btnGhost}>−</button>
              <button onClick={() => cy.current?.fit()} className={btnGhost}>Reset</button>
              <button onClick={() => download(`${ds.name}-graph.json`, JSON.stringify({ nodes: model.nodes, edges: model.edges }, null, 2), "application/json")} className={btnGhost}>Export</button>
            </div>
          </div>
          <div className="px-4 pt-3">
            <div
              ref={cyRef}
              className="h-[480px] rounded-xl border border-border xl:h-[560px]"
              style={{
                backgroundColor: "rgba(7,6,17,0.55)",
                backgroundImage: "radial-gradient(rgba(255,255,255,0.055) 1px, transparent 1px), radial-gradient(900px 420px at 18% -10%, rgba(139,92,246,0.16), transparent 60%), radial-gradient(700px 380px at 95% 108%, rgba(45,212,191,0.10), transparent 58%)",
                backgroundSize: "24px 24px, auto, auto",
              }}
              role="application" aria-label="Entity relationship graph"
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 pt-3 text-[11px] text-muted-foreground">
            <LegendDot color="#6ea8ff" label="account / counterparty (neutral — never red by default)" />
            <LegendDot color="#fb7185" ring label="rose ring = mentioned in ≥1 detection alert" />
            <LegendDot color="#F4B544" label="amber = highlighted pattern (cycles / fan)" />
            <LegendDot color="#26C6B8" label="teal = selected" />
            <span>→ arrow = funds flow · thickness = transfer count</span>
          </div>
          <p className="px-4 pb-4 pt-2 text-[11px] leading-5 text-muted-foreground">Pan, scroll-zoom, click nodes and edges. Every node, link and chart on this page is computed from your imported ledger — no invented identities, positions, or ownership.</p>
        </Card>

        <Card className="h-fit p-4">
          {sel ? (
            selInfo && (
              <div>
                <div className="flex items-start justify-between gap-2">
                  <PanelTitle title={shortId(sel)} sub="Entity context · provenance: imported from your upload" />
                  {selInfo.alerts.length > 0 && <span className="mt-1 shrink-0"><RiskCharacter severity={SEV_NAME[Math.max(...selInfo.alerts.map((a) => sevRank(a.severity)))]} size={30} /></span>}
                </div>
                <p className="mono mt-2 break-all px-1 text-[10px] leading-4 text-muted-foreground" title={sel}>{sel}</p>
                <dl className="mt-3 space-y-2 px-1 text-[13px]">
                  {([["Transactions", String(selInfo.tx.length)],
                    ["Inbound value", selInfo.selIn.toLocaleString("en-IN", { maximumFractionDigits: 0 })],
                    ["Outbound value", selInfo.selOut.toLocaleString("en-IN", { maximumFractionDigits: 0 })],
                    ["Unique counterparties", String(selInfo.peers)],
                    ["Active days", String(selInfo.activeDays)],
                    ["Related alerts", String(selInfo.alerts.length)]] as [string, string][]).map(([k, x]) => (
                    <div key={k} className="flex justify-between border-b border-border/50 pb-1.5"><dt className="text-muted-foreground">{k}</dt><dd className="tnum font-semibold">{x}</dd></div>))}
                </dl>

                {/* real in/out split */}
                <div className="mt-3 px-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Flow direction</p>
                  <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-[color:var(--teal)] transition-all duration-700" style={{ width: `${selInfo.tx.length ? (selInfo.inN / selInfo.tx.length) * 100 : 0}%` }} />
                    <div className="h-full flex-1 bg-[color:var(--primary)]" />
                  </div>
                  <p className="tnum mt-1 text-[11px] text-muted-foreground">{selInfo.inN} in · {selInfo.outN} out — first {shortDate(selInfo.first)}, last {shortDate(selInfo.last)}</p>
                </div>

                {/* daily activity — real buckets of this entity's transfers */}
                {selInfo.days.length > 1 && (
                  <div className="mt-3 px-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Daily activity</p>
                    <div className="mt-1 h-20">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={selInfo.days}>
                          <XAxis dataKey="d" hide />
                          <YAxis hide />
                          <Tooltip contentStyle={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }} />
                          <Bar dataKey="n" name="Transfers" fill="#8B5CF6" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* counterparties — real counts */}
                {selInfo.topPeers.length > 0 && (
                  <div className="mt-3 px-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Top counterparties</p>
                    <div className="mt-1.5 space-y-1.5">
                      {selInfo.topPeers.map(([pid, n]) => (
                        <Link key={pid} to={`/entities/${encodeURIComponent(pid)}`} className="group flex items-center gap-2 text-xs" title={pid}>
                          <span className="mono w-28 truncate text-muted-foreground group-hover:text-[#c4b5fd]">{shortId(pid)}</span>
                          <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <span className="absolute inset-y-0 left-0 rounded-full bg-[color:var(--primary)]" style={{ width: `${(n / selInfo.topPeers[0][1]) * 100}%` }} />
                          </span>
                          <span className="tnum w-8 text-right text-muted-foreground">{n}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* currencies seen on this entity */}
                <div className="mt-3 px-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Currencies (never cross-summed)</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {selInfo.ccy.slice(0, 4).map((c) => (
                      <span key={c.c} className="tnum rounded-full border border-border bg-[color:var(--glass)] px-2 py-0.5 text-[10px] text-muted-foreground">{c.c} · {num(c.n)} · {fmtBig(c.v)}</span>
                    ))}
                  </div>
                </div>

                {selInfo.alerts.slice(0, 4).map((a) => (
                  <Link key={a.id} to={`/detections/${a.id}`} className="mt-1.5 flex items-center gap-2 rounded-lg border border-border p-2 text-[13px] transition-colors hover:bg-[color:var(--glass-hi)]">
                    <SevBadge sev={a.severity} /><span className="min-w-0 flex-1 truncate">{a.title}</span>
                  </Link>
                ))}
                {selInfo.alerts.length > 0 && (
                  <button onClick={() => setSim(true)} className={`${btnPrimary} mt-3 w-full`}>
                    ⚑ Run fraud simulation — {selInfo.alerts.length} alert{selInfo.alerts.length === 1 ? "" : "s"}
                  </button>
                )}
                <div className="mt-3 flex gap-1.5">
                  <button onClick={() => setQ(sel)} className={btnGhost}>Show neighbours</button>
                  <Link to={`/entities/${encodeURIComponent(sel)}`} className="rounded-full bg-[color:var(--primary)]/90 px-3.5 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-[color:var(--primary)]">Full profile →</Link>
                </div>
              </div>
            )
          ) : edge ? (
            <div>
              <PanelTitle title={`${shortId(edge.s)} → ${shortId(edge.r)}`} sub={`${edge.n} transfer${edge.n === 1 ? "" : "s"} · ${edge.mixed ? "mixed currencies" : `${Math.round(edge.v).toLocaleString("en-IN")} ${edge.ccy}`}`} />
              <p className="mono mt-2 break-all px-1 text-[10px] leading-4 text-muted-foreground">{edge.s} → {edge.r}</p>
              <dl className="mt-3 space-y-2 px-1 text-[13px]">
                {([["Average transfer", edge.mixed ? "mixed" : `${Math.round(edge.v / Math.max(1, edge.n)).toLocaleString("en-IN")} ${edge.ccy}`],
                  ["First seen", shortDate(edge.first)],
                  ["Last seen", shortDate(edge.last)],
                  ["Sample transfers", `${edge.rows.length} of ${edge.n}`]] as [string, string][]).map(([k, x]) => (
                  <div key={k} className="flex justify-between border-b border-border/50 pb-1.5"><dt className="text-muted-foreground">{k}</dt><dd className="tnum font-semibold">{x}</dd></div>))}
              </dl>
              <p className="mt-3 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Transfers on this link</p>
              <div className="mt-1.5 space-y-1">
                {edge.rows.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-2 py-1 text-xs">
                    <span className="mono truncate text-muted-foreground" title={r.id}>{r.id}</span>
                    <span className="tnum shrink-0 text-muted-foreground">{shortDate(r.ts)}</span>
                    <span className="tnum shrink-0 font-semibold">{r.amt.toLocaleString("en-IN", { maximumFractionDigits: 0 })} <span className="text-[10px] text-muted-foreground">{r.ccy}</span></span>
                  </div>
                ))}
              </div>
              <p className="mono mt-2 px-1 text-[11px] leading-5 text-muted-foreground">{edge.ids.join(" · ")}</p>
              <Link to="/transactions" className="mt-3 inline-block px-1 text-[13px] text-[color:var(--primary)] hover:underline">Inspect in ledger →</Link>
            </div>
          ) : (
            <div>
              <PanelTitle title="Context panel" sub="Select a node for its profile, or an edge for exact transactions" />
              <div className="mt-3 grid grid-cols-2 gap-2">
                {([["Density", `${(stats.density * 100).toFixed(1)}%`], ["Avg degree", stats.avgDeg.toFixed(1)], ["Components", String(stats.comps)], ["Reciprocity", `${Math.round(stats.reciprocity * 100)}%`]] as [string, string][]).map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-border/60 bg-[color:var(--glass)] px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{k}</p>
                    <p className="tnum display text-lg font-bold">{v}</p>
                  </div>
                ))}
              </div>
              {stats.hub && (
                <div className="mt-3 rounded-lg border border-border/60 bg-[color:var(--glass)] px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Central hub</p>
                  <Link to={`/entities/${encodeURIComponent(stats.hub.id)}`} className="mono mt-1 block truncate text-[13px] text-[color:var(--primary)] hover:underline" title={stats.hub.id}>{shortId(stats.hub.id)}</Link>
                  <p className="tnum mt-0.5 text-[11px] text-muted-foreground">{stats.hub.deg} transfers · {nodeStats.get(stats.hub.id)?.peers ?? 0} counterparties</p>
                </div>
              )}
              <p className="mt-3 px-1 text-[13px] leading-6 text-muted-foreground">Click any node for its full ledger roll-up — flows, counterparties, daily activity and linked alerts. Click a link to see the exact transfers behind it.</p>
            </div>
          )}
        </Card>
      </div>

      {/* analytics: activity + degree distribution */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <PanelTitle title="Transfer activity in view" sub="Every transaction touching the drawn accounts · amber line = transfers covered by a detection alert" />
          <div className="h-56 px-2 pb-3 pt-2">
            <ResponsiveContainer>
              <ComposedChart data={flowTrend}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="d" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} width={40} tickFormatter={(v: number) => fmtAxis(v)} />
                <Tooltip contentStyle={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, backdropFilter: "blur(12px)" }} />
                <Bar dataKey="n" name="Transfers" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                <Line dataKey="f" name="Alert-covered" stroke="#FBBF24" strokeWidth={1.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <PanelTitle title="Degree distribution" sub="How connected the drawn accounts are · real histogram" />
          <div className="h-56 px-2 pb-3 pt-2">
            {degDist.length > 0 ? (
              <ResponsiveContainer>
                <BarChart data={degDist}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="lbl" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} width={28} />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} contentStyle={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="n" name="Accounts" fill="#2DD4BF" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="px-3 py-8 text-center text-[13px] text-muted-foreground">No accounts in view.</p>}
          </div>
        </Card>
      </div>

      {/* analytics: hubs + currency mix */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <PanelTitle title="Central accounts (hubs)" sub="Ranked by connections in the current view · every column straight from the ledger" right={<Link to="/entities" className="text-xs text-[color:var(--primary)] hover:underline">All entities →</Link>} />
          <div className="overflow-x-auto px-2 pb-3 pt-1">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead><tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                {["Account", "In", "Out", "Counterparties", "Dominant ccy", "Alerts"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
              </tr></thead>
              <tbody>
                {model.nodes.slice(0, 10).map((n) => {
                  const s = nodeStats.get(n.id) ?? { inn: 0, out: 0, peers: 0, ccy: "", alerts: 0 };
                  const worst = alertSet.get(n.id)?.worst ?? -1;
                  return (
                    <tr key={n.id} className="border-b border-border/40 transition-colors hover:bg-[color:var(--glass-hi)]">
                      <td className="max-w-[220px] px-3 py-2">
                        <button onClick={() => focusEntity(n.id)} className="mono block w-full truncate text-left text-xs text-[color:var(--primary)] hover:underline" title={n.id}>{shortId(n.id)}</button>
                      </td>
                      <td className="tnum px-3 py-2">{num(s.inn)}</td>
                      <td className="tnum px-3 py-2">{num(s.out)}</td>
                      <td className="tnum px-3 py-2">{num(s.peers)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{s.ccy || "—"}</td>
                      <td className="px-3 py-2">{s.alerts > 0 ? <span className="flex items-center gap-1.5"><RiskCharacter severity={SEV_NAME[Math.max(0, worst)]} size={22} /><span className="tnum text-xs">{s.alerts}</span></span> : <span className="text-xs text-muted-foreground">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {model.nodes.length === 0 && <p className="px-3 py-5 text-center text-[13px] text-muted-foreground">No accounts match the current filters.</p>}
          </div>
        </Card>
        <Card>
          <PanelTitle title="Currency mix in view" sub="Original-currency totals of the drawn accounts" />
          <div className="h-56 px-2 pb-2 pt-2">
            {ccyMix.length > 0 ? (
              <ResponsiveContainer>
                <BarChart data={ccyMix} layout="vertical" margin={{ left: 4, right: 16 }}>
                  <CartesianGrid stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickFormatter={(v: number) => fmtAxis(v)} />
                  <YAxis type="category" dataKey="c" width={44} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} contentStyle={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="v" name="Value (per currency)" fill="#FBBF24" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="px-3 py-8 text-center text-[13px] text-muted-foreground">No currency data in view.</p>}
          </div>
          <p className="px-4 pb-3 text-[11px] leading-5 text-muted-foreground">Bars share an axis for shape only — values in different currencies are never added together.</p>
        </Card>
      </div>

      {/* analytics: corridors + alert-linked entities */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <PanelTitle title="Corridors in view" sub="Origin → destination country pairs touching the drawn accounts" right={<Link to="/international" className="text-xs text-[color:var(--primary)] hover:underline">Cross-border desk →</Link>} />
          <div className="space-y-2 px-4 py-3">
            {corridors.map((c) => (
              <div key={`${c.o}-${c.d}`}>
                <div className="flex items-center justify-between text-xs">
                  <span className="mono text-foreground">{c.o} <span className="text-[color:var(--teal)]">→</span> {c.d}</span>
                  <span className="tnum text-muted-foreground">{num(c.n)} transfers · {fmtBig(c.v, c.ccy)} <span className="text-[10px]">({c.ccy})</span></span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-muted">
                  <div className="h-1.5 rounded-full bg-gradient-to-r from-[color:var(--primary)] to-[color:var(--teal)] transition-all duration-700" style={{ width: `${corridors[0] ? (c.n / corridors[0].n) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
            {corridors.length === 0 && <p className="py-4 text-center text-[13px] text-muted-foreground">No corridor traffic under the current filters.</p>}
          </div>
        </Card>
        <Card>
          <PanelTitle title="Entities under alert" sub="Drawn accounts mentioned by detection rules · worst severity wins" right={<Link to="/detections" className="text-xs text-[color:var(--primary)] hover:underline">All alerts →</Link>} />
          <div className="space-y-1 px-3 py-2">
            {model.nodes.filter((n) => alertSet.has(n.id)).slice(0, 8).map((n) => {
              const a = alertSet.get(n.id)!;
              const peak = Math.max(1, ...model.nodes.map((x) => alertSet.get(x.id)?.n ?? 0));
              return (
                <div key={n.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-[color:var(--glass-hi)]">
                  <RiskCharacter severity={SEV_NAME[a.worst]} size={28} />
                  <button onClick={() => focusEntity(n.id)} className="mono w-32 shrink-0 truncate text-left text-xs text-foreground hover:text-[#c4b5fd]" title={n.id}>{shortId(n.id)}</button>
                  <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(a.n / peak) * 100}%`, background: a.worst >= 3 ? "#fb7185" : a.worst === 2 ? "#fbbf24" : "#a78bfa" }} />
                  </span>
                  <SevBadge sev={SEV_NAME[a.worst]} />
                  <span className="tnum w-14 text-right text-[11px] text-muted-foreground">{a.n} alert{a.n === 1 ? "" : "s"}</span>
                </div>
              );
            })}
            {alertLinked === 0 && <p className="px-2 py-6 text-center text-[13px] text-muted-foreground">No drawn account is referenced by an alert — this does not guarantee the activity is legitimate.</p>}
          </div>
        </Card>
      </div>

      {sim && sel && <FraudSim ds={ds} entityId={sel} onClose={() => setSim(false)} />}
    </div>
  );
}

function LegendDot({ color, label, ring }: { color: string; label: string; ring?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={ring ? { background: "transparent", border: `2px solid ${color}` } : { background: color }} />
      {label}
    </span>
  );
}
