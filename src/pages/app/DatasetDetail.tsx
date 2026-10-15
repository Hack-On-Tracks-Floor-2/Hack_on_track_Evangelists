import { Card, PanelTitle, WarnStrip, btnGhost, btnPrimary, emit, num } from "@/components/app/Shell";
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/datasets" className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Library</Link>
        <span className="rounded-full border border-border bg-card px-3 py-1 text-[13px] font-medium">{ds.name}</span>
        <span className="text-xs text-muted-foreground">Tier {ds.tier} · {num(ds.txns.length)} records · {ds.alerts.length} alerts</span>
        <div className="ml-auto flex gap-2">
          <button onClick={() => { setSelected(ds.id); emit(); }} className={btnGhost}>Set active</button>
          <button onClick={rerun} className={btnPrimary}><Play className="mr-1 inline h-3 w-3" /> Re-run detection</button>
        </div>
      </div>

      {r.warnings.length > 0 && (
        <WarnStrip><p className="font-semibold">Data limitations ({r.warnings.length})</p>
          <ul className="list-disc pl-4 text-muted-foreground">{r.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></WarnStrip>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["Records", num(r.records)], ["Columns", num(r.columns)], ["Duplicate rows", num(r.duplicateRows)], ["Invalid amounts", num(r.invalidAmounts)],
          ["Invalid dates", num(r.invalidDates)], ["Period", `${r.minDate?.slice(0, 10) ?? "—"} → ${r.maxDate?.slice(0, 10) ?? "—"}`],
          ["Currencies", r.currencies.slice(0, 3).map((c) => c.code).join(", ") || "—"], ["Top channel", r.channels[0]?.name ?? "—"]].map(([k, x]) => (
          <div key={k} className="rounded-lg border border-border bg-card px-4 py-3"><p className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</p><p className="tnum mt-0.5 truncate text-sm font-bold">{x}</p></div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border text-[13px]">
        {(["rows", "quality", "manifest"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 capitalize ${tab === t ? "border-b-2 border-[color:var(--primary)] font-semibold text-foreground" : "text-muted-foreground"}`}>{t === "rows" ? "Sample rows" : t === "quality" ? "Quality report" : "Scenario manifest"}</button>
        ))}
        <div className="ml-auto flex gap-2 pb-1">
          <button onClick={() => download(`${ds.name}-quality.csv`, toCSV(r.missingByColumn.map((m) => ({ column: m.column, missing_pct: m.pct }))))} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"><Download className="h-3 w-3" /> Quality CSV</button>
          <button onClick={() => download(`${ds.name}-alerts.csv`, toCSV(ds.alerts.map((a) => ({ id: a.id, rule: a.ruleId, category: a.category, severity: a.severity, score: a.score, txns: a.txnIds.join(";") }))))} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"><Download className="h-3 w-3" /> Alerts CSV</button>
        </div>
      </div>

      {tab === "rows" && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-xs tnum">
            <thead><tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
              {["ID", "Sender", "Receiver", "Amount", "Ccy", "Timestamp", "Channel", "Route"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {ds.txns.slice(0, 100).map((t) => (
                <tr key={t.id} className="border-b border-border/50">
                  <td className="mono px-3 py-1.5 text-[color:var(--primary)]">{t.id}</td><td className="mono px-3 py-1.5">{t.sender}</td>
                  <td className="mono px-3 py-1.5">{t.receiver}</td><td className="px-3 py-1.5 font-semibold">{t.amount.toLocaleString("en-IN")}</td>
                  <td className="px-3 py-1.5">{t.currency}</td><td className="px-3 py-1.5 text-muted-foreground">{t.timestamp.slice(0, 16).replace("T", " ")}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{t.channel}</td><td className="px-3 py-1.5 text-muted-foreground">{t.origin_country}→{t.dest_country}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-xs text-muted-foreground">Showing first 100 of {num(ds.txns.length)}. Exports carry full evidence.</p>
        </Card>
      )}
      {tab === "quality" && (
        <div className="grid gap-3 xl:grid-cols-2">
          <Card className="p-4"><PanelTitle title="Missingness by column" />
            <div className="mt-2 space-y-1.5 text-xs tnum">{r.missingByColumn.slice(0, 20).map((m) => (
              <div key={m.column} className="flex items-center gap-2"><span className="mono w-40 truncate">{m.column}</span>
                <div className="h-1.5 flex-1 rounded bg-muted"><div className="h-1.5 rounded bg-[color:var(--primary)]" style={{ width: `${m.pct * 100}%` }} /></div><span>{(m.pct * 100).toFixed(0)}%</span></div>))}</div>
          </Card>
          <Card className="p-4"><PanelTitle title="Distributions" />
            <p className="mt-2 text-[11px] uppercase tracking-wider text-muted-foreground">Currency</p>
            <div className="mt-1 space-y-1 text-[13px] tnum">{r.currencies.map((c) => <div key={c.code} className="flex justify-between border-b border-border/50 pb-1"><span>{c.code}</span><span>{num(c.n)}</span></div>)}</div>
            <p className="mt-3 text-[11px] uppercase tracking-wider text-muted-foreground">Channel</p>
            <div className="mt-1 space-y-1 text-[13px] tnum">{r.channels.map((c) => <div key={c.name} className="flex justify-between border-b border-border/50 pb-1"><span>{c.name}</span><span>{num(c.n)}</span></div>)}</div>
          </Card>
        </div>
      )}
      {tab === "manifest" && (
        <Card className="p-4 text-[13px]">
          {ds.manifest ? (
            <><PanelTitle title="Ground-truth manifest" sub={`Seed ${ds.manifest.seed} · ${ds.manifest.scenarios.length} scenarios · ${ds.manifest.groundTruth.length} labelled transfers — kept separate from detection inputs`} />
              <div className="mt-3 space-y-2">{ds.manifest.scenarios.map((s, i) => (
                <div key={i} className="rounded-md border border-border p-3"><p className="font-semibold">{s.kind}</p><p className="text-muted-foreground">{s.description}</p><p className="mono mt-1 text-xs text-muted-foreground">{s.txnIds.join(", ")}</p></div>))}</div></>
          ) : <p className="text-muted-foreground">No scenario manifest — this is an uploaded file, not a synthetic set. Metrics show “Not evaluated yet”.</p>}
        </Card>
      )}
    </div>
  );
}
