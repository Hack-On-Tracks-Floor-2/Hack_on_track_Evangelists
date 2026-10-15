import { Card, Empty, PanelTitle, SevBadge, btnGhost, btnPrimary, emit, shortId } from "@/components/app/Shell";
import { download, getSelected, loadAll, saveAll } from "@/lib/trace/store";
import { toCSV } from "@/lib/trace/csv";
import { runDetection, verifyAlerts, type Alert } from "@/lib/trace/detect";
import { announceAnalysis, readModelMeta } from "@/lib/trace/ml";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { useReviewStore, type Review } from "@/lib/trace/reviews";
import { toast } from "sonner";

export default function Detections() {
  const { id } = useParams();
  if (id) return <Workbench id={id} />;
  return <Explorer />;
}

function Explorer() {
  const [sp] = useSearchParams();
  const [sev, setSev] = useState("");
  const [cat, setCat] = useState("");
  const [scope, setScope] = useState("");
  const [rev, setRev] = useState("");
  const [method, setMethod] = useState("");
  const [hi, setHi] = useState(false);
  const [drawer, setDrawer] = useState<Alert | null>(null);
  const [v, setV] = useState(0);
  const store = useReviewStore();
  const rv = useMemo(() => store.statusMap(), [store, v]);
  const q = (sp.get("q") ?? "").toLowerCase();

  const ds = useMemo(() => { const a = loadAll(); return a.find((d) => d.id === getSelected()) ?? a[0]; }, [v]);
  const all = useMemo(() => loadAll(), [v]);
  const [dsId, setDsId] = useState("");

  const list = useMemo(() => {
    const src = dsId ? all.find((d) => d.id === dsId) : ds;
    if (!src) return [];
    const byId = new Map(src.txns.map((t) => [t.id, t]));
    return src.alerts.filter((a) => {
      if (sev && a.severity !== sev) return false;
      if (cat && a.category !== cat) return false;
      if (method && a.ruleId !== method) return false;
      if (rev && (rv[a.id] ?? "new") !== rev) return false;
      if (hi && !(a.severity === "high" || a.severity === "critical")) return false;
      if (scope === "domestic" || scope === "international") {
        const legs = a.txnIds.map((t) => byId.get(t)).filter((t) => t !== undefined);
        const dom = legs.some((t) => t.origin_country === "IN" && t.dest_country === "IN");
        const intl = legs.some((t) => !(t.origin_country === "IN" && t.dest_country === "IN"));
        if (scope === "domestic" && !dom) return false;
        if (scope === "international" && !intl) return false;
      }
      if (q && !(a.title + a.id + a.txnIds.join(" ") + a.entities.join(" ")).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [ds, all, dsId, sev, cat, method, rev, hi, scope, q, rv]);

  if (!ds) return <Card><Empty title="No dataset available" body="Upload a transaction CSV or generate a synthetic dataset to begin analysis." /></Card>;

  const shown = dsId ? all.find((d) => d.id === dsId) ?? ds : ds;
  const count = (f: (a: Alert) => boolean) => shown.alerts.filter(f).length;
  const isHi = (a: Alert) => a.severity === "high" || a.severity === "critical";
  const statDefs: { k: string; n: number; active: boolean; onClick: () => void }[] = [
    { k: "Total Alerts", n: shown.alerts.length, active: !rev && !sev && !hi, onClick: () => { setRev(""); setSev(""); setHi(false); } },
    { k: "High-Priority", n: count(isHi), active: hi, onClick: () => setHi(!hi) },
    { k: "New", n: count((a) => (rv[a.id] ?? "new") === "new"), active: rev === "new", onClick: () => setRev(rev === "new" ? "" : "new") },
    { k: "Under Review", n: count((a) => (rv[a.id] ?? "new") === "reviewing"), active: rev === "reviewing", onClick: () => setRev(rev === "reviewing" ? "" : "reviewing") },
    { k: "Dismissed / Escalated", n: count((a) => ["false-positive", "escalated", "reviewed"].includes(rv[a.id] ?? "")), active: ["false-positive", "escalated", "reviewed"].includes(rev), onClick: () => setRev(rev ? "" : "reviewed") },
  ];

  function rerun() {
    const allx = loadAll();
    const d = allx.find((x) => x.id === ds.id)!;
    d.alerts = announceAnalysis("monitoring job — " + d.name, runDetection(d.txns, d.rules));
    saveAll(allx); emit(); setV((x) => x + 1);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {statDefs.map((s) => (
          <button key={s.k} onClick={s.onClick} aria-pressed={s.active} title={s.active ? "Click to clear this filter" : `Filter by ${s.k}`} className={`rounded-lg border bg-card px-4 py-2.5 text-left transition ${s.active ? "border-[color:var(--primary)] ring-1 ring-[color:var(--primary)]" : "border-border hover:border-muted-foreground/50"}`}>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{s.k}</p>
            <p className="tnum text-lg font-bold">{s.n.toLocaleString("en-IN")}</p>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 text-[13px]">
        <select value={sev} onChange={(e) => setSev(e.target.value)} className="rounded-md border border-input bg-card px-2 py-1.5 text-xs" aria-label="Priority"><option value="">All priorities</option><option value="critical">critical</option><option value="high">high</option><option value="medium">medium</option><option value="low">low</option></select>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded-md border border-input bg-card px-2 py-1.5 text-xs" aria-label="Category"><option value="">All categories</option>{[...new Set(shown.alerts.map((a) => a.category))].map((c) => <option key={c}>{c}</option>)}</select>
        <select value={scope} onChange={(e) => setScope(e.target.value)} className="rounded-md border border-input bg-card px-2 py-1.5 text-xs" aria-label="Scope"><option value="">Domestic + Intl</option><option value="domestic">Domestic</option><option value="international">International</option></select>
        <select value={dsId} onChange={(e) => setDsId(e.target.value)} className="rounded-md border border-input bg-card px-2 py-1.5 text-xs" aria-label="Dataset"><option value="">Active dataset</option>{all.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <select value={rev} onChange={(e) => setRev(e.target.value)} className="rounded-md border border-input bg-card px-2 py-1.5 text-xs" aria-label="Review status"><option value="">Any status</option><option value="new">new</option><option value="reviewing">reviewing</option><option value="reviewed">reviewed</option><option value="false-positive">false positive</option><option value="escalated">escalated</option></select>
        <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded-md border border-input bg-card px-2 py-1.5 text-xs" aria-label="Method"><option value="">All methods</option>{[...new Set(shown.alerts.map((a) => a.ruleId))].map((c) => <option key={c}>{c}</option>)}</select>
        <span className="self-center text-xs text-muted-foreground">{list.length} of {shown.alerts.length}</span>
        <button onClick={rerun} className="ml-auto rounded-md bg-[color:var(--primary)] px-3 py-1.5 text-xs font-semibold text-white">Run monitoring job</button>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-[13px]">
            <thead><tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
              {["Alert ID", "Pattern", "Priority", "Dataset", "Txns", "Entities", "Score", "Status"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {list.slice(0, 100).map((a) => (
                <tr key={a.id} className="cursor-pointer border-b border-border/50 hover:bg-muted/40" onClick={() => setDrawer(a)}>
                  <td className="mono px-3 py-2 text-xs text-[color:var(--primary)]">{a.id.slice(0, 18)}…</td>
                  <td className="max-w-[280px] truncate px-3 py-2">{a.title}</td>
                  <td className="px-3 py-2">
                    <SevBadge sev={a.severity} />
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{shown.name}</td>
                  <td className="tnum px-3 py-2">{a.txnIds.length}</td>
                  <td className="mono max-w-[180px] truncate px-3 py-2 text-xs text-muted-foreground" title={a.entities.slice(0, 2).join(", ")}>{a.entities.slice(0, 2).map(shortId).join(", ")}</td>
                  <td className="tnum px-3 py-2 font-semibold" title="Risk-priority score, not a probability">{a.score}</td>
                  <td className="px-3 py-2 text-xs capitalize text-muted-foreground">{(rv[a.id] ?? "new").replace("-", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">No alerts were generated for this analysis run. This does not guarantee that all activity is legitimate.</p>}
        </div>
      </Card>
      {drawer && <Drawer a={drawer} dsName={shown.name} onClose={() => { setDrawer(null); setV((x) => x + 1); }} />}
    </div>
  );
}

function Drawer({ a, dsName, onClose }: { a: Alert; dsName: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <aside className="thin-scroll relative h-full w-full max-w-md overflow-y-auto border-l border-border bg-[color:var(--elevated)] p-5">
        <div className="flex items-center gap-2">
          <SevBadge sev={a.severity} />
          <span className="text-xs text-muted-foreground">{a.category} · priority {a.score}/100 — a risk-priority score, not a probability</span>
        </div>
        <h3 className="mt-2 text-[15px] font-bold leading-6">{a.title}</h3>
        <p className="mt-2 text-[13px] leading-6 text-muted-foreground">{a.explanation}</p>
        <div className="mt-3 space-y-1.5 text-[13px]">
          {a.evidence.slice(0, 5).map((e, i) => (
            <div key={i} className="flex justify-between gap-3 border-b border-border/50 pb-1.5"><span className="text-muted-foreground">{e.label}</span><span className="mono text-right text-xs">{e.value}</span></div>
          ))}
        </div>
        <p className="mono mt-3 text-[11px] text-muted-foreground">{a.txnIds.length} transactions · {dsName}</p>
        <div className="mt-4 flex gap-2">
          <Link to={`/detections/${a.id}`} className={btnPrimary}>Open full workbench</Link>
          <button onClick={onClose} className={btnGhost}>Close</button>
        </div>
      </aside>
    </div>
  );
}

function VerifyPanel({ a }: { a: Alert }) {
  const v = verifyAlerts([a], readModelMeta())[0];
  return (
    <div className="mx-4 mb-4 rounded-lg border border-border p-3 text-[13px]">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Machine confirmation — {v.confirmedByModel ? "scored by model" : "not confirmed by model"}</p>
      <ul className="mt-2 space-y-1">
        {v.checks.map((c, i) => (
          <li key={i} className="flex gap-2">
            <span className={c.passed ? "font-bold text-[color:var(--success)]" : "text-muted-foreground"}>{c.passed ? "✓" : "○"}</span>
            <span className={c.passed ? "" : "text-muted-foreground"}>{c.label}</span>
          </li>
        ))}
      </ul>
      {v.rulesOnly && <p className="mt-2 text-xs text-muted-foreground">Rules-only signal: a deterministic pattern match, never presented as a model verdict.</p>}
    </div>
  );
}

function Workbench({ id }: { id: string }) {
  const saveCase = useMutation(api.trace.saveInvestigation);
  const [v, setV] = useState(0);
  const [note, setNote] = useState("");
  const { user } = useAuth();
  const store = useReviewStore();
  const actor = String(user?.email ?? "analyst");
  const [busy, setBusy] = useState(false);
  const found = useMemo(() => {
    for (const d of loadAll()) {
      const a = d.alerts.find((x) => x.id === id);
      if (a) return { a, d };
    }
    return null;
  }, [id, v]);
  void v;
  if (!found) return <Card><Empty title="Alert not found" body="It may belong to a deleted dataset." action={<Link to="/detections" className={btnGhost}>Back to explorer</Link>} /></Card>;
  const { a, d } = found;
  const rv = store.statusOf(id);
  const ns = store.notesOf(id);
  const txns = a.txnIds.map((t) => d.txns.find((x) => x.id === t)).filter(Boolean);

  async function act(kind: Review) {
    if (busy) return;
    setBusy(true);
    setV((x) => x + 1);
    const ok = await store.setStatus(id, kind, actor);
    if (kind === "escalated") {
      try {
        await Promise.race([
          saveCase({ title: `Case — ${a.title}`, status: "open", priority: a.severity, datasetId: d.id, alertIds: [id], notes: [] }),
          new Promise((_, rej) => setTimeout(() => rej(new Error("case-timeout")), 12000)),
        ]);
        toast.success("Case created", { description: "Linked evidence is waiting in Investigation Cases." });
      } catch {
        toast.error("Case creation failed", { description: "Status was still recorded. Retry the escalation from this workbench." });
      }
    }
    setBusy(false);
    setV((x) => x + 1);
    if (ok) toast.success(`Marked as ${kind.replace("-", " ")} — synced across reviewers`);
    else toast.warning("Saved on this device", { description: "Backend unreachable — it will sync when the connection returns." });
  }
  async function addNote() {
    if (!note.trim() || busy) return;
    const text = note.trim();
    setBusy(true);
    setNote(""); setV((x) => x + 1);
    const ok = await store.addNote(id, text, actor);
    setBusy(false);
    setV((x) => x + 1);
    if (ok) toast.success("Note shared with all reviewers");
    else toast.warning("Note saved on this device", { description: "Backend unreachable — it will sync when the connection returns." });
  }

  return (
    <div className="space-y-3">
      <Link to="/detections" className="text-[13px] text-muted-foreground hover:text-foreground">← Alert explorer</Link>
      <div className="grid gap-3 xl:grid-cols-3">
        {/* evidence column */}
        <div className="space-y-3 xl:col-span-2">
          <Card className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <SevBadge sev={a.severity} />
              <span className="text-xs text-muted-foreground">{a.category} · rule {a.ruleId} v1 · priority {a.score}/100 (risk-priority, not probability)</span>
            </div>
            <h2 className="mt-2 text-lg font-bold tracking-tight">{a.title}</h2>
            <PanelTitle title="Detection explanation" />
            <p className="px-4 text-[13px] leading-6 text-muted-foreground">{a.explanation}</p>
            <PanelTitle title="Transaction timeline" sub={`${txns.length} supporting transfers`} />
            <div className="space-y-1 px-4 pb-1">
              {txns.map((t) => (
                <div key={t!.id} className="tnum flex flex-wrap justify-between gap-2 border-b border-border/50 pb-1 text-xs">
                  <span className="mono text-[color:var(--primary)]">{t!.id}</span>
                  <span className="mono">{t!.sender} → {t!.receiver}</span>
                  <span className="font-semibold">{t!.amount.toLocaleString("en-IN")} {t!.currency}</span>
                  <span className="text-muted-foreground">{t!.timestamp.slice(0, 16).replace("T", " ")}</span>
                </div>
              ))}
            </div>
            <PanelTitle title="Supporting transactions" />
            <div className="overflow-x-auto px-4 pb-4">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead><tr className="text-muted-foreground">{["ID", "Sender", "Receiver", "Amount", "Channel", "Route"].map((h) => <th key={h} className="py-1 pr-3 font-medium">{h}</th>)}</tr></thead>
                <tbody>{txns.map((t) => (
                  <tr key={t!.id} className="border-t border-border/50"><td className="mono py-1 pr-3 text-[color:var(--primary)]">{t!.id}</td><td className="mono py-1 pr-3">{t!.sender}</td><td className="mono py-1 pr-3">{t!.receiver}</td><td className="tnum py-1 pr-3">{t!.amount.toLocaleString("en-IN")} {t!.currency}</td><td className="py-1 pr-3">{t!.channel}</td><td className="py-1 pr-3">{t!.origin_country}→{t!.dest_country}</td></tr>
                ))}</tbody>
              </table>
            </div>
            <VerifyPanel a={a} />
            <div className="grid gap-3 px-4 pb-4 md:grid-cols-3">
              <div className="rounded-lg border border-border p-3 text-[13px]"><p className="font-semibold">Plausible legitimate explanation</p><p className="mt-1 text-muted-foreground">{a.legitimate}</p></div>
              <div className="rounded-lg border border-border p-3 text-[13px]"><p className="font-semibold">Next checks</p><ul className="mt-1 list-disc pl-4 text-muted-foreground">{a.checks.map((c, i) => <li key={i}>{c}</li>)}</ul></div>
              <div className="rounded-lg border border-[color:var(--warning)]/35 bg-[color:var(--warning)]/8 p-3 text-[13px]"><p className="font-semibold">Missing context</p><p className="mt-1">{a.limitations}</p></div>
            </div>
          </Card>
        </div>
        {/* context column */}
        <div className="space-y-3">
          <Card className="p-4 text-[13px]">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Review status: {rv.replace("-", " ")}</p>
            <dl className="mt-3 space-y-2">
              {[["Dataset", d.name], ["Dataset added", new Date(d.createdAt).toLocaleDateString()], ["Rule version", `${a.ruleId} v1`], ["Entities", String(a.entities.length)], ["Transactions", String(a.txnIds.length)]].map(([k, x]) => (
                <div key={k} className="flex justify-between gap-2 border-b border-border/50 pb-1.5"><dt className="text-muted-foreground">{k}</dt><dd className="truncate font-medium">{x}</dd></div>
              ))}
            </dl>
            {!store.shared && <p className="mt-2 text-xs text-[color:var(--warning)]">Backend unreachable — changes stay on this device until sync.</p>}
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              <button onClick={() => act("reviewed")} disabled={busy} className={`${btnGhost} disabled:opacity-50`}>{busy ? "Saving…" : "Mark Reviewed"}</button>
              <button onClick={() => act("escalated")} disabled={busy} className={`${btnPrimary} disabled:opacity-50`}>{busy ? "Saving…" : "Escalate"}</button>
              <button onClick={() => act("false-positive")} disabled={busy} className={`${btnGhost} disabled:opacity-50`}>Dismiss as False Positive</button>
              <button onClick={() => act("reviewing")} disabled={busy} className={`${btnGhost} disabled:opacity-50`}>Keep Reviewing</button>
            </div>
            <div className="mt-2 flex gap-1.5">
              <button onClick={() => download(`${a.id}-evidence.csv`, toCSV(txns.map((t) => ({ id: t!.id, sender: t!.sender, receiver: t!.receiver, amount: t!.amount, currency: t!.currency, ts: t!.timestamp }))))} className={btnGhost}>Export Case</button>
              <Link to="/audit" className={btnGhost}>View Audit Trail</Link>
            </div>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reviewer notes ({ns.length})</p>
            <div className="mt-2 space-y-2">
              {ns.map((n, i) => <div key={i} className="rounded border border-border p-2.5 text-[13px]"><p>{n.text}</p><p className="mono mt-1 text-[11px] text-muted-foreground">{n.actor ? `${n.actor} · ` : ""}{new Date(n.at).toLocaleString()}</p></div>)}
              {ns.length === 0 && <p className="text-[13px] text-muted-foreground">No notes yet.</p>}
            </div>
            <div className="mt-2 flex gap-1.5">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" className="flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-[13px] outline-none" />
              <button onClick={addNote} disabled={busy} className={`${btnPrimary} disabled:opacity-50`}>Add</button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
