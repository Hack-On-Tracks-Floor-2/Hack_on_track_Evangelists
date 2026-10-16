import { Card, Empty, PanelTitle, RiskCharacter, ScoreBar, SevBadge, btnGhost, btnPrimary, inputCls, num } from "@/components/app/Shell";
import { api } from "@/convex/_generated/api";
import { getSelected, loadAll } from "@/lib/trace/store";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { ChevronRight, Plus, Search, ShieldAlert, StickyNote, X } from "lucide-react";

const STATUS_STYLES: Record<string, { dot: string; chip: string }> = {
  open: { dot: "#a78bfa", chip: "border-[#a78bfa]/40 bg-[#a78bfa]/10 text-[#c4b5fd]" },
  reviewing: { dot: "#fbbf24", chip: "border-[#fbbf24]/40 bg-[#fbbf24]/10 text-[#fbbf24]" },
  escalated: { dot: "#fb7185", chip: "border-[#fb7185]/40 bg-[#fb7185]/10 text-[#fb7185]" },
  closed: { dot: "#2dd4bf", chip: "border-[#2dd4bf]/40 bg-[#2dd4bf]/10 text-[#2dd4bf]" },
};
const STATUSES = ["open", "reviewing", "escalated", "closed"] as const;
const PRIORITIES = ["low", "medium", "high", "critical"] as const;

/** Compact relative time: "just now", "6m ago", "3h ago", "5d ago", else date. */
function rel(ts: number) {
  const s = Math.max(0, Date.now() - ts) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ts).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

/** Action family → colour: cases violet, notes teal, data amber, rest neutral. */
function actionColor(action: string) {
  if (action.startsWith("case")) return "#a78bfa";
  if (action.startsWith("note") || action.includes("comment")) return "#2dd4bf";
  if (action.startsWith("dataset") || action.includes("data")) return "#fbbf24";
  return "#8b96b8";
}

export default function Cases() {
  const { id } = useParams();
  const loc = useLocation();
  const isAudit = loc.pathname === "/audit";
  if (id) return <Workbench id={id} />;
  if (isAudit) return <Audit />;
  return <CaseList />;
}

function FirstCase() {
  const create = useMutation(api.trace.saveInvestigation);
  const [done, setDone] = useState(false);
  if (done) return null;
  // Plain read (no memo): this panel only renders while the case list is empty.
  const a = loadAll();
  const ds = a.find((d) => d.id === getSelected()) ?? a[0];
  const al = ds ? ds.alerts.find((x) => x.severity === "high" || x.severity === "critical") ?? ds.alerts[0] ?? null : null;
  const top = ds ? { ds, alert: al } : null;
  return (
    <div className="px-4 py-10 text-center">
      <ShieldAlert className="mx-auto h-8 w-8 text-[color:var(--primary)]/70" strokeWidth={1.4} />
      <p className="display mt-2.5 text-sm font-semibold">No cases yet — start from a live example</p>
      {al && top ? (
        <>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-6 text-muted-foreground\">Top review signal in “{top.ds.name}”: <span className="font-medium text-foreground">{al.title}</span></p>
          <p className="mt-0.5 text-xs text-muted-foreground">{al.severity} severity · {al.txnIds.length} linked transfers</p>
          <button onClick={async () => { if (!al || !top) return; await create({ title: `Case — ${al.title}`, status: "open", priority: al.severity, datasetId: top.ds.id, alertIds: [al.id], notes: [] }); setDone(true); }} className={`${btnPrimary} mt-3`}>
            <Plus className="mr-1 inline h-3.5 w-3.5" /> Escalate &amp; create case
          </button>
        </>
      ) : (
        <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-6 text-muted-foreground">Upload or generate a dataset first — alerts you escalate become cases here.</p>
      )}
    </div>
  );
}

