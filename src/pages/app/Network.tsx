import { Card } from "@/components/app/Shell";
import { getSelected, loadAll } from "@/lib/trace/store";
import { useMemo, useState } from "react";
import { Link } from "react-router";

// Minimal dependency-free SVG graph: top entities by degree, edges sized by value.
export default function Network() {
  const ds = useMemo(() => { const a = loadAll(); return a.find((d) => d.id === getSelected()) ?? a[0]; }, []);
  const [focus, setFocus] = useState("");
  const [maxN, setMaxN] = useState(24);

  const graph = useMemo(() => {
    if (!ds) return null;
    let txns = ds.txns;
    if (focus) txns = txns.filter((t) => t.sender.includes(focus) || t.receiver.includes(focus) || t.id.includes(focus));
    const deg = new Map<string, number>();
    const edgeAgg = new Map<string, { s: string; r: string; n: number; v: number; ids: string[] }>();
    txns.slice(0, 4000).forEach((t) => {
      deg.set(t.sender, (deg.get(t.sender) ?? 0) + 1);
      deg.set(t.receiver, (deg.get(t.receiver) ?? 0) + 1);
      const k = `${t.sender}→${t.receiver}`;
      const e = edgeAgg.get(k) ?? { s: t.sender, r: t.receiver, n: 0, v: 0, ids: [] };
      e.n++; e.v += t.amount; if (e.ids.length < 6) e.ids.push(t.id);
      edgeAgg.set(k, e);
    });
    const top = [...deg.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxN).map(([id]) => id);
    const idx = new Map(top.map((id, i) => [id, i]));
    const cx = 340, cy = 210, R = 165;
    const pos = top.map((_, i) => ({ x: cx + R * Math.cos((2 * Math.PI * i) / Math.max(1, top.length)), y: cy + R * Math.sin((2 * Math.PI * i) / Math.max(1, top.length)) }));
    const edges = [...edgeAgg.values()].filter((e) => idx.has(e.s) && idx.has(e.r)).sort((a, b) => b.v - a.v).slice(0, 60);
    const maxV = Math.max(1, ...edges.map((e) => e.v));
    return { top, pos, edges, maxV, deg };
  }, [ds, focus, maxN]);

  if (!ds) return <Card className="p-8 text-sm">No dataset. <Link to="/datasets" className="underline">Upload one</Link>.</Card>;
  if (!graph) return null;

  const entityRows = [...graph.deg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Filter account / txn…" className="w-56 rounded border border-neutral-200 px-2.5 py-1.5" />
        <label className="text-neutral-500">Nodes <input type="number" value={maxN} min={8} max={48} onChange={(e) => setMaxN(+e.target.value)} className="w-16 rounded border border-neutral-200 px-1.5 py-1" /></label>
        <span className="text-neutral-500">{graph.top.length} entities · {graph.edges.length} links (bounded for readability; full evidence in tables)</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="p-3 lg:col-span-3">
          <svg viewBox="0 0 680 420" className="h-[420px] w-full">
            {graph.edges.map((e, i) => {
              const a = graph.pos[graph.top.indexOf(e.s)], b = graph.pos[graph.top.indexOf(e.r)];
              return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#171717" strokeOpacity={0.25 + 0.55 * (e.v / graph.maxV)} strokeWidth={1 + 3 * (e.v / graph.maxV)}><title>{e.s} → {e.r}: {e.n} transfers, {e.v.toFixed(0)}. {e.ids.join(", ")}</title></line>;
            })}
            {graph.top.map((id, i) => (
              <g key={id}>
                <circle cx={graph.pos[i].x} cy={graph.pos[i].y} r={10 + Math.min(10, (graph.deg.get(id) ?? 0) / 2)} fill="#fff" stroke="#171717" strokeWidth={1.5}>
                  <title>{id} · degree {graph.deg.get(id)}</title>
                </circle>
                <text x={graph.pos[i].x} y={graph.pos[i].y + 24} textAnchor="middle" fontSize={9} fill="#525252" fontFamily="monospace">{id.slice(0, 12)}</text>
              </g>
            ))}
          </svg>
          <p className="px-2 pb-1 text-xs text-neutral-500">Node size = degree · edge width = aggregate value · hover for transaction IDs. No coordinates are invented — layout is topological.</p>
        </Card>
        <Card className="p-0 lg:col-span-2">
          <p className="px-4 pt-3 text-[13px] font-semibold">Entities by connectivity</p>
          <div className="mt-1 max-h-[430px] overflow-auto">
            {entityRows.map(([id, d]) => {
              const flow = ds.txns.filter((t) => t.sender === id || t.receiver === id);
              const inn = flow.filter((t) => t.receiver === id).reduce((s, t) => s + t.amount, 0);
              const out = flow.filter((t) => t.sender === id).reduce((s, t) => s + t.amount, 0);
              return (
                <div key={id} className="border-b border-neutral-100 px-4 py-2.5">
                  <p className="font-mono text-xs font-medium">{id}</p>
                  <p className="mt-0.5 text-xs tabular-nums text-neutral-500">degree {d} · in {inn.toLocaleString("en-IN", { maximumFractionDigits: 0 })} · out {out.toLocaleString("en-IN", { maximumFractionDigits: 0 })} · {flow.length} transfers</p>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
      <Card className="p-4">
        <p className="text-[13px] font-semibold">Fund-flow legs (top by value)</p>
        <div className="mt-2 overflow-auto">
          <table className="w-full min-w-[640px] text-left text-xs tabular-nums">
            <thead><tr className="border-b border-neutral-200 text-[11px] uppercase tracking-wider text-neutral-400"><th className="py-1.5 pr-3">From</th><th className="py-1.5 pr-3">To</th><th className="py-1.5 pr-3">Transfers</th><th className="py-1.5 pr-3">Aggregate</th><th className="py-1.5">Sample IDs</th></tr></thead>
            <tbody>{graph.edges.slice(0, 20).map((e, i) => (
              <tr key={i} className="border-b border-neutral-100"><td className="py-1.5 pr-3 font-mono">{e.s}</td><td className="py-1.5 pr-3 font-mono">{e.r}</td><td className="py-1.5 pr-3">{e.n}</td><td className="py-1.5 pr-3">{e.v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td><td className="py-1.5 font-mono text-neutral-500">{e.ids.join(", ")}</td></tr>))}</tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
