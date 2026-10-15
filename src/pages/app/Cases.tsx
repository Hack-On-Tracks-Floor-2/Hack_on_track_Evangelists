import { Card, Empty, PanelTitle, btnGhost, btnPrimary, inputCls } from "@/components/app/Shell";
import { api } from "@/convex/_generated/api";
import { getSelected, loadAll } from "@/lib/trace/store";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router";

export default function Cases() {
  const { id } = useParams();
  const loc = useLocation();
  const isAudit = loc.pathname === "/audit";
  if (id) return <Workbench id={id} />;
  if (isAudit) return <Audit />;
  return <CaseList />;
}

function CaseList() {
  const cases = useQuery(api.trace.listInvestigations) ?? [];
  const create = useMutation(api.trace.saveInvestigation);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const rows = cases.filter((c) =>
    (!status || c.status === status) &&
    (!q || c.title.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="grid gap-3 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <PanelTitle title={`Investigation cases (${rows.length})`} sub="Filter by status or title" right={
          <div className="flex gap-1.5">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" className="w-36 rounded-md border border-input bg-background px-2 py-1 text-xs outline-none" aria-label="Filter cases" />
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1 text-xs" aria-label="Status">
              <option value="">All statuses</option><option value="open">open</option><option value="reviewing">reviewing</option><option value="escalated">escalated</option><option value="closed">closed</option>
            </select>
          </div>
        } />
        <div className="mt-1 flex gap-2 px-4">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New case title…" className={`${inputCls} flex-1`} aria-label="New case title" />
          <button onClick={async () => { if (title.trim()) { await create({ title: title.trim(), status: "open", priority: "medium", alertIds: [], notes: [] }); setTitle(""); } }} className={btnPrimary}>Create</button>
        </div>
        <div className="mt-2 divide-y divide-border/50">
          {rows.map((c) => (
            <Link key={c._id} to={`/investigations/${c._id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40">
              <span className="rounded border border-border bg-muted px-2 py-0.5 text-[11px]">{c.status}</span>
              <span className="flex-1 truncate text-[13px] font-medium">{c.title}</span>
              <span className="tnum text-xs text-muted-foreground">{c.alertIds.length} alerts · updated {new Date(c.updatedAt).toLocaleDateString()}</span>
            </Link>
          ))}
          {rows.length === 0 && ((q || status) ? <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">No cases match these filters.</p> : <FirstCase />)}
        </div>
      </Card>
      <Card className="h-fit p-4">
        <PanelTitle title="How cases work" />
        <ul className="mt-2 list-disc space-y-1 pl-4 text-[13px] text-muted-foreground">
          <li>Escalate any alert to open a case with its evidence linked.</li>
          <li>Status changes and notes persist in the backend.</li>
          <li>Every action lands in the audit trail.</li>
        </ul>
        <Link to="/audit" className="mt-3 inline-block text-[13px] text-[color:var(--primary)] hover:underline">Open audit trail →</Link>
      </Card>
    </div>
  );
}

function FirstCase() {
  const create = useMutation(api.trace.saveInvestigation);
  const [done, setDone] = useState(false);
  const top = useMemo(() => {
    const a = loadAll();
    const ds = a.find((d) => d.id === getSelected()) ?? a[0];
    if (!ds) return null;
    const hi = ds.alerts.filter((x) => x.severity === "high" || x.severity === "critical");
    return { ds, alert: hi[0] ?? ds.alerts[0] ?? null };
  }, []);
  const al = top?.alert ?? null;
  if (done) return null;
  return (
    <div className="px-4 py-8 text-center">
      <p className="text-[13px] font-semibold">No cases yet — start from a live example</p>
      {al && top ? (
        <>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-muted-foreground">Top review signal in “{top.ds.name}”: <span className="font-medium text-foreground">{al.title}</span> ({al.severity}, {al.txnIds.length} transfers)</p>
          <button onClick={async () => { if (!al || !top) return; await create({ title: `Case — ${al.title}`, status: "open", priority: al.severity, datasetId: top.ds.id, alertIds: [al.id], notes: [] }); setDone(true); }} className={`${btnPrimary} mt-3`}>Escalate &amp; create case</button>
        </>
      ) : (
        <p className="mx-auto mt-1 max-w-md text-[13px] text-muted-foreground">Upload or generate a dataset first — alerts you escalate become cases here.</p>
      )}
    </div>
  );
}

function Workbench({ id }: { id: string }) {
  const cases = useQuery(api.trace.listInvestigations) ?? [];
  const update = useMutation(api.trace.updateInvestigation);
  const [note, setNote] = useState("");
  const cur = cases.find((c) => c._id === id);
  if (!cur) return <Card><Empty title="Case not found" body="It may have been removed." action={<Link to="/investigations" className={btnGhost}>Back to cases</Link>} /></Card>;
  return (
    <div className="space-y-3">
      <Link to="/investigations" className="text-[13px] text-muted-foreground hover:text-foreground">← All cases</Link>
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-bold">{cur.title}</h2>
          <select value={cur.status} onChange={(e) => update({ id: cur._id, status: e.target.value })} className="ml-auto rounded-md border border-input bg-background px-2 py-1 text-xs" aria-label="Case status">
            <option value="open">open</option><option value="reviewing">reviewing</option><option value="escalated">escalated</option><option value="closed">closed</option>
          </select>
        </div>
        <p className="tnum mt-1 text-xs text-muted-foreground">Priority {cur.priority} · alerts: {cur.alertIds.join(", ") || "—"} · dataset {cur.datasetId ?? "—"}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {cur.alertIds.map((a) => <Link key={a} to={`/detections/${a}`} className="mono rounded border border-border px-2 py-1 text-[11px] text-[color:var(--primary)] hover:bg-muted">{a}</Link>)}
        </div>
        <div className="mt-4 space-y-2">
          {(cur.notes as { at: string; text: string }[]).map((n, i) => (
            <div key={i} className="rounded-md border border-border p-3 text-[13px]"><p>{n.text}</p><p className="mono mt-1 text-[11px] text-muted-foreground">{new Date(n.at).toLocaleString()}</p></div>
          ))}
          {cur.notes.length === 0 && <p className="text-[13px] text-muted-foreground">No analyst notes yet.</p>}
        </div>
        <div className="mt-3 flex gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add analyst note…" className={`${inputCls} flex-1`} aria-label="Add note" />
          <button onClick={() => { if (note.trim()) { update({ id: cur._id, note: { at: new Date().toISOString(), text: note.trim() } }); setNote(""); } }} className={btnPrimary}>Add</button>
        </div>
      </Card>
    </div>
  );
}

function Audit() {
  const audit = useQuery(api.trace.auditList) ?? [];
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const rows = audit.filter((a) =>
    (!actor || a.actor.toLowerCase().includes(actor.toLowerCase())) &&
    (!action || a.action.includes(action)));
  const cur = open ? audit.find((a) => a._id === open) : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="Filter actor…" className="w-44 rounded-md border border-input bg-card px-2.5 py-1.5 text-[13px] outline-none" aria-label="Filter actor" />
        <select value={action} onChange={(e) => setAction(e.target.value)} className="rounded-md border border-input bg-card px-2 py-1.5 text-xs" aria-label="Filter action">
          <option value="">All actions</option>{[...new Set(audit.map((a) => a.action))].map((x) => <option key={x}>{x}</option>)}
        </select>
        <span className="self-center text-xs text-muted-foreground">Authorised reviewers only · {rows.length} events</span>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-[13px]">
            <thead><tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
              {["Timestamp", "Actor", "Action", "Record", "Outcome"].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a._id} className="cursor-pointer border-b border-border/50 hover:bg-muted/40" onClick={() => setOpen(a._id)}>
                  <td className="tnum whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-2">{a.actor}</td>
                  <td className="mono px-4 py-2 text-xs">{a.action}</td>
                  <td className="max-w-[280px] truncate px-4 py-2 text-muted-foreground">{a.target ?? "—"}</td>
                  <td className="px-4 py-2 text-xs text-[color:var(--success)]">recorded</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (audit.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-[13px] font-semibold">No audit events yet</p>
              <p className="mx-auto mt-1 max-w-lg text-[13px] text-muted-foreground">Example of what lands here: <span className="mono text-xs">analyst · case.escalated · ALT-… · recorded · just now</span>. Escalate an alert, add a note, or change a case status to write the first event.</p>
            </div>
          ) : <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">No audit events match these filters.</p>)}
        </div>
      </Card>
      {cur && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(null)} />
          <aside className="relative h-full w-full max-w-sm border-l border-border bg-[color:var(--elevated)] p-5">
            <h3 className="text-[15px] font-bold">Event detail</h3>
            <dl className="mt-3 space-y-2 text-[13px]">
              {[["Timestamp", new Date(cur.createdAt).toLocaleString()], ["Actor", cur.actor], ["Action", cur.action], ["Record", cur.target ?? "—"], ["Detail", cur.detail ?? "—"], ["Outcome", "recorded"]].map(([k, x]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-border/50 pb-1.5"><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium">{x}</dd></div>
              ))}
            </dl>
            <button onClick={() => setOpen(null)} className={`${btnGhost} mt-4 w-full`}>Close</button>
          </aside>
        </div>
      )}
    </div>
  );
}
