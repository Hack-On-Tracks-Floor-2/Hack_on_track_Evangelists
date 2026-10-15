import { Card } from "@/components/app/Shell";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Link, useParams } from "react-router";

export default function Cases() {
  const { id } = useParams();
  const cases = useQuery(api.trace.listInvestigations) ?? [];
  const update = useMutation(api.trace.updateInvestigation);
  const create = useMutation(api.trace.saveInvestigation);
  const audit = useQuery(api.trace.auditList) ?? [];
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");

  const cur = id ? cases.find((c) => c._id === id) : null;

  async function mk() {
    if (!title.trim()) return;
    await create({ title: title.trim(), status: "open", priority: "medium", alertIds: [], notes: [] });
    setTitle("");
  }

  if (cur) {
    return (
      <div className="space-y-4">
        <Link to="/investigations" className="text-[13px] text-neutral-500">← All cases</Link>
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">{cur.title}</h2>
            <select value={cur.status} onChange={(e) => update({ id: cur._id, status: e.target.value })} className="ml-auto rounded border border-neutral-200 px-2 py-1 text-xs">
              <option value="open">open</option><option value="reviewing">reviewing</option><option value="escalated">escalated</option><option value="closed">closed</option>
            </select>
          </div>
          <p className="mt-1 text-xs text-neutral-500">Priority {cur.priority} · alerts: {cur.alertIds.join(", ") || "—"} · updated {new Date(cur.updatedAt).toLocaleString()}</p>
          <div className="mt-4 space-y-2">
            {(cur.notes as { at: string; text: string }[]).map((n, i) => (
              <div key={i} className="rounded border border-neutral-200 p-3 text-[13px]"><p>{n.text}</p><p className="mt-1 text-xs text-neutral-400">{n.at}</p></div>
            ))}
            {cur.notes.length === 0 && <p className="text-[13px] text-neutral-400">No notes yet.</p>}
          </div>
          <div className="mt-3 flex gap-2">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add analyst note…" className="flex-1 rounded border border-neutral-200 px-3 py-2 text-[13px]" />
            <button onClick={() => { if (note.trim()) { update({ id: cur._id, note: { at: new Date().toISOString(), text: note.trim() } }); setNote(""); } }} className="rounded-md bg-neutral-900 px-4 py-2 text-[13px] text-white">Add</button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="p-4 lg:col-span-2">
        <div className="flex gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New case title…" className="flex-1 rounded border border-neutral-200 px-3 py-2 text-[13px]" />
          <button onClick={mk} className="rounded-md bg-neutral-900 px-4 py-2 text-[13px] text-white">Create</button>
        </div>
        <div className="mt-3 divide-y divide-neutral-100">
          {cases.map((c) => (
            <Link key={c._id} to={`/investigations/${c._id}`} className="flex items-center gap-3 py-2.5">
              <span className="rounded bg-neutral-100 px-2 py-0.5 text-[11px]">{c.status}</span>
              <span className="flex-1 truncate text-[13px] font-medium">{c.title}</span>
              <span className="text-xs text-neutral-400">{c.alertIds.length} alerts</span>
            </Link>
          ))}
          {cases.length === 0 && <p className="py-8 text-center text-[13px] text-neutral-400">No cases. Escalate an alert or create one manually.</p>}
        </div>
      </Card>
      <Card className="p-4">
        <p className="text-[13px] font-semibold">Audit trail</p>
        <div className="mt-2 max-h-[420px] space-y-2 overflow-auto text-xs">
          {audit.map((a) => <p key={a._id} className="border-b border-neutral-100 pb-1.5"><span className="font-mono text-neutral-400">{new Date(a.createdAt).toLocaleString()}</span><br />{a.action} — {a.target}</p>)}
          {audit.length === 0 && <p className="text-neutral-400">No events yet.</p>}
        </div>
      </Card>
    </div>
  );
}
