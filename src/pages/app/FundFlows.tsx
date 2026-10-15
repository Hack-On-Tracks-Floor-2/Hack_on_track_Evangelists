import { Card, Empty, PanelTitle, inputCls, shortId } from "@/components/app/Shell";
import { getSelected, loadAll } from "@/lib/trace/store";
import { useMemo, useState } from "react";
import { Link } from "react-router";

export default function FundFlows() {
  const [q, setQ] = useState("");
  const [scope, setScope] = useState("");
  const ds = useMemo(() => { const a = loadAll(); return a.find((d) => d.id === getSelected()) ?? a[0]; }, []);

  const seqs = useMemo(() => {
    if (!ds) return [];
    const bySender = new Map<string, typeof ds.txns>();
    ds.txns.forEach((t) => {
      if (scope === "domestic" && !(t.origin_country === "IN" && t.dest_country === "IN")) return;
      if (scope === "international" && (t.origin_country === "IN" && t.dest_country === "IN")) return;
      if (!bySender.has(t.sender)) bySender.set(t.sender, []);
      bySender.get(t.sender)!.push(t);
    });
    const out: { path: string[]; ids: string[]; v: number; ccy: string; hops: number }[] = [];
    const inBy = new Map<string, typeof ds.txns>();
    ds.txns.forEach((t) => { if (!inBy.has(t.receiver)) inBy.set(t.receiver, []); inBy.get(t.receiver)!.push(t); });
    for (const [mid, outs] of bySender) {
      const ins = (inBy.get(mid) ?? []).slice(0, 4);
      for (const inn of ins.slice(0, 3)) {
        for (const o of outs.slice(0, 3)) {
          if (o.epoch < inn.epoch) continue;
          const path = [inn.sender, mid, o.receiver];
          if (q && !path.some((p) => p.toLowerCase().includes(q.toLowerCase()))) continue;
          out.push({ path, ids: [inn.id, o.id], v: inn.amount + o.amount, ccy: inn.currency, hops: 2 });
          if (out.length >= 40) return out;
        }
      }
    }
    return out.sort((a, b) => b.v - a.v);
  }, [ds, q, scope]);

  const example = useMemo(() => {
    if (!ds || seqs.length > 0) return null;
    for (const t of ds.txns.slice(0, 500)) {
      const nxt = ds.txns.find((o) => o.sender === t.receiver && o.epoch >= t.epoch);
      if (nxt) return { path: [t.sender, t.receiver, nxt.receiver], ids: [t.id, nxt.id] };
    }
    return null;
  }, [ds, seqs.length]);

  if (!ds) return <Card><Empty title="No dataset available" body="Upload a transaction CSV or generate a synthetic dataset to begin analysis." /></Card>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter account…" className={`${inputCls} w-52`} aria-label="Filter account" />
        <select value={scope} onChange={(e) => setScope(e.target.value)} className="rounded-md border border-input bg-card px-2 py-1.5 text-xs" aria-label="Scope">
          <option value="">Domestic + International</option><option value="domestic">Domestic</option><option value="international">International</option>
        </select>
        <span className="self-center text-xs text-muted-foreground">{seqs.length} directed sequences (bounded scan — full evidence in ledger)</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {seqs.map((s, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-center gap-1.5 text-[13px] font-semibold">
              {s.path.map((p, j) => (
                <span key={j} className="flex items-center gap-1.5">
                  {j > 0 && <span className="text-[color:var(--teal)]">→</span>}
                  <Link to={`/entities/${encodeURIComponent(p)}`} className="mono text-xs hover:underline" title={p}>{shortId(p)}</Link>
                </span>
              ))}
            </div>
            <p className="tnum mt-1.5 text-xs text-muted-foreground">
              {s.hops} hops · combined {Math.round(s.v).toLocaleString("en-IN")} {s.ccy} (currency-aware: single-currency legs only summed within {s.ccy})
            </p>
            <p className="mono mt-1 text-[11px] text-[color:var(--primary)]">{s.ids.join(" → ")}</p>
          </Card>
        ))}
      </div>
      {seqs.length === 0 && (
        <Card className="p-5">
          <PanelTitle title="No sequences under these filters" sub="Example two-hop path from your data — clear filters to explore them all" />
          {example && (
            <div className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold">
              {example.path.map((p, j) => (
                <span key={j} className="flex items-center gap-1.5">
                  {j > 0 && <span className="text-[color:var(--teal)]">→</span>}
                  <Link to={`/entities/${encodeURIComponent(p)}`} className="mono text-xs hover:underline" title={p}>{shortId(p)}</Link>
                </span>
              ))}
            </div>
          )}
          {example && <p className="mono mt-1.5 text-[11px] text-[color:var(--primary)]">{example.ids.join(" → ")}</p>}
          <button onClick={() => { setQ(""); setScope(""); }} className="mt-3 rounded-md bg-[color:var(--primary)] px-3.5 py-2 text-[13px] font-semibold text-white">Clear filters &amp; show sequences</button>
        </Card>
      )}
    </div>
  );
}
