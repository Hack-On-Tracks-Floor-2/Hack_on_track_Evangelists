import { Card, PanelTitle, btnPrimary, emit, inputCls } from "@/components/app/Shell";
import { useState } from "react";

const K = "trace.v1.settings";
function load() {
  try { return JSON.parse(localStorage.getItem(K) ?? "{}"); } catch { return {}; }
}

export default function Settings() {
  const [s, setS] = useState({
    workspace: "Default workspace", density: "compact", email: true, highPriority: true, weekly: false,
    provider: "open.er-api.com (free, no key)", refresh: "60", retentionFx: "90", retentionDs: "local",
    ...load(),
  });
  const [saved, setSaved] = useState("");
  function save() {
    localStorage.setItem(K, JSON.stringify(s));
    emit(); setSaved(`Saved ${new Date().toLocaleTimeString()} — provider, retention, and notification preferences persist in this browser.`);
  }
  const set = (k: string, v: string | boolean) => setS({ ...s, [k]: v });

  return (
    <div className="grid max-w-4xl gap-3">
      <Card className="p-5">
        <PanelTitle title="Workspace" sub="Only supported options are shown" />
        <div className="mt-3 grid gap-2.5 md:grid-cols-2">
          <label className="text-xs text-muted-foreground">Workspace name<input value={s.workspace} onChange={(e) => set("workspace", e.target.value)} className={`${inputCls} mt-1`} /></label>
          <label className="text-xs text-muted-foreground">Table density<select value={s.density} onChange={(e) => set("density", e.target.value)} className={`${inputCls} mt-1`}><option value="compact">Compact</option><option value="comfortable">Comfortable</option></select></label>
        </div>
      </Card>
      <Card className="p-5">
        <PanelTitle title="Provider configuration" sub="Credentials stay out of browser code — this build uses keyless providers" />
        <div className="mt-3 grid gap-2.5 md:grid-cols-2">
          <label className="text-xs text-muted-foreground">Market-data provider<select value={s.provider} onChange={(e) => set("provider", e.target.value)} className={`${inputCls} mt-1`}>
            <option>open.er-api.com (free, no key)</option><option>Frankfurter / ECB reference only</option><option>Simulated feed (labelled)</option>
          </select></label>
          <label className="text-xs text-muted-foreground">Refresh target (seconds)<input value={s.refresh} onChange={(e) => set("refresh", e.target.value)} inputMode="numeric" className={`${inputCls} mt-1`} /></label>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">A refresh target does not guarantee a new quote each interval — the provider's cadence governs, and the UI labels live / delayed / cached / reference honestly.</p>
      </Card>
      <Card className="p-5">
        <PanelTitle title="Notifications" />
        {[["email", "Email me high-priority reviews"], ["highPriority", "In-app notification badge"], ["weekly", "Weekly workspace digest"]].map(([k, l]) => (
          <label key={k} className="mt-2 flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={!!s[k]} onChange={(e) => set(k, e.target.checked)} /> {l}
          </label>
        ))}
      </Card>
      <Card className="p-5">
        <PanelTitle title="Data retention" sub="Datasets live in this browser; library metadata mirrors to Convex" />
        <div className="mt-3 grid gap-2.5 md:grid-cols-2">
          <label className="text-xs text-muted-foreground">FX quote history<select value={s.retentionFx} onChange={(e) => set("retentionFx", e.target.value)} className={`${inputCls} mt-1`}><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option></select></label>
          <label className="text-xs text-muted-foreground">Dataset storage<select value={s.retentionDs} onChange={(e) => set("retentionDs", e.target.value)} className={`${inputCls} mt-1`}><option value="local">This browser (localStorage)</option><option value="memory">Memory only (cleared on close)</option></select></label>
        </div>
        <button onClick={save} className={`${btnPrimary} mt-4`}>Save settings</button>
        {saved && <p className="mt-2 text-[13px] text-[color:var(--success)]">{saved}</p>}
      </Card>
    </div>
  );
}
