import { Card, Empty, PanelTitle, RiskCharacter, ScoreBar, btnPrimary, inputCls, num, riskLevel, shortId } from "@/components/app/Shell";
import { FraudSim } from "@/components/app/FraudSim";
import { getSelected, loadAll } from "@/lib/trace/store";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
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
  const [sim, setSim] = useState<string | null>(null);
  const ds = useMemo(() => { const a = loadAll(); return a.find((d) => d.id === getSelected()) ?? a[0]; }, []);
  // Entities referenced by at least one alert — these can run a fraud simulation.
  const { flagged, worstOf } = useMemo(() => {
    const s = new Set<string>();
    const worst = new Map<string, string>();
    ds?.alerts.forEach((a) => a.entities.forEach((e) => {
      s.add(e);
      if (riskLevel(a.severity) > riskLevel(worst.get(e) ?? "low")) worst.set(e, a.severity);
    }));
    return { flagged: s, worstOf: worst };
  }, [ds]);
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
              {["Entity", "Transfers", "Inbound", "Outbound", "Counterparties", "Intl legs", "Risk"].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-b border-border/40 transition-colors hover:bg-[color:var(--glass-hi)]">
                  <td className="max-w-[220px] truncate px-4 py-2"><Link to={`/entities/${encodeURIComponent(e.id)}`} className="mono text-xs font-semibold text-[color:var(--primary)] hover:underline" title={e.id}>{shortId(e.id)}</Link></td>
                  <td className="tnum px-4 py-2">{num(e.n)}</td>
                  <td className="tnum px-4 py-2">{Math.round(e.inn).toLocaleString("en-IN")}</td>
                  <td className="tnum px-4 py-2">{Math.round(e.out).toLocaleString("en-IN")}</td>
                  <td className="tnum px-4 py-2">{e.peers.size}</td>
                  <td className="tnum px-4 py-2">{e.intl}</td>
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-2">
                      <RiskCharacter severity={worstOf.get(e.id) ?? "low"} size={28} />
                      {flagged.has(e.id) ? (
                        <button onClick={() => setSim(e.id)} className="rounded-full border border-[color:var(--warning)]/40 bg-[color:var(--warning)]/10 px-2.5 py-1 text-[11px] font-semibold text-[color:var(--warning)] transition-all hover:bg-[color:var(--warning)]/20" title="Replay why this entity was flagged">⚑ Simulate</button>
                      ) : (
                        <span className="text-[11px] text-muted-foreground/60">clean</span>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {sim && ds && <FraudSim ds={ds} entityId={sim} onClose={() => setSim(null)} />}
    </div>
  );
}

function Profile({ id }: { id: string }) {
  const ds = loadAll().find((d) => d.id === getSelected()) ?? loadAll()[0];
  const [note, setNote] = useState("");
  const [sim, setSim] = useState(false);
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
  const worstSev = alerts.reduce<string>((w, a) => riskLevel(a.severity) > riskLevel(w) ? a.severity : w, "low");
  const topScore = alerts.reduce((m, a) => Math.max(m, a.score), 0);
  const verdict = riskLevel(worstSev) >= 3 ? "Likely fraudulent" : riskLevel(worstSev) === 2 ? "Suspicious — review" : riskLevel(worstSev) === 1 ? "Worth a look" : "Looks clean";
  const verdictColor = worstSev === "critical" ? "#fb7185" : worstSev === "high" ? "#fbbf24" : worstSev === "medium" ? "#a78bfa" : "#2dd4bf";
  // Top counterparties for the orbit graph: flagged peers first, then by shared transfers.
  const peerCount = new Map<string, number>();
  tx.forEach((t) => {
    const p = t.sender === id ? t.receiver : t.sender;
    peerCount.set(p, (peerCount.get(p) ?? 0) + 1);
  });
  const flaggedPeers = new Set<string>();
  alerts.forEach((a) => a.entities.forEach((en) => { if (en !== id) flaggedPeers.add(en); }));
  const orbitPeers = [...peerCount.entries()]
    .sort((a, b) => (Number(flaggedPeers.has(b[0])) - Number(flaggedPeers.has(a[0]))) || b[1] - a[1])
    .slice(0, 10)
    .map(([pid, n]) => ({ id: pid, n, hot: flaggedPeers.has(pid) }));
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
      {/* at-a-glance verdict */}
      <Card className="edge flex flex-wrap items-center gap-4 px-5 py-4">
        <div className="relative flex h-16 w-16 items-center justify-center">
          <span className="halo-pulse absolute inset-0 rounded-full" style={{ background: `radial-gradient(circle, ${verdictColor}55, transparent 70%)` }} aria-hidden />
          <RiskCharacter severity={worstSev} size={56} className="relative" />
        </div>
        <div className="min-w-0">
          <p className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">verdict at a glance</p>
          <p className="display text-lg font-bold" style={{ color: verdictColor }}>{verdict}</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">{alerts.length ? `${alerts.length} alert${alerts.length === 1 ? "" : "s"} · peak priority ${topScore}/100 · ranks review order, not guilt` : "No detector flagged this account — absence of alerts is not proof of legitimacy."}</p>
        </div>
        {alerts.length > 0 && (
          <button onClick={() => setSim(true)} className={`${btnPrimary} ml-auto`}>
            ⚑ Run fraud simulation
          </button>
        )}
      </Card>
      <div className="grid gap-3 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <p className="mono text-[11px] text-muted-foreground">ENTITY · provenance: imported from “{ds.name}” (inferred links marked as such)</p>
          <h2 className="mono mt-1 text-lg font-bold">{id}</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            {[["Transfers", num(tx.length)], ["Inbound", `${Math.round(inn).toLocaleString("en-IN")}`], ["Outbound", `${Math.round(out).toLocaleString("en-IN")}`], ["Mean transfer", `${Math.round(mean).toLocaleString("en-IN")}`]].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-border bg-[color:var(--glass)] px-3 py-2 backdrop-blur-md"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</p><p className="tnum text-sm font-bold">{v}</p></div>
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
                <Bar dataKey="n" fill="#8B5CF6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <PanelTitle title={`Inbound / outbound history (${tx.length})`} sub="Currencies observed here" />
          <p className="px-4 text-xs text-muted-foreground">{currencies.join(" · ")} · domestic + international legs below</p>
          <div className="mt-2 max-h-64 overflow-y-auto px-4 pb-4">
            {tx.slice(-40).reverse().map((t) => (
              <div key={t.id} className="tnum flex justify-between gap-2 border-b border-border/40 py-1.5 text-xs transition-colors hover:bg-[color:var(--glass-hi)]">
                <span className="mono text-[color:var(--primary)]">{t.id}</span>
                <span className="mono">{t.sender === id ? `→ ${t.receiver}` : `← ${t.sender}`}</span>
                <span className="font-semibold">{t.amount.toLocaleString("en-IN")} {t.currency}</span>
              </div>
            ))}
          </div>
        </Card>
        <div className="space-y-3">
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Counterparty orbit ({peers.size})</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">amber = on implicated transfers · click a node to open it</p>
            <OrbitGraph self={id} peers={orbitPeers} />
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Relevant alerts ({alerts.length})</p>
            {alerts.slice(0, 5).map((a) => (
              <Link key={a.id} to={`/detections/${a.id}`} className="mt-1.5 flex items-center gap-2 rounded-lg border border-border p-2 text-[13px] transition-colors hover:bg-[color:var(--glass-hi)]">
                <RiskCharacter severity={a.severity} size={22} />
                <span className="min-w-0 flex-1 truncate">{a.title}</span>
                <ScoreBar score={a.score} w={36} />
              </Link>
            ))}
            {alerts.length === 0 && <p className="mt-1 text-[13px] text-muted-foreground">No alerts reference this entity.</p>}
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Review notes ({notes.length})</p>
            {notes.map((n, i) => <p key={i} className="mt-1.5 rounded-lg border border-border p-2 text-[13px]">{n.text}{n.actor ? <span className="mono mt-0.5 block text-[11px] text-muted-foreground">{n.actor}</span> : null}</p>)}
            <div className="mt-2 flex gap-1.5">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" className={`${inputCls}`} />
              <button onClick={saveNote} className="rounded-full bg-[color:var(--primary)] px-3 py-1.5 text-[13px] font-semibold text-white transition-all hover:brightness-110">Add</button>
            </div>
            <p className="mono mt-3 text-[10px] text-muted-foreground">attributes: imported (never verified as fact) · links: inferred from transfers</p>
          </Card>
        </div>
      </div>
      {sim && <FraudSim ds={ds} entityId={id} onClose={() => setSim(false)} />}
    </div>
  );
}

/** Interactive moving orbit graph: the entity at the centre, counterparties
 *  drifting in slow elliptical orbit. Flagged peers glow amber, hover lifts a
 *  node, click opens that entity's profile. Positions are computed, never
 *  invented as identities — this is layout only. */
function OrbitGraph({ self, peers }: { self: string; peers: { id: string; n: number; hot: boolean }[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const nav = useNavigate();
  if (!peers.length) return <p className="py-8 text-center text-[13px] text-muted-foreground">No counterparties in this dataset.</p>;
  const CX = 200, CY = 130, RX = 165, RY = 100;
  const maxN = Math.max(...peers.map((p) => p.n), 1);
  return (
    <svg viewBox="0 0 400 260" className="mt-2 w-full" role="img" aria-label="Interactive counterparty orbit graph">
      <defs>
        <radialGradient id="orbCore">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.5" />
        </radialGradient>
      </defs>
      {/* orbit ring */}
      <ellipse cx={CX} cy={CY} rx={RX} ry={RY} fill="none" stroke="var(--border)" strokeDasharray="3 5" strokeWidth="1" />
      {/* links — flagged links amber */}
      {peers.map((p, i) => {
        const ang = (i / peers.length) * Math.PI * 2 - Math.PI / 2;
        const x = CX + Math.cos(ang) * RX, y = CY + Math.sin(ang) * RY;
        const lit = p.hot || hover === p.id;
        return <line key={`l${p.id}`} x1={CX} y1={CY} x2={x} y2={y} stroke={lit ? "#fbbf24" : "var(--border)"} strokeWidth={lit ? 1.6 : 1} strokeOpacity={lit ? 0.9 : 0.5} className="transition-all duration-300" />;
      })}
      {/* centre: the entity */}
      <circle cx={CX} cy={CY} r={26} fill="url(#orbCore)" stroke="#c4b5fd" strokeWidth="1.5" />
      <text x={CX} y={CY + 4} textAnchor="middle" fontSize="11" fontWeight="800" fill="#0b0a1a">SELF</text>
      <text x={CX} y={CY + 44} textAnchor="middle" fontSize="10.5" fontFamily="JetBrains Mono, monospace" fill="var(--foreground)">
        {shortId(self).slice(0, 24)}
      </text>
      {/* peers on the orbit, drifting via CSS-less SMIL-free rotate: each node gets a slow float */}
      {peers.map((p, i) => {
        const ang = (i / peers.length) * Math.PI * 2 - Math.PI / 2;
        const x = CX + Math.cos(ang) * RX, y = CY + Math.sin(ang) * RY;
        const r = 5 + (p.n / maxN) * 6;
        const color = p.hot ? "#fbbf24" : "#8b96b8";
        return (
          <g key={p.id} className="orbit-node cursor-pointer" onClick={() => nav(`/entities/${encodeURIComponent(p.id)}`)}
            onMouseEnter={() => setHover(p.id)} onMouseLeave={() => setHover(null)}
            role="link" tabIndex={0} aria-label={`Open ${p.id}`}
            onKeyDown={(e) => { if (e.key === "Enter") nav(`/entities/${encodeURIComponent(p.id)}`) }}>
            <title>{`${p.id} · ${p.n} shared transfers${p.hot ? " · on implicated transfers" : ""}`}</title>
            <circle cx={x} cy={y} r={r + 5} fill={color} fillOpacity={hover === p.id ? 0.22 : 0.08} className="halo-pulse" style={{ animationDelay: `${i * 0.3}s` }} />
            <circle cx={x} cy={y} r={r} fill={color} fillOpacity="0.25" stroke={color} strokeWidth="1.4" />
            <text x={x} y={y - r - 6} textAnchor="middle" fontSize="9" fontFamily="JetBrains Mono, monospace"
              fill={hover === p.id ? "#c4b5fd" : p.hot ? "#fbbf24" : "var(--muted-foreground)"}>
              {shortId(p.id).slice(0, 12)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
