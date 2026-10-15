import { Card, emit, num } from "@/components/app/Shell";
import { toCSV } from "@/lib/trace/csv";
import { runDetection } from "@/lib/trace/detect";
import { download, loadAll, saveAll, setSelected } from "@/lib/trace/store";
import { ArrowLeft, Download, Play } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";

export default function DatasetDetail() {
  const { id } = useParams();
  const [v, setV] = useState(0);
  const ds = useMemo(() => loadAll().find((d) => d.id === id), [id, v]);
  const [tab, setTab] = useState<"rows" | "quality" | "manifest">("rows");
  if (!ds) return <Card className="p-8 text-sm">Dataset not found. <Link to="/datasets" className="underline">Back</Link></Card>;
  const r = ds.report;

  function rerun() {
    const all = loadAll();
    const d = all.find((x) => x.id === id)!;
    d.alerts = runDetection(d.txns, d.rules);
    saveAll(all); emit(); setV((x) => x + 1);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/datasets" className="inline-flex items-center gap-1 text-[13px] text-neutral-500"><ArrowLeft className="h-3.5 w-3.5" /> Library</Link>
        <span className="rounded-full border border-neutral-300 bg-white px-3 py-1 text-[13px] font-medium">{ds.name}</span>
        <span className="text-xs text-neutral-500">Tier {ds.tier} · {num(ds.txns.length)} records · {ds.alerts.length} alerts</span>
        <div className="ml-auto flex gap-2">
          <button onClick={() => { setSelected(ds.id); emit(); }} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs">Set active</button>
          <button onClick={rerun} className="inline-flex items-center gap-1 rounded-md bg-neutral-900 px-3 py-1.5 text-xs text-white"><Play className="h-3 w-3" /> Re-run detection</button>
        </div>
      </div>

      {r.warnings.length > 0 && (
        <Card className="border-amber-300 bg-amber-50 p-4 text-[13px] leading-6">
          <p className="font-semibold">Data limitations ({r.warnings.length})</p>
          <ul className="mt-1 list-disc pl-5 text-neutral-700">{r.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-neutral-200 bg-neutral-200 md:grid-cols-4">
        {[["Records", num(r.records)], ["Columns", num(r.columns)], ["Duplicate rows", num(r.duplicateRows)], ["Invalid amounts", num(r.invalidAmounts)],
          ["Invalid dates", num(r.invalidDates)], ["Period", `${r.minDate?.slice(0, 10) ?? "—"} → ${r.maxDate?.slice(0, 10) ?? "—"}`],
          ["Currencies", r.currencies.slice(0, 3).map((c) => c.code).join(", ") || "—"], ["Top channel", r.channels[0]?.name ?? "—"]].map(([k, x]) => (
          <div key={k} className="bg-white px-4 py-3"><p className="text-[11px] uppercase tracking-wider text-neutral-400">{k}</p><p className="mt-0.5 truncate text-sm font-semibold tabular-nums">{x}</p></div>
        ))}
      </div>

      <div className="flex gap-1 border-b border-neutral-200 text-[13px]">
        {(["rows", "quality", "manifest"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 capitalize ${tab === t ? "border-b-2 border-neutral-900 font-semibold" : "text-neutral-500"}`}>{t === "rows" ? "Sample rows" : t === "quality" ? "Quality report" : "Scenario manifest"}</button>
        ))}
        <div className="ml-auto flex gap-2 pb-1">
          <button onClick={() => download(`${ds.name}-quality.csv`, toCSV(r.missingByColumn.map((m) => ({ column: m.column, missing_pct: m.pct }))))} className="inline-flex items-center gap-1 rounded border border-neutral-200 px-2 py-1 text-xs"><Download className="h-3 w-3" /> Quality CSV</button>
          <button onClick={() => download(`${ds.name}-alerts.csv`, toCSV(ds.alerts.map((a) => ({ id: a.id, rule: a.ruleId, category: a.category, severity: a.severity, score: a.score, txns: a.txnIds.join(";") }))))} className="inline-flex items-center gap-1 rounded border border-neutral-200 px-2 py-1 text-xs"><Download className="h-3 w-3" /> Alerts CSV</button>
        </div>
      </div>

      {tab === "rows" && (
        <Card className="overflow-auto p-0">
          <table className="w-full min-w-[820px] text-left text-xs tabular-nums">
            <thead><tr className="border-b border-neutral-200 text-[11px] uppercase tracking-wider text-neutral-400">
              {["ID", "Sender", "Receiver", "Amount", "Ccy", "Timestamp", "Channel", "Route"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}
            </tr></thead>
            <tbody>
              {ds.txns.slice(0, 100).map((t) => (
                <tr key={t.id} className="border-b border-neutral-100">
                  <td className="px-3 py-1.5 font-mono">{t.id}</td><td className="px-3 py-1.5 font-mono">{t.sender}</td>
                  <td className="px-3 py-1.5 font-mono">{t.receiver}</td><td className="px-3 py-1.5">{t.amount.toLocaleString("en-IN")}</td>
                  <td className="px-3 py-1.5">{t.currency}</td><td className="px-3 py-1.5">{t.timestamp.slice(0, 16).replace("T", " ")}</td>
                  <td className="px-3 py-1.5">{t.channel}</td><td className="px-3 py-1.5">{t.origin_country}→{t.dest_country}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-xs text-neutral-400">Showing first 100 of {num(ds.txns.length)}. Exports carry full evidence.</p>
        </Card>
      )}
      {tab === "quality" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4"><p className="text-[13px] font-semibold">Missingness by column</p>
            <div className="mt-2 space-y-1.5 text-xs tabular-nums">{r.missingByColumn.slice(0, 20).map((m) => (
              <div key={m.column} className="flex items-center gap-2"><span className="w-40 truncate font-mono">{m.column}</span>
                <div className="h-1.5 flex-1 rounded bg-neutral-100"><div className="h-1.5 rounded bg-neutral-700" style={{ width: `${m.pct * 100}%` }} /></div><span>{(m.pct * 100).toFixed(0)}%</span></div>))}</div>
          </Card>
          <Card className="p-4"><p className="text-[13px] font-semibold">Distributions</p>
            <p className="mt-2 text-xs uppercase tracking-wider text-neutral-400">Currency</p>
            <div className="mt-1 space-y-1 text-[13px] tabular-nums">{r.currencies.map((c) => <div key={c.code} className="flex justify-between"><span>{c.code}</span><span>{num(c.n)}</span></div>)}</div>
            <p className="mt-3 text-xs uppercase tracking-wider text-neutral-400">Channel</p>
            <div className="mt-1 space-y-1 text-[13px] tabular-nums">{r.channels.map((c) => <div key={c.name} className="flex justify-between"><span>{c.name}</span><span>{num(c.n)}</span></div>)}</div>
          </Card>
        </div>
      )}
      {tab === "manifest" && (
        <Card className="p-4 text-[13px]">
          {ds.manifest ? (
            <><p className="font-semibold">Ground-truth manifest (kept separate from detection inputs)</p>
              <p className="mt-1 text-neutral-500">Seed {ds.manifest.seed} · {ds.manifest.scenarios.length} scenarios · {ds.manifest.groundTruth.length} labelled transfers</p>
              <div className="mt-3 space-y-2">{ds.manifest.scenarios.map((s, i) => (
                <div key={i} className="rounded border border-neutral-200 p-3"><p className="font-medium">{s.kind}</p><p className="text-neutral-600">{s.description}</p><p className="mt-1 font-mono text-xs text-neutral-500">{s.txnIds.join(", ")}</p></div>))}</div></>
          ) : <p className="text-neutral-500">No scenario manifest — this is an uploaded file, not a synthetic set. Evaluation memo: metrics appear only when a manifest exists; otherwise “Not evaluated yet”.</p>}
        </Card>
      )}
    </div>
  );
}
