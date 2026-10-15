import { Card, emit } from "@/components/app/Shell";
import { runDetection } from "@/lib/trace/detect";
import { getSelected, loadAll, saveAll } from "@/lib/trace/store";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";

export default function Detections() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const q = (sp.get("q") ?? "").toLowerCase();
  const [sev, setSev] = useState("");
  const [cat, setCat] = useState("");
  const [v, setV] = useState(0);
  const saveCase = useMutation(api.trace.saveInvestigation);

  const ds = useMemo(() => {
    const all = loadAll();
    return all.find((d) => d.id === getSelected()) ?? all[0];
  }, [v]);
  if (!ds) return <Card className="p-8 text-sm">No dataset. <Link to="/datasets" className="underline">Upload one</Link>.</Card>;

  const filtered = ds.alerts.filter((a) =>
    (!sev || a.severity === sev) && (!cat || a.category === cat) &&
    (!q || (a.title + a.id + a.txnIds.join(" ") + a.entities.join(" ")).toLowerCase().includes(q)));

  const detail = id ? ds.alerts.find((a) => a.id === id) : null;

  function rerun() {
    const all = loadAll();
    const d = all.find((x) => x.id === ds.id)!;
    d.alerts = runDetection(d.txns, d.rules);
    saveAll(all); emit(); setV((x) => x + 1);
  }

  async function escalate(aid: string) {
    await saveCase({ title: `Case — ${aid}`, status: "open", priority: "medium", datasetId: ds.id, alertIds: [aid], notes: [] });
    alert("Case created in Investigations.");
  }

  if (detail) {
    const txns = detail.txnIds.map((t) => ds.txns.find((x) => x.id === t)).filter(Boolean);
    return (
      <div className="space-y-4">
        <Link to="/detections" className="text-[13px] text-neutral-500">← All detections</Link>
        <Card className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${detail.severity === "critical" || detail.severity === "high" ? "bg-neutral-900 text-white" : "bg-neutral-100"}`}>{detail.severity}</span>
            <span className="text-xs text-neutral-500">{detail.category} · priority {detail.score}/100 (not a probability)</span>
            <button onClick={() => escalate(detail.id)} className="ml-auto rounded-md border border-neutral-300 px-3 py-1.5 text-xs">Escalate to case</button>
          </div>
          <h2 className="mt-2 text-base font-semibold tracking-tight">{detail.title}</h2>
          <p className="mt-2 max-w-3xl text-[13px] leading-6 text-neutral-600">{detail.explanation}</p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Evidence</p>
              <div className="mt-1.5 space-y-1.5 text-[13px]">{detail.evidence.map((e, i) => (
                <div key={i} className="flex justify-between gap-3 border-b border-neutral-100 pb-1.5"><span className="text-neutral-500">{e.label}</span><span className="text-right font-mono text-xs">{e.value}</span></div>))}</div>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">Timeline</p>
              <div className="mt-1.5 space-y-1 text-xs tabular-nums">{txns.map((t) => (
                <div key={t!.id} className="flex justify-between gap-2 border-b border-neutral-100 pb-1"><span className="font-mono">{t!.id}</span><span>{t!.sender}→{t!.receiver}</span><span>{t!.amount} {t!.currency}</span><span className="text-neutral-400">{t!.timestamp.slice(0, 16).replace("T", " ")}</span></div>))}</div>
            </div>
            <div className="space-y-3 text-[13px] leading-6">
              <div className="rounded border border-neutral-200 p-3"><p className="font-semibold">Plausible legitimate explanation</p><p className="text-neutral-600">{detail.legitimate}</p></div>
              <div className="rounded border border-neutral-200 p-3"><p className="font-semibold">Suggested checks</p><ul className="list-disc pl-5 text-neutral-600">{detail.checks.map((c, i) => <li key={i}>{c}</li>)}</ul></div>
              <div className="rounded border border-amber-300 bg-amber-50 p-3"><p className="font-semibold">Missing context</p><p>{detail.limitations}</p></div>
              <p className="text-xs text-neutral-500">Rule {detail.ruleId} · dataset {ds.name} · wording is neutral (“possible”, “potential”) — never a finding of guilt.</p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <select value={sev} onChange={(e) => setSev(e.target.value)} className="rounded border border-neutral-200 px-2 py-1.5"><option value="">All severities</option><option value="critical">critical</option><option value="high">high</option><option value="medium">medium</option><option value="low">low</option></select>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded border border-neutral-200 px-2 py-1.5"><option value="">All categories</option>{[...new Set(ds.alerts.map((a) => a.category))].map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <span className="text-neutral-500">{filtered.length} of {ds.alerts.length} alerts · {ds.name}</span>
        <button onClick={rerun} className="ml-auto rounded-md bg-neutral-900 px-3 py-1.5 text-xs text-white">Run monitoring job</button>
      </div>
      <Card className="divide-y divide-neutral-100 p-0">
        {filtered.slice(0, 80).map((a) => (
          <Link key={a.id} to={`/detections/${a.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-50">
            <span className={`w-16 shrink-0 rounded px-1.5 py-0.5 text-center text-[11px] font-medium ${a.severity === "high" || a.severity === "critical" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600"}`}>{a.severity}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{a.title}</p>
              <p className="truncate font-mono text-[11px] text-neutral-400">{a.id} · {a.txnIds.slice(0, 3).join(", ")}{a.txnIds.length > 3 ? ` +${a.txnIds.length - 3}` : ""}</p>
            </div>
            <span className="shrink-0 text-xs tabular-nums text-neutral-500">{a.score}</span>
          </Link>
        ))}
        {filtered.length === 0 && <p className="px-4 py-10 text-center text-[13px] text-neutral-400">No alerts match. Adjust filters or check unsupported analyses on the dataset page.</p>}
      </Card>
    </div>
  );
}