function CaseList() {
  const query = useQuery(api.trace.listInvestigations);
  const cases = useMemo(() => query ?? [], [query]);
  const create = useMutation(api.trace.saveInvestigation);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [q, setQ] = useState("");
  const rows = cases.filter((c) =>
    (!status || c.status === status) &&
    (!priority || c.priority === priority) &&
    (!q || c.title.toLowerCase().includes(q.toLowerCase())));
  const counts = useMemo(() => {
    const m: Record<string, number> = { open: 0, reviewing: 0, escalated: 0, closed: 0 };
    cases.forEach((c) => { m[c.status] = (m[c.status] ?? 0) + 1; });
    return m;
  }, [cases]);

  return (
    <div className="grid gap-3 xl:grid-cols-3">
      <div className="space-y-3 xl:col-span-2">
        {/* status overview — click to filter */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {STATUSES.map((s, i) => (
            <button key={s} onClick={() => setStatus(status === s ? "" : s)}
              className={`rise rise-${i + 1} glass sheen lift relative overflow-hidden rounded-xl px-4 py-3 text-left transition-all ${status === s ? "border-[color:var(--glass-border-hi)]" : ""}`}>
              <span className="absolute left-0 top-0 h-full w-[3px] rounded-l-xl" style={{ background: STATUS_STYLES[s].dot }} aria-hidden />
              <p className="tnum display text-[22px] font-bold tracking-tight">{counts[s] ?? 0}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] capitalize text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_STYLES[s].dot }} />{s}
              </p>
            </button>
          ))}
        </div>

        <Card>
          <PanelTitle title={`Investigation cases (${rows.length}${rows.length !== cases.length ? ` of ${cases.length}` : ""})`} sub="Cases persist in the backend; every status change and note lands in the audit trail"
            right={<Link to="/audit" className="shrink-0 text-xs text-[color:var(--primary)] hover:underline">Audit trail →</Link>} />
          <div className="mt-3 flex flex-wrap gap-2 px-4">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New case title…" className={`${inputCls} min-w-[180px] flex-1`} aria-label="New case title" />
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className="rounded-lg border border-input bg-[color:var(--glass-hi)] px-2 py-1.5 text-xs" aria-label="Filter priority">
              <option value="">All priorities</option>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}
            </select>
            <button onClick={async () => { if (title.trim()) { await create({ title: title.trim(), status: "open", priority: "medium", alertIds: [], notes: [] }); setTitle(""); } }} className={btnPrimary}><Plus className="mr-1 inline h-3.5 w-3.5" /> Create</button>
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5 px-4 pt-2 text-xs">
            {status && <button onClick={() => setStatus("")} className="inline-flex items-center gap-1 rounded-full border border-border bg-[color:var(--glass)] px-2.5 py-0.5 text-muted-foreground hover:text-foreground">status: {status} <X className="h-3 w-3" /></button>}
            {priority && <button onClick={() => setPriority("")} className="inline-flex items-center gap-1 rounded-full border border-border bg-[color:var(--glass)] px-2.5 py-0.5 text-muted-foreground hover:text-foreground">priority: {priority} <X className="h-3 w-3" /></button>}
            {q && <button onClick={() => setQ("")} className="inline-flex items-center gap-1 rounded-full border border-border bg-[color:var(--glass)] px-2.5 py-0.5 text-muted-foreground hover:text-foreground">“{q}” <X className="h-3 w-3" /></button>}
          </div>
          <div className="space-y-2 p-4">
            {rows.map((c) => {
              const st = STATUS_STYLES[c.status] ?? STATUS_STYLES.open;
              const noteN = (c.notes as { at: string; text: string }[]).length;
              return (
                <Link key={c._id} to={`/investigations/${c._id}`} className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-border bg-[color:var(--glass)] p-3.5 backdrop-blur-md transition-all hover:border-[color:var(--glass-border-hi)] hover:bg-[color:var(--glass-hi)]">
                  <span className="absolute inset-y-0 left-0 w-1" style={{ background: st.dot }} aria-hidden />
                  <span className={`ml-1.5 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${st.chip}`}>{c.status}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{c.title}</span>
                    <span className="tnum mt-0.5 block text-[11px] text-muted-foreground">{c.alertIds.length} alert{c.alertIds.length === 1 ? "" : "s"} · {noteN} note{noteN === 1 ? "" : "s"} · updated {rel(new Date(c.updatedAt).getTime())}</span>
                  </span>
                  <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold capitalize text-muted-foreground" title="case priority">{c.priority}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </Link>
              );
            })}
            {rows.length === 0 && ((q || status || priority) ? <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">No cases match these filters — clear them above.</p> : <FirstCase />)}
          </div>
        </Card>
      </div>

      <Card className="h-fit p-5">
        <PanelTitle title="How cases work" />
        <ol className="mt-3 space-y-3 text-[13px]">
          {[
            ["Escalate", "Any alert can be escalated into a case with its evidence linked by id."],
            ["Investigate", "Status moves open → reviewing → escalated → closed; notes record what was checked."],
            ["Prove it", "Every mutation writes an audit event — actor, action, record, outcome."],
          ].map(([k, v], i) => (
            <li key={k} className="flex gap-3">
              <span className="tnum mono mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[color:var(--primary)]/40 bg-[color:var(--primary)]/10 text-[11px] font-bold text-[#c4b5fd]">{i + 1}</span>
              <span><span className="font-semibold">{k}. </span><span className="text-muted-foreground">{v}</span></span>
            </li>
          ))}
        </ol>
        <Link to="/audit" className={`${btnGhost} mt-4 w-full`}>Open audit trail →</Link>
      </Card>
    </div>
  );
}

