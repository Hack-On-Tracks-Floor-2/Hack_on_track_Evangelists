import { Card, emit } from "@/components/app/Shell";
import { buildMapping, inferMapping, normalize, parseCSV, readiness, type FieldMapping, type SemanticField } from "@/lib/trace/csv";
import { DEFAULT_RULES, runDetection } from "@/lib/trace/detect";
import { generate } from "@/lib/trace/synthetic";
import { loadAll, saveAll, setSelected, type Dataset } from "@/lib/trace/store";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { CheckCircle2, FileUp, Trash2, TriangleAlert, Wand2 } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";

const FIELD_OPTS: (SemanticField | "")[] = ["", "txn_id", "sender", "receiver", "amount", "currency", "timestamp", "origin_country", "dest_country", "channel", "purpose", "status", "ignore"];

export default function Datasets() {
  const nav = useNavigate();
  const saveRemote = useMutation(api.trace.save);
  const [list, setList] = useState<Dataset[]>(loadAll());
  const [stage, setStage] = useState<{ name: string; cols: string[]; rows: Record<string, string>[]; maps: FieldMapping[] } | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => { setList(loadAll()); };

  async function handleFile(f: File) {
    if (!/\.csv$/i.test(f.name) && f.type !== "text/csv") { alert("Only .csv files are accepted in v1."); return; }
    if (f.size > 25 * 1024 * 1024) { alert("File exceeds 25 MB v1 limit. Split it or sample it first."); return; }
    const text = await f.text();
    const t = parseCSV(text);
    if (!t.columns.length) { alert("No columns found. Check the file."); return; }
    setStage({ name: f.name.replace(/\.csv$/i, ""), cols: t.columns, rows: t.rows, maps: inferMapping(t) });
    setOverrides({});
  }

  function confirmMapping() {
    if (!stage) return;
    const col2field: Record<string, string> = {};
    stage.maps.forEach((m) => { col2field[m.column] = overrides[m.column] ?? m.field ?? ""; });
    // ambiguous check: two columns -> same sender/receiver with low confidence
    const chosen = Object.entries(col2field).filter(([, v]) => v === "sender" || v === "receiver");
    const amb = stage.maps.filter((m) => (m.field === "sender" || m.field === "receiver") && m.confidence < 0.6);
    if (chosen.length === 0) { alert("Choose at least a sender or receiver column, or proceed as generic profile (Tier 3)."); }
    const map = buildMapping(col2field as Record<string, SemanticField | "">);
    const { txns, report } = normalize({ columns: stage.cols, rows: stage.rows, delimiter: ",", encodingNote: "" }, map);
    const r = readiness(map);
    const rules = DEFAULT_RULES.map((x) => ({ ...x }));
    const need = new Map<string, boolean>([
      ["sender", !!map.sender], ["receiver", !!map.receiver], ["amount", !!map.amount], ["timestamp", !!map.timestamp],
    ]);
    const runnable = rules.filter((x) => x.minData.every((m) => need.get(m)));
    const alerts = runDetection(txns, runnable);
    const ds: Dataset = {
      id: `ds-${Date.now().toString(36)}`, name: stage.name, source: "upload",
      createdAt: new Date().toISOString(), columns: stage.cols,
      mappings: stage.maps.map((m) => ({ ...m, field: ((overrides[m.column] ?? m.field ?? null) as FieldMapping["field"]) })),
      col2field, txns: txns.slice(0, 20000), report, alerts, rules, tier: r.tier,
    };
    const all = [ds, ...loadAll()];
    saveAll(all); setSelected(ds.id); emit(); refresh(); setStage(null);
    saveRemote({ name: ds.name, source: "upload", rowCount: txns.length, columns: ds.columns.slice(0, 50), mapping: col2field, quality: { warnings: report.warnings, records: report.records }, summary: { tier: r.tier, alerts: alerts.length } }).catch(() => {});
    nav(`/datasets/${ds.id}`);
  }

  function loadDemo() {
    const { txns, manifest } = generate({ name: "Demo — retail + planted cases", count: 1500, accounts: 80, mode: "mixed", days: 60, seed: 7, splitting: 2, passthrough: 1, circular: 1 });
    const { report } = normalize(
      { columns: ["transaction_id", "sender"], rows: [], delimiter: ",", encodingNote: "" },
      { txn_id: null, sender: null, receiver: null, amount: null, currency: null, timestamp: null, origin_country: null, dest_country: null, channel: null, purpose: null, status: null, ignore: null },
    );
    void report;
    const full = (() => {
      const cols = Object.keys(txns[0].raw);
      const t = { columns: cols, rows: txns.map((x) => x.raw as Record<string, string>), delimiter: ",", encodingNote: "" };
      const m = inferMapping(t);
      const c2f: Record<string, string> = {};
      m.forEach((x) => { c2f[x.column] = x.field ?? ""; });
      return { t, map: buildMapping(c2f as never), c2f, m };
    })();
    const norm = normalize(full.t, full.map);
    const alerts = runDetection(norm.txns, DEFAULT_RULES.map((x) => ({ ...x })));
    const ds: Dataset = {
      id: `ds-${Date.now().toString(36)}`, name: "Demo dataset (synthetic)", source: "demo",
      createdAt: new Date().toISOString(), columns: full.t.columns, mappings: full.m,
      col2field: full.c2f, txns: norm.txns, report: norm.report, alerts,
      rules: DEFAULT_RULES.map((x) => ({ ...x })), manifest, tier: 1,
    };
    saveAll([ds, ...loadAll()]); setSelected(ds.id); emit(); refresh(); nav(`/datasets/${ds.id}`);
  }

  function del(id: string) {
    if (!confirm("Delete this dataset and its analysis?")) return;
    saveAll(loadAll().filter((d) => d.id !== id)); emit(); refresh();
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          className={`p-6 text-center transition ${drag ? "border-neutral-900 bg-neutral-100" : ""}`}
          >
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
          >
            <FileUp className="mx-auto h-6 w-6" strokeWidth={1.5} />
            <p className="mt-2 text-sm font-semibold">Drop a transaction CSV</p>
            <p className="mx-auto mt-1 max-w-[240px] text-xs leading-5 text-neutral-500">Unfamiliar columns welcome. Max 25 MB / 20k rows in v1. Never leaves your browser except library metadata.</p>
            <div className="mt-4 flex justify-center gap-2">
              <button onClick={() => fileRef.current?.click()} className="rounded-md bg-neutral-900 px-4 py-2 text-[13px] text-white">Choose file</button>
              <button onClick={loadDemo} className="rounded-md border border-neutral-300 px-4 py-2 text-[13px]">Load demo</button>
            </div>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
          </div>
        </Card>
        <Card className="p-5 lg:col-span-2">
          <p className="text-[13px] font-semibold">How mapping works</p>
          <ol className="mt-2 space-y-1.5 text-[13px] leading-6 text-neutral-600">
            <li>1. We inspect names, types, and sample values → confidence score per field.</li>
            <li>2. Ambiguous sender/beneficiary (&lt;0.60) must be confirmed by you.</li>
            <li>3. Tier 1 needs sender + receiver + amount + timestamp; otherwise only supported analyses run.</li>
            <li>4. Original CSV is preserved; analysis uses a normalized copy.</li>
          </ol>
          <p className="mt-3 flex items-start gap-1.5 text-xs text-neutral-500"><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Private data stays local. AI mapping uses column metadata + samples only — never ships full files.</p>
        </Card>
      </div>

      {stage && (
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4" />
            <p className="text-sm font-semibold">Confirm mapping — {stage.name} ({stage.rows.length} rows)</p>
          </div>
          <div className="mt-3 overflow-auto">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <thead><tr className="border-b border-neutral-200 text-[11px] uppercase tracking-wider text-neutral-400">
                <th className="py-2 pr-3">Column</th><th className="py-2 pr-3">Suggested</th><th className="py-2 pr-3">Conf.</th><th className="py-2 pr-3">Type</th><th className="py-2 pr-3">Missing</th><th className="py-2 pr-3">Samples</th><th className="py-2">Override</th>
              </tr></thead>
              <tbody>
                {stage.maps.map((m) => (
                  <tr key={m.column} className="border-b border-neutral-100">
                    <td className="py-2 pr-3 font-mono text-xs">{m.column}</td>
                    <td className="py-2 pr-3">{overrides[m.column] ?? m.field ?? <span className="text-neutral-400">—</span>}</td>
                    <td className="py-2 pr-3 tabular-nums">
                      <span className={`rounded px-1.5 py-0.5 text-xs ${m.confidence >= 0.8 ? "bg-neutral-900 text-white" : m.confidence >= 0.5 ? "bg-neutral-200" : "bg-amber-100 text-amber-800"}`}>{m.confidence.toFixed(2)}</span>
                    </td>
                    <td className="py-2 pr-3 text-neutral-500">{m.dtype}</td>
                    <td className="py-2 pr-3 tabular-nums">{(m.missingPct * 100).toFixed(0)}%</td>
                    <td className="max-w-[220px] truncate py-2 pr-3 font-mono text-xs text-neutral-500">{m.samples.join(" · ")}</td>
                    <td className="py-2">
                      <select value={overrides[m.column] ?? m.field ?? ""} onChange={(e) => setOverrides({ ...overrides, [m.column]: e.target.value })} className="rounded border border-neutral-200 px-1.5 py-1 text-xs">
                        {FIELD_OPTS.map((f) => <option key={f} value={f}>{f || "—"}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={confirmMapping} className="inline-flex items-center gap-1.5 rounded-md bg-neutral-900 px-4 py-2 text-[13px] text-white"><CheckCircle2 className="h-4 w-4" /> Confirm & analyse</button>
            <button onClick={() => setStage(null)} className="rounded-md border border-neutral-300 px-4 py-2 text-[13px]">Cancel</button>
          </div>
        </Card>
      )}

      <Card className="p-0">
        <p className="px-5 pt-4 text-[13px] font-semibold">Library ({list.length})</p>
        <div className="mt-2 divide-y divide-neutral-100">
          {list.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <Link to={`/datasets/${d.id}`} className="truncate text-sm font-medium hover:underline">{d.name}</Link>
                <p className="text-xs text-neutral-500">{d.txns.length.toLocaleString("en-IN")} records · {d.alerts.length} alerts · Tier {d.tier} · {d.source} · {new Date(d.createdAt).toLocaleDateString()}</p>
              </div>
              <Link to={`/datasets/${d.id}`} className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs">Open</Link>
              <button onClick={() => del(d.id)} className="rounded-md border border-neutral-200 p-1.5 text-neutral-400 hover:text-neutral-900"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          {list.length === 0 && <p className="px-5 py-8 text-center text-[13px] text-neutral-400">Empty. Upload a CSV or load the demo.</p>}
        </div>
      </Card>
    </div>
  );
}
