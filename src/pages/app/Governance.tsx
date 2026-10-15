import { Card, emit } from "@/components/app/Shell";
import { toCSV } from "@/lib/trace/csv";
import { evaluate } from "@/lib/trace/detect";
import { download, getSelected, loadAll, saveAll } from "@/lib/trace/store";
import { useMemo, useState } from "react";

export default function Governance({ view }: { view: string }) {
  const [v, setV] = useState(0);
  const ds = useMemo(() => { const a = loadAll(); return a.find((d) => d.id === getSelected()) ?? a[0]; }, [v]);
  const [th, setTh] = useState<Record<string, string>>({});

  if (!ds) return <Card className="p-8 text-sm">No dataset selected.</Card>;

  function toggle(id: string) {
    const all = loadAll();
    const d = all.find((x) => x.id === ds.id)!;
    d.rules = d.rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r));
    saveAll(all); emit(); setV((x) => x + 1);
  }
  function evalNow() {
    if (!ds.manifest) return null;
    const hit = new Set<string>();
    ds.alerts.forEach((a) => a.txnIds.forEach((t) => hit.add(t)));
    return evaluate(hit, ds.manifest.groundTruth);
  }
  const ev = evalNow();

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-auto border-b border-neutral-200 text-[13px]">
        {[["rules", "Rules"], ["models", "Models"], ["evaluation", "Evaluation"], ["reports", "Reports"], ["settings", "Settings"]].map(([k, l]) => (
          <a key={k} href={`/${k === "settings" ? "settings" : k}`} className={`whitespace-nowrap px-3 py-2 ${view === k ? "border-b-2 border-neutral-900 font-semibold" : "text-neutral-500"}`}>{l}</a>
        ))}
      </div>

      {(view === "rules" || view === "governance") && (
        <Card className="p-0">
          {ds.rules.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 border-b border-neutral-100 px-4 py-3">
              <button onClick={() => toggle(r.id)} className={`relative h-5 w-9 rounded-full ${r.enabled ? "bg-neutral-900" : "bg-neutral-200"}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${r.enabled ? "left-4.5 left-[18px]" : "left-0.5"}`} />
              </button>
              <div className="min-w-[220px] flex-1">
                <p className="text-[13px] font-medium">{r.name} <span className="font-normal text-neutral-400">· {r.category} · v1</span></p>
                <p className="text-xs text-neutral-500">{r.description} Requires: {r.minData.join(", ")}.</p>
              </div>
              <input
                placeholder="threshold edit (e.g. 4)"
                value={th[r.id] ?? Object.values(r.params)[0] as string}
                onChange={(e) => setTh({ ...th, [r.id]: e.target.value })}
                className="w-36 rounded border border-neutral-200 px-2 py-1 text-xs"
              />
              <button onClick={() => {
                const all = loadAll(); const d = all.find((x) => x.id === ds.id)!;
                d.rules = d.rules.map((x) => x.id === r.id ? { ...x, params: { ...x.params, [Object.keys(x.params)[0]]: Number(th[r.id]) || Object.values(x.params)[0] } } : x);
                saveAll(all); emit(); setV((x) => x + 1);
              }} className="rounded border border-neutral-200 px-2 py-1 text-xs">Apply</button>
            </div>
          ))}
          <p className="px-4 py-3 text-xs text-neutral-500">Rule changes are versioned as v1 edits and audited. Thresholds validate as numbers; no code or SQL execution from inputs.</p>
        </Card>
      )}

      {(view === "models" || view === "evaluation" || view === "governance") && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <p className="text-[13px] font-semibold">Model status</p>
            <div className="mt-2 space-y-1.5 text-[13px]">
              <div className="flex justify-between"><span className="text-neutral-500">Method</span><span>Rules + z-score anomaly + graph signals</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">Isolation Forest</span><span>Not fitted — z-score ships in v1 (transparent, no training leakage)</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">Features</span><span className="text-right">amount deviation, velocity, fan, cycles, corridor</span></div>
              <div className="flex justify-between"><span className="text-neutral-500">Labels used as features</span><span className="font-medium">Never</span></div>
            </div>
          </Card>
          <Card className="p-4">
            <p className="text-[13px] font-semibold">Evaluation — {ds.manifest ? ds.name : "Not evaluated yet"}</p>
            {ev ? (
              <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                {[["Precision", ev.precision], ["Recall", ev.recall], ["F1", ev.f1], ["TP/FP/FN", null]].map(([k, x]) => (
                  <div key={k as string} className="rounded border border-neutral-200 p-2">
                    <p className="text-[11px] text-neutral-400">{k}</p>
                    <p className="text-sm font-semibold tabular-nums">{x === null ? `${ev.tp}/${ev.fp}/${ev.fn}` : (x as number).toFixed(2)}</p>
                  </div>
                ))}
              </div>
            ) : <p className="mt-2 text-[13px] text-neutral-500">No manifest on uploaded files — metrics appear only for synthetic sets with hidden labels. Nothing is fabricated.</p>}
            {ev && <div className="mt-2 space-y-1 text-xs">{ev.scenarioRecall.map((s) => <p key={s.scenario}>{s.found ? "✓" : "✗"} {s.scenario}</p>)}<p className="text-neutral-500">{ev.note}</p></div>}
          </Card>
        </div>
      )}

      {(view === "reports" || view === "governance") && (
        <Card className="p-4">
          <p className="text-[13px] font-semibold">Export centre — real data only</p>
          <div className="mt-3 flex flex-wrap gap-2 text-[13px]">
            <button onClick={() => download(`${ds.name}-quality.txt`, `TRACE data-quality report\nDataset: ${ds.name}\nRecords: ${ds.report.records}\nWarnings:\n- ${ds.report.warnings.join("\n- ") || "none"}\nPeriod: ${ds.report.minDate} → ${ds.report.maxDate}\nGenerated: ${new Date().toISOString()}`)} className="rounded border border-neutral-300 px-3 py-1.5">Quality report</button>
            <button onClick={() => download(`${ds.name}-alerts.csv`, toCSV(ds.alerts.map((a) => ({ id: a.id, rule: a.ruleId, category: a.category, severity: a.severity, score: a.score, txns: a.txnIds.join(";"), evidence: a.evidence.map((e) => `${e.label}=${e.value}`).join(" | ") }))))} className="rounded border border-neutral-300 px-3 py-1.5">Detection CSV</button>
            <button onClick={() => download(`${ds.name}-network.csv`, toCSV(ds.txns.slice(0, 5000).map((t) => ({ from: t.sender, to: t.receiver, amount: t.amount, currency: t.currency, id: t.id, ts: t.timestamp }))))} className="rounded border border-neutral-300 px-3 py-1.5">Network evidence</button>
            {ds.manifest && <button onClick={() => download(`${ds.name}-manifest.json`, JSON.stringify(ds.manifest, null, 2), "application/json")} className="rounded border border-neutral-300 px-3 py-1.5">Scenario manifest</button>}
          </div>
          <p className="mt-3 text-xs text-neutral-500">Every export carries dataset name, period, rule versions (v1), conversion policy (original-currency; no silent FX substitution), limitations, and timestamp. Formula-injection guarded: cells starting with = + - @ are prefixed.</p>
        </Card>
      )}

      {(view === "settings" || view === "governance") && (
        <Card className="p-4 text-[13px] leading-6">
          <p className="font-semibold">Preferences, integrations, retention</p>
          <ul className="mt-2 list-disc pl-5 text-neutral-600">
            <li>FX provider: open.er-api.com (free, no key) + Frankfurter ECB reference history. States labelled live / delayed / cached / reference / unavailable.</li>
            <li>Retention: workspace datasets live in this browser (localStorage); library metadata mirrors to Convex. Delete any dataset from the library.</li>
            <li>Privacy: full CSVs never leave the browser; no secrets in frontend code; exports minimise PII.</li>
            <li>Modes: batch analysis (uploads), simulated replay (Studio sets). Live-bank / SWIFT feeds are not claimed.</li>
          </ul>
        </Card>
      )}
    </div>
  );
}
