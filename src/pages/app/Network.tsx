import { Card, Empty, PanelTitle, btnGhost, btnPrimary } from "@/components/app/Shell";
import { FraudSim } from "@/components/app/FraudSim";
import { download, getSelected, loadAll } from "@/lib/trace/store";
import cytoscape from "cytoscape";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";

export default function Network() {
  const ds = useMemo(() => { const a = loadAll(); return a.find((d) => d.id === getSelected()) ?? a[0]; }, []);
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q);
  const [layoutName, setLayoutName] = useState<"cose" | "concentric" | "circle" | "grid">("cose");
  const [minAmt, setMinAmt] = useState("");
  const [scope, setScope] = useState("");
  const [cur, setCur] = useState("");
  const [maxN, setMaxN] = useState(40);
  const [sel, setSel] = useState<string | null>(null);
  const [sim, setSim] = useState(false);
  const [edge, setEdge] = useState<{ s: string; r: string; ids: string[]; n: number; v: number } | null>(null);
  const [highlight, setHighlight] = useState<"none" | "cycles" | "fan">("none");
  const cyRef = useRef<HTMLDivElement>(null);
  const cy = useRef<cytoscape.Core | null>(null);
  const layoutRef = useRef<cytoscape.Layouts | null>(null);
  // Event handlers are attached once to the persistent instance; they read
  // the latest model through this ref so closures never go stale.
  const modelRef = useRef<{ edges: { s: string; r: string; ids: string[]; n: number; v: number }[] } | null>(null);

  const model = useMemo(() => {
    if (!ds) return null;
    let txns = ds.txns.filter((t) => (!minAmt || t.amount >= Number(minAmt)) && (!cur || t.currency === cur));
    if (scope === "domestic") txns = txns.filter((t) => t.origin_country === "IN" && t.dest_country === "IN");
    if (scope === "international") txns = txns.filter((t) => !(t.origin_country === "IN" && t.dest_country === "IN"));
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
    const agg = new Map<string, { s: string; r: string; n: number; v: number; ids: string[]; ccy: string }>();
    txns.forEach((t) => {
      if (!set.has(t.sender) || !set.has(t.receiver)) return;
      const k = `${t.sender}→${t.receiver}`;
      const e = agg.get(k) ?? { s: t.sender, r: t.receiver, n: 0, v: 0, ids: [], ccy: t.currency };
      e.n++; e.v += t.amount; if (e.ids.length < 8) e.ids.push(t.id);
      agg.set(k, e);
    });
    const ranked = top.map((id) => ({ id, deg: deg.get(id) ?? 0 }));
    const labelSet = new Set(ranked.slice(0, 14).map((n) => n.id));
    return { nodes: ranked.map((n) => ({ ...n, lbl: labelSet.has(n.id) ? n.id : "" })), edges: [...agg.values()].slice(0, 120) };
  }, [ds, dq, minAmt, scope, cur, maxN]);

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

  // One persistent Cytoscape instance for the page lifetime. Destroying and
  // recreating on every model change leaves animated-layout frames in flight
  // that fire after destroy and crash inside cytoscape (null renderer).
  // Instead we swap elements in a batch and stop the previous layout first.
  function stopLayout() {
    try { layoutRef.current?.stop(); } catch { /* already finished */ }
    layoutRef.current = null;
  }
  useEffect(() => () => {
    stopLayout();
    const inst = cy.current;
    cy.current = null;
    if (inst) {
      try { inst.stop(); } catch { /* noop */ }
      try { inst.destroy(); } catch { /* noop */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!cyRef.current || !model) return;
    modelRef.current = model;
    const hot = highlight === "none" ? null : highlight === "cycles" ? cycleNodes : fanNodes;
    const els = [
      ...model.nodes.map((n) => ({ data: { id: n.id, deg: n.deg, lbl: n.lbl } })),
      ...model.edges.map((e, i) => ({ data: { id: `e${i}`, source: e.s, target: e.r, n: e.n, v: Math.round(e.v) } })),
    ];
    if (!cy.current) {
      cy.current = cytoscape({
        container: cyRef.current,
        elements: els,
      style: [
        { selector: "node", style: { "background-color": "#5B8CFF", label: "data(lbl)", color: "#96A5BA", "font-size": 9, "font-family": "JetBrains Mono, monospace", width: "mapData(deg, 1, 20, 14, 40)", height: "mapData(deg, 1, 20, 14, 40)", "border-width": 1.5, "border-color": "#253247" } },
        { selector: "node.highlight", style: { "background-color": "#F4B544", "border-color": "#F4B544", label: "data(id)" } },
        { selector: "node:selected", style: { "background-color": "#26C6B8", "border-color": "#26C6B8", "border-width": 2.5, label: "data(id)" } },
        { selector: ".dim", style: { opacity: 0.12 } },
        { selector: "edge", style: { width: "mapData(n, 1, 10, 1, 5)", "line-color": "#3b4c68", "target-arrow-color": "#3b4c68", "target-arrow-shape": "triangle", "curve-style": "bezier", opacity: 0.8 } },
        { selector: "edge:selected", style: { "line-color": "#26C6B8", "target-arrow-color": "#26C6B8", width: 3 } },
      ],
      layout: { name: "cose", animate: false, randomize: false, nodeRepulsion: 8000, idealEdgeLength: 100, padding: 24 },
      });
      cy.current.on("tap", "node", (e) => { setSel(e.target.id()); setEdge(null); });
      cy.current.on("tap", "edge", (e) => {
        const d = e.target.data();
        const m = modelRef.current?.edges.find((x) => x.s === d.source && x.r === d.target) ?? null;
        setEdge(m ? { s: m.s, r: m.r, ids: m.ids, n: m.n, v: Math.round(m.v) } : null);
      });
      cy.current.on("tap", (e) => { if (e.target === cy.current) { setSel(null); setEdge(null); } });
      cy.current.on("mouseover", "node", (e) => {
        const nb = e.target.closedNeighborhood();
        cy.current?.elements().not(nb).addClass("dim");
      });
      cy.current.on("mouseout", "node", () => cy.current?.elements().removeClass("dim"));
    } else {
      cy.current.batch(() => {
        cy.current?.elements().remove();
        cy.current?.add(els);
      });
    }
    stopLayout();
    layoutRef.current = cy.current.layout({ name: "cose", animate: true, animationDuration: 600, randomize: false, nodeRepulsion: 8000, idealEdgeLength: 100, padding: 24, fit: true });
    layoutRef.current.run();
    if (hot && hot.size) cy.current.nodes().filter((n) => hot.has(n.id())).addClass("highlight");
    return () => { stopLayout(); };
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
  if (!model) return null;
  const selTx = sel ? ds.txns.filter((t) => t.sender === sel || t.receiver === sel) : [];
  const selIn = selTx.filter((t) => t.receiver === sel).reduce((s, t) => s + t.amount, 0);
  const selOut = selTx.filter((t) => t.sender === sel).reduce((s, t) => s + t.amount, 0);
  const selAlerts = ds.alerts.filter((a) => a.entities.includes(sel ?? ""));

  return (
    <div className="grid gap-3 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <div className="flex flex-wrap items-center gap-2 px-4 pt-3.5">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search entity…" className="w-44 rounded-md border border-input bg-background px-2.5 py-1.5 text-[13px] outline-none" aria-label="Search entity" />
          <select value={scope} onChange={(e) => setScope(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1.5 text-xs" aria-label="Scope"><option value="">Domestic + Intl</option><option value="domestic">Domestic</option><option value="international">International</option></select>
          <select value={cur} onChange={(e) => setCur(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1.5 text-xs" aria-label="Currency"><option value="">All currencies</option>{[...new Set(ds.txns.map((t) => t.currency))].map((c) => <option key={c}>{c}</option>)}</select>
          <input value={minAmt} onChange={(e) => setMinAmt(e.target.value)} placeholder="Min amount" inputMode="numeric" className="w-24 rounded-md border border-input bg-background px-2 py-1.5 text-xs" aria-label="Minimum amount" />
          <select value={highlight} onChange={(e) => setHighlight(e.target.value as never)} className="rounded-md border border-input bg-background px-2 py-1.5 text-xs" aria-label="Highlight">
            <option value="none">No highlight</option><option value="cycles">Circular routes</option><option value="fan">Fan-in / fan-out</option>
          </select>
          <div className="flex overflow-hidden rounded-md border border-input text-xs" role="group" aria-label="Graph layout">
            {( (["cose", "concentric", "circle", "grid"]) as unknown as ("cose" | "concentric" | "circle" | "grid")[]).map((l) => (
              <button key={l} onClick={() => setLayoutName(l)} className={`px-2 py-1.5 capitalize ${layoutName === l ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{l}</button>
            ))}
          </div>
          <div className="ml-auto flex gap-1.5">
            <button onClick={() => cy.current?.zoom(cy.current.zoom() * 1.25)} className={btnGhost}>+</button>
            <button onClick={() => cy.current?.zoom(cy.current.zoom() / 1.25)} className={btnGhost}>−</button>
            <button onClick={() => cy.current?.fit()} className={btnGhost}>Reset</button>
            <button onClick={() => download(`${ds.name}-graph.json`, JSON.stringify({ nodes: model.nodes, edges: model.edges }, null, 2), "application/json")} className={btnGhost}>Export</button>
          </div>
        </div>
        <div ref={cyRef} className="m-3 h-[480px] rounded-lg border border-border bg-background" role="application" aria-label="Entity relationship graph" />
        <p className="px-4 pb-3 text-[11px] text-muted-foreground">Pan, scroll-zoom, click nodes and edges. Blue = account/counterparty (neutral — never red by default) · amber = highlighted path · teal = selected. No invented identities, positions, or ownership.</p>
      </Card>
      <Card className="h-fit p-4">
        {sel ? (
          <div>
            <PanelTitle title={sel} sub="Entity context · provenance: imported from your upload" />
            <dl className="mt-3 space-y-2 text-[13px]">
              {[["Transactions", String(selTx.length)], ["Inbound value", selIn.toLocaleString("en-IN", { maximumFractionDigits: 0 })],
                ["Outbound value", selOut.toLocaleString("en-IN", { maximumFractionDigits: 0 })],
                ["Unique counterparties", String(new Set([...selTx.map((t) => t.sender), ...selTx.map((t) => t.receiver)]).size)],
                ["Related alerts", String(selAlerts.length)]].map(([k, x]) => (
                <div key={k} className="flex justify-between border-b border-border/50 pb-1.5"><dt className="text-muted-foreground">{k}</dt><dd className="tnum font-semibold">{x}</dd></div>))}
            </dl>
            {selAlerts.slice(0, 4).map((a) => <Link key={a.id} to={`/detections/${a.id}`} className="mt-1.5 block rounded border border-border p-2 text-[13px] hover:bg-muted">{a.title}</Link>)}
            {selAlerts.length > 0 && (
              <button onClick={() => setSim(true)} className={`${btnPrimary} mt-3 w-full`}>
                ⚑ Run fraud simulation — {selAlerts.length} alert{selAlerts.length === 1 ? "" : "s"}
              </button>
            )}
            <div className="mt-3 flex gap-1.5">
              <button onClick={() => setQ(sel)} className={btnGhost}>Show neighbours</button>
              <Link to={`/entities/${encodeURIComponent(sel)}`} className="rounded-md bg-[color:var(--primary)] px-3 py-1.5 text-[13px] font-semibold text-white">Full profile →</Link>
            </div>
          </div>
        ) : edge ? (
          <div>
            <PanelTitle title={`${edge.s} → ${edge.r}`} sub={`${edge.n} transfers · aggregate ${edge.v.toLocaleString("en-IN")}`} />
            <p className="mono mt-3 text-[11px] leading-5 text-muted-foreground">{edge.ids.join("\n")}</p>
            <Link to="/transactions" className="mt-3 inline-block text-[13px] text-[color:var(--primary)] hover:underline">Inspect in ledger →</Link>
          </div>
        ) : (
          <div>
            <PanelTitle title="Context panel" sub="Select a node for its profile, or an edge for exact transactions" />
            <p className="mt-2 text-[13px] text-muted-foreground">{model.nodes.length} entities · {model.edges.length} links shown (bounded for readability).</p>
          </div>
        )}
      </Card>
      {sim && sel && <FraudSim ds={ds} entityId={sel} onClose={() => setSim(false)} />}
    </div>
  );
}


