import { Card, emit } from "@/components/app/Shell";
import { inferMapping, normalize, buildMapping } from "@/lib/trace/csv";
import { DEFAULT_RULES, runDetection } from "@/lib/trace/detect";
import { generate, specFromPrompt, type GenSpec } from "@/lib/trace/synthetic";
import { download, loadAll, saveAll, setSelected, type Dataset } from "@/lib/trace/store";
import { Download, Play, Sparkles } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";

export default function Studio() {
  const nav = useNavigate();
  const [spec, setSpec] = useState<GenSpec>({ name: "Retail domestic + cases", count: 2000, accounts: 100, mode: "mixed", days: 90, seed: 42, splitting: 2, passthrough: 1, circular: 1 });
  const [prompt, setPrompt] = useState("Generate 5000 transactions, domestic Indian transfers with some international payments, 3 splitting scenarios, 2 intermediary networks, 1 circular flow.");
  const [preview, setPreview] = useState<ReturnType<typeof generate> | null>(null);

  const set = (k: keyof GenSpec, v: number | string) => setSpec({ ...spec, [k]: v });

  function doGenerate() {
    const g = generate(spec);
    setPreview(g);
  }
  function applyPrompt() {
    const s = specFromPrompt(prompt);
    s.name = spec.name;
    setSpec(s);
    setPreview(generate(s));
  }
  function save() {
    if (!preview) return;
    const cols = Object.keys(preview.txns[0].raw);
    const t = { columns: cols, rows: preview.txns.map((x) => x.raw as Record<string, string>), delimiter: ",", encodingNote: "" };
    const m = inferMapping(t);
    const c2f: Record<string, string> = {};
    m.forEach((x) => { c2f[x.column] = x.field ?? ""; });
    const norm = normalize(t, buildMapping(c2f as never));
    const alerts = runDetection(norm.txns, DEFAULT_RULES.map((x) => ({ ...x })));
    const ds: Dataset = {
      id: `ds-${Date.now().toString(36)}`, name: spec.name, source: "synthetic",
      createdAt: new Date().toISOString(), columns: cols, mappings: m, col2field: c2f,
      txns: norm.txns, report: norm.report, alerts, rules: DEFAULT_RULES.map((x) => ({ ...x })),
      manifest: preview.manifest, tier: 1,
    };
    saveAll([ds, ...loadAll()]); setSelected(ds.id); emit();
    nav(`/datasets/${ds.id}`);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <p className="text-[13px] font-semibold">Deterministic controls</p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-[13px]">
            <label className="col-span-2">Name<input value={spec.name} onChange={(e) => set("name", e.target.value)} className="mt-1 w-full rounded border border-neutral-200 px-2 py-1.5" /></label>
            <label>Transactions<input type="number" value={spec.count} min={100} max={20000} onChange={(e) => set("count", +e.target.value)} className="mt-1 w-full rounded border border-neutral-200 px-2 py-1.5" /></label>
            <label>Accounts<input type="number" value={spec.accounts} min={10} max={1000} onChange={(e) => set("accounts", +e.target.value)} className="mt-1 w-full rounded border border-neutral-200 px-2 py-1.5" /></label>
            <label>Mode<select value={spec.mode} onChange={(e) => set("mode", e.target.value)} className="mt-1 w-full rounded border border-neutral-200 px-2 py-1.5"><option value="domestic">domestic</option><option value="international">international</option><option value="mixed">mixed</option></select></label>
            <label>Days<input type="number" value={spec.days} min={7} max={365} onChange={(e) => set("days", +e.target.value)} className="mt-1 w-full rounded border border-neutral-200 px-2 py-1.5" /></label>
            <label>Seed<input type="number" value={spec.seed} onChange={(e) => set("seed", +e.target.value)} className="mt-1 w-full rounded border border-neutral-200 px-2 py-1.5" /></label>
            <label>Splitting scenarios<input type="number" value={spec.splitting} min={0} max={10} onChange={(e) => set("splitting", +e.target.value)} className="mt-1 w-full rounded border border-neutral-200 px-2 py-1.5" /></label>
            <label>Pass-through<input type="number" value={spec.passthrough} min={0} max={10} onChange={(e) => set("passthrough", +e.target.value)} className="mt-1 w-full rounded border border-neutral-200 px-2 py-1.5" /></label>
            <label>Circular<input type="number" value={spec.circular} min={0} max={10} onChange={(e) => set("circular", +e.target.value)} className="mt-1 w-full rounded border border-neutral-200 px-2 py-1.5" /></label>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={doGenerate} className="inline-flex items-center gap-1.5 rounded-md bg-neutral-900 px-4 py-2 text-[13px] text-white"><Play className="h-3.5 w-3.5" /> Generate</button>
            {preview && <button onClick={save} className="rounded-md border border-neutral-300 px-4 py-2 text-[13px]">Save to workspace & run detection</button>}
          </div>
          <p className="mt-3 text-xs leading-5 text-neutral-500">All records labelled synthetic. Ground truth is stored in the manifest only — never used as a detection feature.</p>
        </Card>
        <Card className="p-5">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold"><Sparkles className="h-4 w-4" /> Plain-English scenario → validated spec</p>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={5} className="mt-3 w-full rounded border border-neutral-200 p-2.5 text-[13px] leading-6" />
          <button onClick={applyPrompt} className="mt-3 rounded-md border border-neutral-300 px-4 py-2 text-[13px]">Convert to spec & generate</button>
          <p className="mt-3 text-xs leading-5 text-neutral-500">Template parser in v1 (works offline). An LLM key can replace the parser later; generation always stays deterministic code, never raw LLM CSV.</p>
          {preview && (
            <div className="mt-3 flex gap-2">
              <button onClick={() => download(`${spec.name}.csv`, preview.csv)} className="inline-flex items-center gap-1 rounded border border-neutral-200 px-3 py-1.5 text-xs"><Download className="h-3 w-3" /> CSV</button>
              <button onClick={() => download(`${spec.name}-manifest.json`, JSON.stringify(preview.manifest, null, 2), "application/json")} className="inline-flex items-center gap-1 rounded border border-neutral-200 px-3 py-1.5 text-xs"><Download className="h-3 w-3" /> Manifest</button>
            </div>
          )}
        </Card>
      </div>
      {preview && (
        <Card className="p-5">
          <p className="text-[13px] font-semibold">Preview — {preview.txns.length} transfers, {preview.manifest.scenarios.length} planted scenarios</p>
          <div className="mt-2 space-y-1.5 text-[13px]">
            {preview.manifest.scenarios.map((s, i) => <p key={i} className="text-neutral-600"><span className="font-medium text-neutral-900">{s.kind}:</span> {s.description}</p>)}
          </div>
        </Card>
      )}
    </div>
  );
}
