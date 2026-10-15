import { Card, Empty, PanelTitle } from "@/components/app/Shell";
import { toCSV } from "@/lib/trace/csv";
import { evaluate } from "@/lib/trace/detect";
import { getSelected, loadAll, type Dataset } from "@/lib/trace/store";
import { download } from "@/lib/trace/store";
import { useMemo } from "react";
import { Link } from "react-router";

// Operator surface: reports and workspace pointers only. Detection rules and
// model/evaluation views are backend concerns and are not shown to operator
// roles (bank / government reviewers).

function reportButtons(ds: Dataset, evalNow: () => ReturnType<typeof evaluate> | null) {
  const stamp = new Date().toISOString();
  const list: { label: string; fn: () => void }[] = [
    {
      label: "Data-quality profile",
      fn: () => {
        const lines = [
          "Aegis data-quality report",
          "Dataset: " + ds.name,
          "Records: " + ds.report.records,
          "Warnings:",
          ...(ds.report.warnings.length ? ds.report.warnings.map((w) => "- " + w) : ["- none"]),
          "Period: " + ds.report.minDate + " to " + ds.report.maxDate,
          "Rules: v1",
          "Generated: " + stamp,
        ];
        download(ds.name + "-quality.txt", lines.join("\n"));
      },
    },
    {
      label: "Detection summary",
      fn: () => download(
        ds.name + "-alerts.csv",
        toCSV(ds.alerts.map((a) => ({ id: a.id, rule: a.ruleId, category: a.category, severity: a.severity, score: a.score, txns: a.txnIds.join(";") }))),
      ),
    },
    {
      label: "Alert evidence",
      fn: () => {
        const body = ds.alerts.map((a) => {
          const ev = a.evidence.map((e) => e.label + "=" + e.value).join("; ");
          return "## " + a.id + " " + a.title + "\n" + a.explanation + "\nEvidence: " + ev + "\nTxns: " + a.txnIds.join(", ") + "\n";
        }).join("\n");
        download(ds.name + "-evidence.txt", body || "no alerts");
      },
    },
    {
      label: "FX conversions",
      fn: () => {
        let log: string[] = [];
        try { log = JSON.parse(localStorage.getItem("trace.fxlog") ?? "[]"); } catch { log = []; }
        download(ds.name + "-fxlog.txt", log.join("\n") || "no conversions recorded");
      },
    },
  ];
  if (ds.manifest) {
    list.push({
      label: "Model evaluation",
      fn: () => {
        const e = evalNow();
        const body = e
          ? "precision " + e.precision.toFixed(3) + "\nrecall " + e.recall.toFixed(3) + "\nF1 " + e.f1.toFixed(3) + "\ntp " + e.tp + " fp " + e.fp + " fn " + e.fn + "\n" + e.note
          : "not evaluated";
        download(ds.name + "-evaluation.txt", body);
      },
    });
  }
  return list;
}

export default function Governance({ view }: { view: string }) {
  const ds = useMemo(() => { const a = loadAll(); return a.find((d) => d.id === getSelected()) ?? a[0]; }, []);
  if (!ds) return <Card><Empty title="No dataset selected" body="Upload or generate a dataset first." /></Card>;

  function evalNow() {
    if (!ds.manifest) return null;
    const hit = new Set<string>();
    ds.alerts.forEach((a) => a.txnIds.forEach((t) => hit.add(t)));
    return evaluate(hit, ds.manifest.groundTruth);
  }

  const tabs = [["reports", "Reports"], ["settings", "Settings"]];
  const show = view === "settings" ? "settings" : "reports";

  return (
    <div className="space-y-3">
      <div className="flex gap-1 overflow-x-auto border-b border-border text-[13px]">
        {tabs.map(([k, l]) => (
          <Link key={k} to={"/" + k} className={"whitespace-nowrap px-3 py-2 " + (show === k ? "border-b-2 border-[color:var(--primary)] font-semibold text-foreground" : "text-muted-foreground")}>{l}</Link>
        ))}
      </div>

      {(show === "reports") && (
        <Card className="p-4">
          <PanelTitle title="Export centre" sub="Every file carries dataset, period, rule versions, conversion policy, limitations, timestamp" />
          <div className="mt-3 flex flex-wrap gap-2 text-[13px]">
            {reportButtons(ds, evalNow).map((b) => <button key={b.label} onClick={b.fn} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">{b.label}</button>)}
          </div>
        </Card>
      )}

      {(show === "settings") && (
        <Card className="p-4 text-[13px]">
          <p>Workspace settings live at <Link to="/settings" className="text-[color:var(--primary)] hover:underline">/settings</Link> — provider configuration, retention, notifications.</p>
        </Card>
      )}
    </div>
  );
}
