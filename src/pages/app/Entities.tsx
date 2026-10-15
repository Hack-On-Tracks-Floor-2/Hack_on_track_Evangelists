import { Card, Empty, PanelTitle, inputCls, num, shortId } from "@/components/app/Shell";
import { getSelected, loadAll } from "@/lib/trace/store";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { useReviewStore } from "@/lib/trace/reviews";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function Entities() {
  const { id } = useParams();
  if (id) return <Profile id={decodeURIComponent(id)} />;
  return <List />;
}

function List() {
  const [q, setQ] = useState("");
  const ds = useMemo(() => { const a = loadAll(); return a.find((d) => d.id === getSelected()) ?? a[0]; }, []);
  const rows = useMemo(() => {
    if (!ds) return [];
    const agg = new Map<string, { id: string; n: number; inn: number; out: number; peers: Set<string>; intl: number }>();
    ds.txns.forEach((t) => {
      for (const id of [t.sender, t.receiver]) {
        if (!agg.has(id)) agg.set(id, { id, n: 0, inn: 0, out: 0, peers: new Set(), intl: 0 });
      }
      const s = agg.get(t.sender)!, r = agg.get(t.receiver)!;
      s.n++; s.out += t.amount; s.peers.add(t.receiver);
      r.n++; r.inn += t.amount; r.peers.add(t.sender);
      if (!(t.origin_country === "IN" && t.dest_country === "IN")) { s.intl++; r.intl++; }
    });
    return [...agg.values()].filter((e) => !q || e.id.toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.n - a.n).slice(0, 100);
  }, [ds, q]);
  if (!ds) return <Card><Empty title="No dataset available" body="Upload a transaction CSV or generate a synthetic dataset to begin analysis." /></Card>;
  return (
    <div className="space-y-3">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search entities…" className={`${inputCls} max-w-sm`} aria-label="Search entities" />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <thead><tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
              {["Entity", "Transfers", "Inbound", "Outbound", "Counterparties", "Intl legs"].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-b border-border/50 hover:bg-muted/40">
                  <td className="max-w-[220px] truncate px-4 py-2"><Link to={`/entities/${encodeURIComponent(e.id)}`} className="mono text-xs font-semibold text-[color:var(--primary)] hover:underline" title={e.id}>{shortId(e.id)}</Link></td>
                  <td className="tnum px-4 py-2">{num(e.n)}</td>
                  <td className="tnum px-4 py-2">{Math.round(e.inn).toLocaleString("en-IN")}</td>
                  <td className="tnum px-4 py-2">{Math.round(e.out).toLocaleString("en-IN")}</td>
                  <td className="tnum px-4 py-2">{e.peers.size}</td>
                  <td className="tnum px-4 py-2">{e.intl}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Profile({ id }: { id: string }) {
  const ds = loadAll().find((d) => d.id === getSelected()) ?? loadAll()[0];
  const [note, setNote] = useState("");
  const { user } = useAuth();
  const store = useReviewStore();
  const notes = store.notesOf(`entity:${id}`);
  if (!ds) return <Card><Empty title="No dataset" body="Upload data first." /></Card>;
  const tx = useMemo(() => ds.txns.filter((t) => t.sender === id || t.receiver === id).sort((a, b) => a.epoch - b.epoch), [ds, id]);
  if (!tx.length) return <Card><Empty title="Entity not found" body={`No transfers reference ${id} in the active dataset.`} action={<Link to="/entities" className="text-[13px] text-[color:var(--primary)] hover:underline">Back to entities</Link>} /></Card>;
  const inn = tx.filter((t) => t.receiver === id).reduce((s, t) => s + t.amount, 0);
  const out = tx.filter((t) => t.sender === id).reduce((s, t) => s + t.amount, 0);
  const peers = new Set([...tx.map((t) => t.sender), ...tx.map((t) => t.receiver)]);
  peers.delete(id);
  const vals = tx.map((t) => t.amount);
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  const alerts = ds.alerts.filter((a) => a.entities.includes(id));
  const buckets = new Map<string, number>();
  tx.forEach((t) => { const k = new Date(t.epoch).toISOString().slice(0, 10); buckets.set(k, (buckets.get(k) ?? 0) + 1); });
  const trend = [...buckets.entries()].sort().slice(-20).map(([d, n]) => ({ d: d.slice(5), n }));
  const currencies = [...new Set(tx.map((t) => t.currency))];

  async function saveNote() {
    if (!note.trim()) return;
    await store.addNote(`entity:${id}`, note.trim(), String(user?.email ?? "analyst"));
    setNote("");
  }

  return (
    <div className="space-y-3">
      <Link to="/entities" className="text-[13px] text-muted-foreground hover:text-foreground">← Entities</Link>
      <div className="grid gap-3 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <p className="mono text-[11px] text-muted-foreground">ENTITY · provenance: imported from “{ds.name}” (inferred links marked as such)</p>
          <h2 className="mono mt-1 text-lg font-bold">{id}</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            {[["Transfers", num(tx.length)], ["Inbound", `${Math.round(inn).toLocaleString("en-IN")}`], ["Outbound", `${Math.round(out).toLocaleString("en-IN")}`], ["Mean transfer", `${Math.round(mean).toLocaleString("en-IN")}`]].map(([k, v]) => (
              <div key={k} className="rounded-md border border-border bg-background px-3 py-2"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</p><p className="tnum text-sm font-bold">{v}</p></div>
            ))}
          </div>
          <PanelTitle title="Activity timeline" />
          <div className="h-36 px-2">
            <ResponsiveContainer>
              <BarChart data={trend}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="d" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} width={30} />
                <Tooltip contentStyle={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="n" fill="#5B8CFF" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <PanelTitle title={`Inbound / outbound history (${tx.length})`} sub="Currencies observed here" />
          <p className="px-4 text-xs text-muted-foreground">{currencies.join(" · ")} · domestic + international legs below</p>
          <div className="mt-2 max-h-64 overflow-y-auto px-4 pb-4">
            {tx.slice(-40).reverse().map((t) => (
              <div key={t.id} className="tnum flex justify-between gap-2 border-b border-border/50 py-1.5 text-xs">
                <span className="mono text-[color:var(--primary)]">{t.id}</span>
                <span className="mono">{t.sender === id ? `→ ${t.receiver}` : `← ${t.sender}`}</span>
                <span className="font-semibold">{t.amount.toLocaleString("en-IN")} {t.currency}</span>
              </div>
            ))}
          </div>
        </Card>
        <div className="space-y-3">
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Counterparty network ({peers.size})</p>
            <div className="mt-2 flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
              {[...peers].slice(0, 60).map((p) => <Link key={p} to={`/entities/${encodeURIComponent(p)}`} className="mono rounded border border-border px-1.5 py-0.5 text-[11px] hover:bg-muted">{p}</Link>)}
            </div>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Relevant alerts ({alerts.length})</p>
            {alerts.slice(0, 5).map((a) => <Link key={a.id} to={`/detections/${a.id}`} className="mt-1.5 block rounded border border-border p-2 text-[13px] hover:bg-muted">{a.title}</Link>)}
            {alerts.length === 0 && <p className="mt-1 text-[13px] text-muted-foreground">No alerts reference this entity.</p>}
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Review notes ({notes.length})</p>
            {notes.map((n, i) => <p key={i} className="mt-1.5 rounded border border-border p-2 text-[13px]">{n.text}{n.actor ? <span className="mono mt-0.5 block text-[11px] text-muted-foreground">{n.actor}</span> : null}</p>)}
            <div className="mt-2 flex gap-1.5">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" className={`${inputCls}`} />
              <button onClick={saveNote} className="rounded-md bg-[color:var(--primary)] px-3 py-1.5 text-[13px] font-semibold text-white">Add</button>
            </div>
            <p className="mono mt-3 text-[10px] text-muted-foreground">attributes: imported (never verified as fact) · links: inferred from transfers</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