function Workbench({ id }: { id: string }) {
  const cases = useQuery(api.trace.listInvestigations) ?? [];
  const update = useMutation(api.trace.updateInvestigation);
  const [note, setNote] = useState("");
  const cur = cases.find((c) => c._id === id);
  // Enrich linked alert ids with their live metadata from any local dataset.
  const alertMeta = useMemo(() => {
    const m = new Map<string, { title: string; severity: string; score: number; n: number; dsId: string }>();
    loadAll().forEach((d) => d.alerts.forEach((a) => {
      if (!m.has(a.id)) m.set(a.id, { title: a.title, severity: a.severity, score: a.score, n: a.txnIds.length, dsId: d.id });
    }));
    return m;
  }, []);
  if (!cur) return <Card><Empty title="Case not found" body="It may have been removed." action={<Link to="/investigations" className={btnGhost}>Back to cases</Link>} /></Card>;
  const st = STATUS_STYLES[cur.status] ?? STATUS_STYLES.open;
  const notes = (cur.notes as { at: string; text: string }[]).slice().reverse();
  return (
    <div className="space-y-3">
      <Link to="/investigations" className="text-[13px] text-muted-foreground hover:text-foreground">← All cases</Link>
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold">{cur.title}</h2>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${st.chip}`}>{cur.status}</span>
              <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold capitalize text-muted-foreground" title="case priority">priority {cur.priority}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{cur.alertIds.length} linked alert{cur.alertIds.length === 1 ? "" : "s"} · {notes.length} note{notes.length === 1 ? "" : "s"} · {cur.datasetId ? <Link to={`/datasets/${cur.datasetId}`} className="text-[color:var(--primary)] hover:underline">dataset</Link> : "no dataset link"}</p>
          </div>
          <div className="flex shrink-0 overflow-hidden rounded-full border border-border text-xs" role="group" aria-label="Case status">
            {STATUSES.map((s) => (
              <button key={s} onClick={() => update({ id: cur._id, status: s })}
                className={`px-3 py-1.5 capitalize transition-colors ${cur.status === s ? "font-semibold" : "text-muted-foreground hover:bg-[color:var(--glass-hi)]"}`}
                style={cur.status === s ? { background: STATUS_STYLES[s].dot + "22", color: STATUS_STYLES[s].dot } : undefined}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {cur.alertIds.map((a) => {
            const meta = alertMeta.get(a);
            return (
              <Link key={a} to={`/detections/${a}`} className="flex items-center gap-2.5 rounded-xl border border-border bg-[color:var(--glass)] p-2.5 transition-colors hover:border-[color:var(--glass-border-hi)] hover:bg-[color:var(--glass-hi)]">
                {meta ? <RiskCharacter severity={meta.severity} size={24} /> : <ShieldAlert className="h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={1.5} />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{meta ? meta.title : a}</span>
                  <span className="mono block text-[10px] text-muted-foreground">{a}{meta ? ` · ${meta.n} transfers` : " · metadata not in local datasets"}</span>
                </span>
                {meta && <SevBadge sev={meta.severity} />}
                {meta && <ScoreBar score={meta.score} w={40} />}
              </Link>
            );
          })}
          {cur.alertIds.length === 0 && <p className="text-[13px] text-muted-foreground">No alerts linked — escalate one from the alert explorer to attach its evidence.</p>}
        </div>
      </Card>

      <Card className="p-5">
        <PanelTitle title={`Analyst notes (${notes.length})`} sub="Newest first · every note is attributed and timestamped" />
        <div className="mt-4 space-y-0">
          {notes.map((n, i) => (
            <div key={i} className="relative ml-3 border-l border-border pb-4 pl-5 last:pb-0">
              <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border border-[#0b0a1a] bg-[color:var(--primary)]" aria-hidden />
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[13px] leading-6">{n.text}</p>
                <span className="tnum shrink-0 text-[11px] text-muted-foreground">{new Date(n.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            </div>
          ))}
          {notes.length === 0 && <p className="py-6 text-center text-[13px] text-muted-foreground">No analyst notes yet — document what you checked so the next reviewer doesn't repeat it.</p>}
        </div>
        <div className="mt-4 flex gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add analyst note…" className={`${inputCls} flex-1`} aria-label="Add note" />
          <button onClick={() => { if (note.trim()) { update({ id: cur._id, note: { at: new Date().toISOString(), text: note.trim() } }); setNote(""); } }} className={btnPrimary}><StickyNote className="mr-1 inline h-3.5 w-3.5" /> Add</button>
        </div>
      </Card>
    </div>
  );
}

function Audit() {
  const query = useQuery(api.trace.auditList);
  const audit = useMemo(() => query ?? [], [query]);
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const rows = audit.filter((a) =>
    (!actor || a.actor.toLowerCase().includes(actor.toLowerCase())) &&
    (!action || a.action.includes(action)));
  const cur = open ? audit.find((a) => a._id === open) : null;
  const actors = useMemo(() => new Set(audit.map((a) => a.actor)).size, [audit]);
  const actions = useMemo(() => [...new Set(audit.map((a) => a.action))].sort(), [audit]);
  // Group the timeline by calendar day (newest day first, newest event first).
  const groups = useMemo(() => {
    const m = new Map<string, typeof rows>();
    [...rows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).forEach((a) => {
      const k = new Date(a.createdAt).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(a);
    });
    return [...m.entries()];
  }, [rows]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([
          [num(audit.length), "events recorded", "var(--primary)"],
          [num(actors), "distinct actors", "var(--teal)"],
          [num(actions.length), "action types", "var(--warning)"],
          [audit.length ? new Date(audit.reduce((m2, a) => Math.min(m2, new Date(a.createdAt).getTime()), Infinity)).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—", "first event", "var(--muted-foreground)"],
        ] as [string, string, string][]).map(([v, k, c], i) => (
          <div key={k} className={`rise rise-${i + 1} glass sheen lift relative overflow-hidden rounded-xl px-4 py-3.5`}>
            <span className="absolute left-0 top-0 h-full w-[3px] rounded-l-xl" style={{ background: c }} aria-hidden />
            <p className="display tnum truncate text-[22px] font-bold tracking-tight">{v}</p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{k}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="Filter actor…" className="w-48 rounded-full border border-input bg-[color:var(--glass-hi)] py-1.5 pl-8 pr-3 text-[13px] outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-[color:var(--ring)]/60" aria-label="Filter actor" />
        </span>
        <select value={action} onChange={(e) => setAction(e.target.value)} className="rounded-full border border-input bg-[color:var(--glass)] px-3 py-1.5 text-xs backdrop-blur-md transition-colors hover:border-[color:var(--glass-border-hi)]" aria-label="Filter action">
          <option value="">All actions</option>{actions.map((x) => <option key={x}>{x}</option>)}
        </select>
        <span className="text-xs text-muted-foreground">Authorised reviewers only · {rows.length} of {audit.length} events</span>
      </div>

      <Card className="p-4">
        {rows.length === 0 ? (
          audit.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <StickyNote className="mx-auto h-8 w-8 text-[color:var(--primary)]/70" strokeWidth={1.4} />
              <p className="display mt-2.5 text-sm font-semibold">No audit events yet</p>
              <p className="mx-auto mt-1.5 max-w-lg text-[13px] leading-6 text-muted-foreground">Every case escalation, status change and note lands here with actor, action, record and outcome. Escalate an alert or add a note to write the first event.</p>
            </div>
          ) : <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">No audit events match these filters.</p>
        ) : (
          <div className="space-y-5">
            {groups.map(([day, list]) => (
              <div key={day}>
                <p className="mono sticky top-0 z-10 mb-2 inline-block rounded-full border border-border bg-[color:var(--elevated)] px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground backdrop-blur-md">{day}</p>
                <div className="relative ml-3 space-y-2.5 border-l border-border pl-5">
                  {list.map((a) => {
                    const c = actionColor(a.action);
                    return (
                      <button key={a._id} onClick={() => setOpen(a._id)} className="group relative block w-full text-left">
                        <span className="absolute -left-[27px] top-3 h-2.5 w-2.5 rounded-full border border-[#0b0a1a]" style={{ background: c }} aria-hidden />
                        <span className="flex items-center gap-2.5 rounded-xl border border-border bg-[color:var(--glass)] p-3 transition-all hover:border-[color:var(--glass-border-hi)] hover:bg-[color:var(--glass-hi)]">
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="text-[13px] font-semibold">{a.actor}</span>
                              <span className="mono rounded border px-1.5 py-0.5 text-[10px]" style={{ color: c, borderColor: c + "55", background: c + "14" }}>{a.action}</span>
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground" title={a.detail ?? ""}>{a.target ?? "—"}{a.detail ? ` · ${a.detail}` : ""}</span>
                          </span>
                          <span className="tnum shrink-0 text-[11px] text-muted-foreground">{new Date(a.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                          <span className="shrink-0 rounded-full border border-[color:var(--success)]/35 bg-[color:var(--success)]/10 px-2 py-0.5 text-[10px] font-semibold text-[color:var(--success)]">recorded</span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {cur && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(null)} />
          <aside className="relative h-full w-full max-w-sm overflow-y-auto border-l border-border bg-[color:var(--elevated)] p-5">
            <div className="flex items-center justify-between">
              <h3 className="display text-[15px] font-bold">Event detail</h3>
              <button onClick={() => setOpen(null)} className="rounded-full border border-border p-1.5 text-muted-foreground hover:text-foreground" aria-label="Close"><X className="h-4 w-4" /></button>
            </div>
            <span className="mono mt-3 inline-block rounded border px-2 py-1 text-xs" style={{ color: actionColor(cur.action), borderColor: actionColor(cur.action) + "55", background: actionColor(cur.action) + "14" }}>{cur.action}</span>
            <dl className="mt-4 space-y-2.5 text-[13px]">
              {[["Timestamp", new Date(cur.createdAt).toLocaleString("en-IN")], ["Actor", cur.actor], ["Record", cur.target ?? "—"], ["Detail", cur.detail ?? "—"], ["Outcome", "recorded"]].map(([k, x]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-border/50 pb-1.5">
                  <dt className="shrink-0 text-muted-foreground">{k}</dt>
                  <dd className="text-right font-medium">{x}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-[11px] leading-5 text-muted-foreground">Audit entries are append-only in the backend — this view never edits or deletes them.</p>
            <button onClick={() => setOpen(null)} className={`${btnGhost} mt-4 w-full`}>Close</button>
          </aside>
        </div>
      )}
    </div>
  );
}
