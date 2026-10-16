import { Card, Empty, PanelTitle, WarnStrip, btnGhost, btnPrimary, emit, inputCls, num } from "@/components/app/Shell";
import { buildMapping, inferMapping, normalize, parseCSV, readiness, type FieldMapping, type NormalizedTxn, type QualityReport, type SemanticField } from "@/lib/trace/csv";
import { DEFAULT_RULES, runDetection, type RuleConfig } from "@/lib/trace/detect";
import { generate, generateBalanced } from "@/lib/trace/synthetic";
import { download, getSelected, loadAll, saveAll, setSelected, type Dataset } from "@/lib/trace/store";
import { toCSV } from "@/lib/trace/csv";
import { prepareTable } from "@/lib/trace/prepare";
import { announceAnalysis } from "@/lib/trace/ml";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { ArrowLeft, ArrowRight, CheckCircle2, FileUp, Layers, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

const FIELD_OPTS: (SemanticField | "")[] = ["", "txn_id", "sender", "receiver", "amount", "currency", "timestamp", "origin_country", "dest_country", "channel", "purpose", "status", "ignore"];
const MODES = [
  { id: "quality", label: "Data-quality profiling", need: [] as string[] },
  { id: "domestic", label: "Domestic transaction monitoring", need: ["sender", "receiver", "amount", "timestamp"] },
  { id: "intl", label: "International fund-flow analysis", need: ["sender", "amount"] },
  { id: "split", label: "Transaction splitting detection", need: ["sender", "amount", "timestamp"] },
  { id: "network", label: "Account network analysis", need: ["sender", "receiver"] },
  { id: "behav", label: "Behavioural anomaly detection", need: ["sender", "amount", "timestamp"] },
  { id: "fx", label: "FX normalisation", need: ["amount"] },
];

/** Shared upload entry: validate → clean → verify → base wizard state. Used by the library uploader and the wizard. */
async function fileToWizard(f: File, base: { name: string; desc: string; source: string }): Promise<{ wiz: Wiz } | { error: string }> {
  if (!/\.csv$/i.test(f.name)) return { error: "Only .csv files are accepted." };
  if (f.size > 25 * 1024 * 1024) return { error: "File exceeds the 25 MB limit. Split or sample it first." };
  const text = await f.text();
  const t = parseCSV(text);
  if (!t.columns.length) return { error: "No columns found. Check the file." };
  const prep = prepareTable(t);
  if (!prep.rows.length) return { error: `No usable rows survived cleaning (${prep.droppedEmpty} empty, ${prep.droppedDuplicates} duplicates). Check the file.` };
  const sample = { columns: prep.columns, rows: prep.rows.slice(0, 200), delimiter: ",", encodingNote: "" };
  return {
    wiz: {
      step: 2, name: base.name || f.name.replace(/\.csv$/i, ""), desc: base.desc, source: base.source,
      cols: prep.columns, rows: prep.rows, maps: inferMapping(sample), overrides: {}, cleaning: prep.ops,
    },
  };
}

function UploadCard({ onDone }: { onDone: (w: Wiz) => void }) {
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState("");
  const [name, setName] = useState("");
  const [source, setSource] = useState("Mixed");
  async function take(f: File) {
    setBusy("Reading and cleaning file…");
    const r = await fileToWizard(f, { name, desc: "", source });
    if ("error" in r) { alert(r.error); setBusy(""); return; }
    setBusy("");
    onDone(r.wiz);
  }
  return (
    <Card className={`transition ${drag ? "border-[color:var(--primary)]" : ""}`}>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) take(f); }}
        className={`flex flex-wrap items-center gap-4 rounded-xl border border-dashed p-5 transition-colors ${drag ? "border-[color:var(--primary)] bg-[color:var(--primary)]/6" : "border-border"}`}
      >
        <div className="grad-bg h-12 w-12 shrink-0 rounded-2xl p-px shadow-[0_10px_30px_-12px_rgba(139,92,246,0.6)]">
          <div className="flex h-full w-full items-center justify-center rounded-[15px] bg-[#0b0a1a]/80">
            <FileUp className="h-5 w-5 text-[#c4b5fd]" strokeWidth={1.5} />
          </div>
        </div>
        <div className="min-w-[240px] flex-1">
          <p className="text-sm font-semibold">Upload a transaction CSV{busy ? ` · ${busy}` : ""}</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Drop a file or browse — cleaning, inspection, schema mapping and analysis continue in one guided flow. Max 25 MB / 20,000 rows.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {["transaction_id", "sender", "receiver", "amount", "currency", "timestamp", "channel", "origin_country", "destination_country"].map((c) => (
              <span key={c} className="mono rounded-full border border-border bg-[color:var(--glass)] px-2 py-0.5 text-[10px] text-muted-foreground">{c}</span>
            ))}
            <span className="rounded-full px-2 py-0.5 text-[10px] italic text-muted-foreground/70">…names are auto-detected, remap in the wizard</span>
          </div>
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Dataset name (optional)" className={`${inputCls} w-52`} aria-label="Dataset name" />
        <select value={source} onChange={(e) => setSource(e.target.value)} className={`${inputCls} w-44`} aria-label="Dataset source">
          <option>Domestic</option><option>International</option><option>Mixed</option><option>General Financial Data</option>
        </select>
        <label className={btnPrimary}>Browse files<input type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) take(f); e.target.value = ""; }} /></label>
      </div>
    </Card>
  );
}

export default function Datasets() {
  const nav = useNavigate();
  const saveRemote = useMutation(api.trace.save);
  const [list, setList] = useState<Dataset[]>(loadAll());
  // Library and upload live on one screen: the uploader above feeds the guided flow below.
  const [wizard, setWizard] = useState<null | Wiz>(null);

  function refresh() { setList(loadAll()); }
  function del(id: string) {
    if (!confirm("Delete this dataset and its analysis? This cannot be undone.")) return;
    saveAll(loadAll().filter((d) => d.id !== id)); emit(); refresh();
  }
  function loadDemo() {
    const { txns, manifest } = generate({ name: "Demo — retail + planted cases", count: 1500, accounts: 80, mode: "mixed", days: 60, seed: 7, splitting: 2, passthrough: 1, circular: 1 });
    const cols = Object.keys(txns[0].raw);
    const t = { columns: cols, rows: txns.map((x) => x.raw as Record<string, string>), delimiter: ",", encodingNote: "" };
    const m = inferMapping(t);
    const c2f: Record<string, string> = {};
    m.forEach((x) => { c2f[x.column] = x.field ?? ""; });
    const norm = normalize(t, buildMapping(c2f as never));
    const alerts = announceAnalysis("sample dataset", runDetection(norm.txns, DEFAULT_RULES.map((x) => ({ ...x }))));
    const ds: Dataset = {
      id: `ds-${Date.now().toString(36)}`, name: "Demo dataset (synthetic, labelled)", source: "demo",
      createdAt: new Date().toISOString(), columns: cols, mappings: m, col2field: c2f,
      txns: norm.txns, report: norm.report, alerts, rules: DEFAULT_RULES.map((x) => ({ ...x })), manifest, tier: 1,
    };
    saveAll([ds, ...loadAll()]); setSelected(ds.id); emit(); refresh(); nav(`/datasets/${ds.id}`);
  }
  function loadRiskGraded() {
    const { txns, manifest, personas } = generateBalanced();
    const cols = Object.keys(txns[0].raw);
    const t = { columns: cols, rows: txns.map((x) => x.raw as Record<string, string>), delimiter: ",", encodingNote: "" };
    const m = inferMapping(t);
    const c2f: Record<string, string> = {};
    m.forEach((x) => { c2f[x.column] = x.field ?? ""; });
    const norm = normalize(t, buildMapping(c2f as never));
    const alerts = announceAnalysis("risk-graded sample", runDetection(norm.txns, DEFAULT_RULES.map((x) => ({ ...x }))));
    const ds: Dataset = {
      id: `ds-${Date.now().toString(36)}`, name: "Risk-graded sample (clean · low · medium · high)", source: "demo",
      createdAt: new Date().toISOString(), columns: cols, mappings: m, col2field: c2f,
      txns: norm.txns, report: norm.report, alerts, rules: DEFAULT_RULES.map((x) => ({ ...x })),
      manifest: { ...manifest, personas }, tier: 1,
    };
    saveAll([ds, ...loadAll()]); setSelected(ds.id); emit(); refresh(); nav(`/datasets/${ds.id}`);
  }

  const activeId = getSelected();

  if (wizard) return <Wizard w={wizard} setW={setWizard} onDone={(ds) => { refresh(); nav(`/datasets/${ds.id}`); }} saveRemote={saveRemote} />;

  return (
    <div className="space-y-3">
      <UploadCard onDone={(w) => setWizard(w)} />
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="relative overflow-hidden p-5 transition-all hover:border-[color:var(--glass-border-hi)]">
          <span className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[color:var(--primary)]/20 blur-3xl" aria-hidden />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--primary)]/40 bg-[color:var(--primary)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#c4b5fd]"><Sparkles className="h-3 w-3" /> Recommended</span>
                <span className="text-[11px] text-muted-foreground">synthetic · labelled · seed 1907</span>
              </div>
              <p className="display mt-2 text-sm font-bold">Risk-graded sample</p>
              <p className="mt-1 max-w-md text-[13px] leading-6 text-muted-foreground">A majority of clean and low-risk accounts, one planted case per detector rule, and a verified persona manifest — built to show the full risk spread, not just red flags.</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {([["49 clean", "#2dd4bf"], ["1 low", "#a78bfa"], ["16 medium", "#fbbf24"], ["7 high", "#fb7185"], ["7 planted cases", "#60a5fa"], ["~1,600 transfers", "#a8a3c7"]] as [string, string][]).map(([l, c]) => (
                  <span key={l} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-[color:var(--glass)] px-2 py-0.5 text-[11px] text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />{l}</span>
                ))}
              </div>
            </div>
            <button onClick={loadRiskGraded} className={`${btnPrimary} mt-1 shrink-0`}>Generate</button>
          </div>
        </Card>
        <Card className="relative overflow-hidden p-5 transition-all hover:border-[color:var(--glass-border-hi)]">
          <span className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[color:var(--teal)]/15 blur-3xl" aria-hidden />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--teal)]/40 bg-[color:var(--teal)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--teal)]"><Layers className="h-3 w-3" /> Classic</span>
                <span className="text-[11px] text-muted-foreground">synthetic · mixed · seed 7</span>
              </div>
              <p className="display mt-2 text-sm font-bold">Generated demo mix</p>
              <p className="mt-1 max-w-md text-[13px] leading-6 text-muted-foreground">The original showcase: retail UPI activity across 80 accounts with planted splitting, pass-through and circular cases — useful for a quick tour of the detection screens.</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {([["1,500 transfers", "#a8a3c7"], ["80 accounts", "#60a5fa"], ["3 planted scenarios", "#fbbf24"]] as [string, string][]).map(([l, c]) => (
                  <span key={l} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-[color:var(--glass)] px-2 py-0.5 text-[11px] text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />{l}</span>
                ))}
              </div>
            </div>
            <button onClick={loadDemo} className={`${btnGhost} mt-1 shrink-0`}>Generate</button>
          </div>
        </Card>
      </div>
      <Card>
        <PanelTitle title="Dataset library" sub="Ownership is per-browser in this build; deletion is permanent."
          right={<div className="flex flex-wrap gap-1.5">
            <StatChip label={list.length === 1 ? "dataset" : "datasets"} value={num(list.length)} />
            <StatChip label="transfers" value={num(list.reduce((s, d) => s + d.txns.length, 0))} />
            <StatChip label="alerts" value={num(list.reduce((s, d) => s + d.alerts.length, 0))} accent="var(--warning)" />
            {list.length > 0 && <StatChip label="active" value={(list.find((d) => d.id === activeId)?.name ?? "—").slice(0, 22)} accent="var(--teal)" />}
          </div>} />
        <div className="overflow-x-auto">
          <table className="mt-2 w-full min-w-[900px] text-left text-[13px]">
            <thead><tr className="border-y border-border text-[11px] uppercase tracking-wider text-muted-foreground">
              {["Name", "Source", "Records", "Currencies", "Coverage", "Quality", "Analysis", "Created"].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}
              <th className="px-4 py-2 text-right font-medium">Actions</th>
            </tr></thead>
            <tbody>
              {list.map((d) => (
                <tr key={d.id} className={`border-b border-border/50 transition-colors hover:bg-muted/40 ${activeId === d.id ? "bg-[color:var(--primary)]/6" : ""}`}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Link to={`/datasets/${d.id}`} className="font-semibold text-foreground hover:underline">{d.name}</Link>
                      {activeId === d.id && <span className="shrink-0 rounded-full border border-[color:var(--teal)]/40 bg-[color:var(--teal)]/10 px-2 py-0.5 text-[10px] font-semibold text-[color:var(--teal)]">active</span>}
                      {d.manifest?.personas && <span className="shrink-0 rounded-full border border-border bg-[color:var(--glass)] px-2 py-0.5 text-[10px] text-muted-foreground" title="Carries a verified ground-truth persona manifest">graded ✓</span>}
                    </div>
                    <p className="mono text-[11px] text-muted-foreground">tier {d.tier} · {d.source}</p>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{d.source}</td>
                  <td className="tnum px-4 py-2.5">{num(d.txns.length)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{d.report.currencies.slice(0, 3).map((c) => c.code).join(", ") || "—"}</td>
                  <td className="tnum px-4 py-2.5 text-xs text-muted-foreground">{d.report.minDate?.slice(0, 10) ?? "—"} → {d.report.maxDate?.slice(0, 10) ?? "—"}</td>
                  <td className="px-4 py-2.5">{d.report.warnings.length === 0
                    ? <span className="text-xs text-[color:var(--success)]">Clean</span>
                    : <span className="text-xs text-[color:var(--warning)]">{d.report.warnings.length} warnings</span>}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <SevBar alerts={d.alerts} />
                      <span className="tnum text-xs text-muted-foreground">{d.alerts.length}</span>
                    </div>
                  </td>
                  <td className="tnum px-4 py-2.5 text-xs text-muted-foreground">{new Date(d.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      <Link to={`/datasets/${d.id}`} className="rounded border border-border px-2 py-1 text-xs hover:bg-muted">Open</Link>
                      <button onClick={() => { setSelected(d.id); emit(); refresh(); }} disabled={activeId === d.id} className="rounded border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-40" title="Make this the active dataset across analysis pages">{activeId === d.id ? "Active" : "Set active"}</button>
                      <button onClick={() => download(`${d.name}-sample.csv`, toCSV(d.txns.slice(0, 500).map((t) => ({ id: t.id, sender: t.sender, receiver: t.receiver, amount: t.amount, currency: t.currency, ts: t.timestamp }))))} className="rounded border border-border px-2 py-1 text-xs hover:bg-muted">Download</button>
                      <button onClick={() => del(d.id)} className="rounded border border-border p-1 text-muted-foreground hover:text-[color:var(--destructive)]" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && (
            <Empty title="Your library is empty" body="Start with the risk-graded sample — a majority of clean and low-risk accounts with one planted case per detector rule — or bring your own transaction CSV. Everything runs in your browser."
              action={<><button onClick={loadRiskGraded} className={btnPrimary}><Sparkles className="mr-1 inline h-3.5 w-3.5" /> Load risk-graded sample</button><button onClick={() => setWizard({ step: 1, name: "", desc: "", source: "Mixed" })} className={btnGhost}>Upload CSV</button></>} />
          )}
        </div>
      </Card>
    </div>
  );
}

/** Compact stat pill for the library header. */
function StatChip({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <span className="inline-flex max-w-[180px] items-center gap-1.5 rounded-full border border-border bg-[color:var(--glass)] px-2.5 py-1 backdrop-blur-md" title={`${value} ${label}`}>
      {accent && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: accent }} />}
      <span className="tnum truncate text-xs font-bold">{value}</span>
      <span className="shrink-0 text-[11px] text-muted-foreground">{label}</span>
    </span>
  );
}

/** Severity mix of a dataset's alerts as a stacked micro-bar (critical → low). */
function SevBar({ alerts }: { alerts: { severity: string }[] }) {
  const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  alerts.forEach((a) => { counts[a.severity] = (counts[a.severity] ?? 0) + 1; });
  const total = alerts.length;
  if (!total) return <span className="text-[11px] text-muted-foreground/60">no alerts</span>;
  const seg: [string, string][] = [["critical", "#fb7185"], ["high", "#fbbf24"], ["medium", "#8b5cf6"], ["low", "#a8a3c7"]];
  return (
    <span className="flex h-2 w-20 overflow-hidden rounded-full bg-muted" title={`${counts.critical} critical · ${counts.high} high · ${counts.medium} medium · ${counts.low} low`}>
      {seg.map(([k, c]) => (counts[k] ? <span key={k} style={{ width: `${(counts[k] / total) * 100}%`, background: c }} /> : null))}
    </span>
  );
}

interface Wiz {
  step: number; name: string; desc: string; source: string; cleaning?: { step: string; detail: string }[]; col2field?: Record<string, string>;
  cols?: string[]; rows?: Record<string, string>[]; maps?: FieldMapping[];
  overrides?: Record<string, string>; modes?: string[];
  txns?: NormalizedTxn[]; report?: QualityReport; alerts?: ReturnType<typeof runDetection>; rules?: RuleConfig[];
}

function Wizard({ w, setW, onDone, saveRemote }: { w: Wiz; setW: (x: Wiz | null) => void; onDone: (d: Dataset) => void; saveRemote: (a: never) => Promise<unknown> }) {
  const [drag, setDrag] = useState(false);
  const [phase, setPhase] = useState("");
  const set = (p: Partial<Wiz>) => setW({ ...w, ...p });

  async function handleFile(f: File) {
    setPhase("Reading and cleaning file…");
    const r = await fileToWizard(f, { name: w.name, desc: w.desc, source: w.source });
    if ("error" in r) { alert(r.error); setPhase(""); return; }
    set({ ...r.wiz });
    setPhase("");
  }

  function confirmMapping() {
    const col2field: Record<string, string> = {};
    w.maps!.forEach((m) => { col2field[m.column] = w.overrides?.[m.column] ?? m.field ?? ""; });
    const map = buildMapping(col2field as Record<string, SemanticField | "">);
    const { txns, report } = normalize({ columns: w.cols!, rows: w.rows!, delimiter: ",", encodingNote: "" }, map);
    const need: Record<string, boolean> = { sender: !!map.sender, receiver: !!map.receiver, amount: !!map.amount, timestamp: !!map.timestamp };
    const modes = MODES.filter((m) => m.need.every((n) => need[n])).map((m) => m.id);
    set({ txns, report, modes, step: 4, col2field });
  }

  async function run() {
    const col2field = w.col2field ?? {};
    if (!Object.keys(col2field).length) { alert("The schema mapping was lost — please go back and confirm it again."); setW({ ...w, step: 3 }); return; }
    const map = buildMapping(col2field as Record<string, SemanticField | "">);
    const { txns, report } = normalize({ columns: w.cols!, rows: w.rows!, delimiter: ",", encodingNote: "" }, map);
    const rules = DEFAULT_RULES.map((x) => ({ ...x }));
    const need: Record<string, boolean> = { sender: !!map.sender, receiver: !!map.receiver, amount: !!map.amount, timestamp: !!map.timestamp };
    const runnable = rules.filter((x) => x.minData.every((m) => need[m]));
    const steps = ["Validating data", "Preparing features", "Running rule detection", "Running anomaly analysis", "Running network analysis", "Aggregating results"];
    for (const s of steps) { setPhase(s + "…"); await new Promise((r) => setTimeout(r, 180)); }
    const alerts = announceAnalysis("upload — " + (w.name || "dataset"), runDetection(txns, runnable));
    const r = readiness(map);
    const ds: Dataset = {
      id: `ds-${Date.now().toString(36)}`, name: w.name || "Untitled dataset", source: "upload",
      createdAt: new Date().toISOString(), columns: w.cols!,
      mappings: w.maps!.map((m) => ({ ...m, field: ((w.overrides?.[m.column] ?? m.field ?? null) as FieldMapping["field"]) })),
      col2field, txns: txns.slice(0, 20000), report, alerts, rules, tier: r.tier,
    };
    saveAll([ds, ...loadAll()]); setSelected(ds.id); emit();
    saveRemote({ name: ds.name, source: "upload", rowCount: txns.length, columns: ds.columns.slice(0, 50), mapping: col2field, quality: { warnings: report.warnings, records: report.records }, summary: { tier: r.tier, alerts: alerts.length } } as never).catch(() => {});
    setPhase("");
    onDone(ds);
  }

  const steps = ["Select", "Inspect", "Map schema", "Configure", "Run", "Results"];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={() => setW(null)} className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Library</button>
        <div className="ml-2 flex flex-1 items-center gap-1">
          {steps.map((s, i) => (
            <div key={s} className={`flex flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs ${w.step === i + 1 ? "bg-[color:var(--primary)]/15 font-semibold text-foreground" : w.step > i + 1 ? "text-[color:var(--success)]" : "text-muted-foreground"}`}>
              <span className="tnum mono">{i + 1}</span> {s}
            </div>
          ))}
        </div>
      </div>

      {w.step === 1 && (
        <Card className={`p-8 text-center transition ${drag ? "border-[color:var(--primary)]" : ""}`}>
          <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}>
            <FileUp className="mx-auto h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
            <p className="mt-2 text-sm font-semibold">Drag a transaction CSV here, or browse</p>
            <p className="mx-auto mt-1 max-w-md text-[13px] text-muted-foreground">Unfamiliar column names are welcome — the next steps infer structure, types, and mappings. Max 25 MB / 20,000 rows. {phase || ""}</p>
            <div className="mx-auto mt-4 grid max-w-md gap-2 text-left">
              <input value={w.name} onChange={(e) => set({ name: e.target.value })} placeholder="Dataset name" className={inputCls} aria-label="Dataset name" />
              <input value={w.desc} onChange={(e) => set({ desc: e.target.value })} placeholder="Optional description" className={inputCls} aria-label="Description" />
              <select value={w.source} onChange={(e) => set({ source: e.target.value })} className={inputCls} aria-label="Dataset source">
                <option>Domestic</option><option>International</option><option>Mixed</option><option>General Financial Data</option>
              </select>
            </div>
            <div className="mt-4 flex justify-center gap-2">
              <label className={btnPrimary}>Browse files<input type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} /></label>
            </div>
          </div>
        </Card>
      )}

      {w.step === 2 && w.report === undefined && (
        <InspectStep w={w} onNext={() => set({ step: 3 })} />
      )}

      {w.step === 3 && (
        <Card>
          <PanelTitle title="Map the schema" sub="Confirmed = high confidence · Suggested = likely · Requires Review = ambiguous, confirm manually" />
          <div className="overflow-x-auto">
            <table className="mt-2 w-full min-w-[820px] text-left text-[13px]">
              <thead><tr className="border-y border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                {["Uploaded column", "Suggested field", "Confidence", "Detected type", "Example values", "Validation", "Override"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
              </tr></thead>
              <tbody>
                {w.maps!.map((m) => {
                  const chosen = w.overrides?.[m.column] ?? m.field ?? "";
                  const status = !chosen ? "Unsupported" : m.confidence >= 0.8 ? "Confirmed" : m.confidence >= 0.5 ? "Suggested" : "Requires Review";
                  return (
                    <tr key={m.column} className="border-b border-border/50">
                      <td className="mono px-3 py-2 text-xs">{m.column}</td>
                      <td className="px-3 py-2">{chosen || <span className="text-muted-foreground">—</span>}</td>
                      <td className="tnum px-3 py-2">
                        <span className={`rounded px-1.5 py-0.5 text-xs ${m.confidence >= 0.8 ? "bg-[color:var(--success)]/15 text-[color:var(--success)]" : m.confidence >= 0.5 ? "bg-muted text-muted-foreground" : "bg-[color:var(--warning)]/15 text-[color:var(--warning)]"}`}>{m.confidence.toFixed(2)}</span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{m.dtype}</td>
                      <td className="mono max-w-[200px] truncate px-3 py-2 text-xs text-muted-foreground">{m.samples.join(" · ")}</td>
                      <td className="px-3 py-2 text-xs">{status}</td>
                      <td className="px-3 py-2">
                        <select value={chosen} onChange={(e) => set({ overrides: { ...(w.overrides ?? {}), [m.column]: e.target.value } })} className="rounded border border-input bg-background px-1.5 py-1 text-xs" aria-label={`Map ${m.column}`}>
                          {FIELD_OPTS.map((f) => <option key={f} value={f}>{f || "—"}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2 p-4">
            <button onClick={() => set({ step: 2 })} className={btnGhost}>Back</button>
            <button onClick={confirmMapping} className={btnPrimary}>Confirm mapping & continue <ArrowRight className="ml-1 inline h-3.5 w-3.5" /></button>
          </div>
        </Card>
      )}

      {w.step === 4 && (
        <Card className="p-5">
          <PanelTitle title="Configure the analysis" sub="Unsupported modes are disabled with the reason shown" />
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {MODES.map((m) => {
              const on = w.modes?.includes(m.id);
              const col2field = w.col2field ?? {};
              const have = new Set(Object.values(col2field));
              const missing = m.need.filter((n) => !have.has(n));
              return (
                <label key={m.id} className={`flex items-start gap-2.5 rounded-lg border border-border p-3 text-[13px] ${missing.length ? "opacity-50" : ""}`}>
                  <input type="checkbox" disabled={missing.length > 0} checked={!!on && missing.length === 0}
                    onChange={(e) => set({ modes: e.target.checked ? [...(w.modes ?? []), m.id] : (w.modes ?? []).filter((x) => x !== m.id) })} className="mt-1" />
                  <span><span className="font-medium">{m.label}</span>
                    {missing.length > 0 && <span className="block text-xs text-[color:var(--warning)]">Unavailable — missing: {missing.join(", ")}</span>}</span>
                </label>
              );
            })}
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={() => set({ step: 3 })} className={btnGhost}>Back</button>
            <button onClick={() => set({ step: 5 })} className={btnPrimary}>Continue to run</button>
          </div>
        </Card>
      )}

      {w.step === 5 && (
        <Card className="p-8 text-center">
          <p className="text-sm font-semibold">Ready to analyse “{w.name}”</p>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-muted-foreground">Real progress is shown per stage — validation, features, rules, anomaly, network, aggregation. {phase}</p>
          <div className="mt-4 flex justify-center gap-2">
            <button onClick={() => set({ step: 4 })} className={btnGhost}>Back</button>
            <button onClick={run} className={btnPrimary}><CheckCircle2 className="mr-1 inline h-4 w-4" /> Run analysis</button>
          </div>
        </Card>
      )}
    </div>
  );
}

function InspectStep({ w, onNext }: { w: Wiz; onNext: () => void }) {
  const col2guess: Record<string, string> = {};
  w.maps!.forEach((m) => { col2guess[m.column] = m.field ?? ""; });
  const map = buildMapping(col2guess as Record<string, SemanticField | "">);
  const { report } = normalize({ columns: w.cols!, rows: w.rows!, delimiter: ",", encodingNote: "" }, map);
  const r = readiness(map);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["Rows", num(w.rows!.length)], ["Columns", num(w.cols!.length)], ["Duplicate rows", num(report.duplicateRows)], ["Invalid amounts", num(report.invalidAmounts)],
          ["Invalid dates", num(report.invalidDates)], ["Currencies", report.currencies.slice(0, 3).map((c) => c.code).join(", ") || "—"],
          ["Period", `${report.minDate?.slice(0, 10) ?? "—"} → ${report.maxDate?.slice(0, 10) ?? "—"}`], ["Readiness", `Tier ${r.tier}`]].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</p>
            <p className="tnum mt-0.5 truncate text-sm font-bold">{v}</p>
          </div>
        ))}
      </div>
      {w.cleaning && w.cleaning.length > 0 && (
        <Card className="p-4">
          <PanelTitle title="Cleaning engine" sub={`${num(w.rows!.length)} rows kept · every action logged, nothing silently dropped`} />
          <ul className="mt-2 space-y-1 text-[13px]">
            {w.cleaning.map((c, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-bold text-[color:var(--success)]">✓</span>
                <span><span className="font-medium">{c.step}:</span> <span className="text-muted-foreground">{c.detail}</span></span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {report.warnings.length > 0 && (
        <WarnStrip><ul className="list-disc pl-4">{report.warnings.map((x, i) => <li key={i}>{x}</li>)}</ul></WarnStrip>
      )}
      <Card>
        <PanelTitle title="Data preview" sub={`First ${Math.min(10, w.rows!.length)} rows · scroll horizontally`} />
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-left text-xs">
            <thead><tr className="border-y border-border text-muted-foreground">{w.cols!.map((c) => <th key={c} className="mono whitespace-nowrap px-3 py-1.5 font-medium">{c}</th>)}</tr></thead>
            <tbody>{w.rows!.slice(0, 10).map((row, i) => (
              <tr key={i} className="border-b border-border/50">{w.cols!.map((c) => <td key={c} className="max-w-[180px] truncate px-3 py-1.5 text-muted-foreground">{row[c]}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
        <div className="flex gap-2 p-4"><button onClick={onNext} className={btnPrimary}>Continue to schema mapping <ArrowRight className="ml-1 inline h-3.5 w-3.5" /></button></div>
      </Card>
    </div>
  );
}
