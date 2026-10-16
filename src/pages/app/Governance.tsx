import { Card, Empty, Kpi, PanelTitle, SevBadge, ScoreBar, btnPrimary, num, shortId } from "@/components/app/Shell";
import { toCSV } from "@/lib/trace/csv";
import { evaluate, type EvalResult } from "@/lib/trace/detect";
import { download, getSelected, loadAll, type Dataset } from "@/lib/trace/store";
import { ClipboardList, Download, FileText, Gauge, ShieldAlert, Table2 } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";

// Operator surface: reports and workspace pointers only. Detection rules and
// model/evaluation views are backend concerns and are not shown to operator
// roles (bank / government reviewers).

type IconT = typeof Download;

function reportCards(ds: Dataset, evalNow: () => EvalResult | null): { label: string; desc: string; fmt: string; icon: IconT; fn: () => void; primary?: boolean; disabled?: boolean }[] {
  const stamp = new Date().toISOString();
  return [
    {
      label: "Full analyst report",
      desc: "One Markdown file: dataset metadata, quality profile, severity + per-rule summary, model evaluation, the 25 highest-priority alerts with full evidence, and the limitations section.",
      fmt: ".md",
      icon: ClipboardList,
      primary: true,
      fn: () => download(ds.name + "-full-report.md", fullMarkdown(ds, evalNow()), "text/markdown"),
    },
    {
      label: "Data-quality profile",
      desc: "Plain-text profile: record count, profiler warnings, coverage period and rule-set version at generation time.",
      fmt: ".txt",
      icon: FileText,
      fn: () => download(ds.name + "-quality.txt", [
        "Aegis data-quality report",
        "Dataset: " + ds.name,
        "Records: " + ds.report.records,
        "Warnings:",
        ...(ds.report.warnings.length ? ds.report.warnings.map((w) => "- " + w) : ["- none"]),
        "Period: " + ds.report.minDate + " to " + ds.report.maxDate,
        "Rules: v1",
        "Generated: " + stamp,
      ].join("\n")),
    },
    {
      label: "Detection summary",
      desc: "CSV inventory of every alert: rule, category, severity, review-priority score and the exact transfer ids behind it.",
      fmt: ".csv",
      icon: Table2,
      fn: () => download(ds.name + "-alerts.csv", toCSV(ds.alerts.map((a) => ({ id: a.id, rule: a.ruleId, category: a.category, severity: a.severity, score: Math.round(a.score), txns: a.txnIds.join(";") })))),
    },
    {
      label: "Alert evidence",
      desc: "Per-alert evidence text: explanation, every labelled evidence item, and the transfer ids — the pack you attach to a case file.",
      fmt: ".txt",
      icon: ShieldAlert,
      fn: () => download(ds.name + "-evidence.txt", ds.alerts.map((a) =>
        "## " + a.id + " " + a.title + "\n" + a.explanation + "\nEvidence: " + a.evidence.map((e) => e.label + "=" + e.value).join("; ") + "\nTxns: " + a.txnIds.join(", ") + "\n"
      ).join("\n") || "no alerts"),
    },
    {
      label: "Model evaluation",
      desc: "Precision / recall / F1 against the dataset's ground-truth manifest, with transaction-level counts and the interpretation note.",
      fmt: ".txt",
      icon: Gauge,
      disabled: !ds.manifest,
      fn: () => {
        const e = evalNow();
        download(ds.name + "-evaluation.txt", e
          ? "precision " + e.precision.toFixed(3) + "\nrecall " + e.recall.toFixed(3) + "\nF1 " + e.f1.toFixed(3) + "\ntp " + e.tp + " fp " + e.fp + " fn " + e.fn + "\n" + e.note
          : "not evaluated");
      },
    },
  ];
}

/** Stack of severity counts as one proportion bar + legend. */
function MixBar({ counts }: { counts: Record<string, number> }) {
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const seg: [string, string][] = [["critical", "#fb7185"], ["high", "#fbbf24"], ["medium", "#8b5cf6"], ["low", "#a8a3c7"]];
  if (!total) return <p className="py-6 text-center text-[13px] text-muted-foreground">No alerts in this dataset — nothing to distribute.</p>;
  return (
    <div>
      <div className="flex h-3.5 overflow-hidden rounded-full bg-muted">
        {seg.map(([k, c]) => (counts[k] ? <span key={k} title={`${k}: ${counts[k]}`} style={{ width: `${(counts[k] / total) * 100}%`, background: c }} className="transition-all duration-500" /> : null))}
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        {seg.map(([k, c]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: c }} />
            <span className="capitalize text-muted-foreground">{k}</span>
            <span className="tnum ml-auto font-semibold">{counts[k] ?? 0}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Gauge row: label → 0..1 value as a lit progress track. */
function GaugeRow({ label, v }: { label: string; v: number }) {
  const pct = Math.round(v * 100);
  const color = v >= 0.7 ? "var(--success)" : v >= 0.4 ? "var(--warning)" : "var(--destructive)";
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="capitalize text-muted-foreground">{label}</span>
        <span className="tnum font-bold" style={{ color }}>{pct}%</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

/** Single Markdown report: metadata → quality → summary → evaluation → evidence → limits. */
function fullMarkdown(ds: Dataset, e: EvalResult | null): string {
  const stamp = new Date().toISOString();
  const sev: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  ds.alerts.forEach((a) => { sev[a.severity] = (sev[a.severity] ?? 0) + 1; });
  const rules = new Map<string, number>();
  ds.alerts.forEach((a) => rules.set(a.ruleId, (rules.get(a.ruleId) ?? 0) + 1));
  const top = [...ds.alerts].sort((a, b) => b.score - a.score).slice(0, 25);
  const L: string[] = [];
  L.push(`# Aegis analysis report — ${ds.name}`, "");
  L.push(`- **Dataset:** ${ds.name} (source: ${ds.source}, tier ${ds.tier})`);
  L.push(`- **Records analysed:** ${num(ds.txns.length)}`);
  L.push(`- **Period:** ${ds.report.minDate?.slice(0, 10) ?? "—"} → ${ds.report.maxDate?.slice(0, 10) ?? "—"}`);
  L.push(`- **Currencies:** ${ds.report.currencies.map((c) => `${c.code} (${num(c.n)})`).join(", ") || "—"}`);
  L.push(`- **Channels:** ${ds.report.channels.map((c) => `${c.name} (${num(c.n)})`).join(", ") || "—"}`);
  L.push(`- **Generated:** ${stamp}`, "");
  L.push("## Data quality", "");
  if (ds.report.warnings.length) ds.report.warnings.forEach((w) => L.push(`- ⚠ ${w}`));
  else L.push("- No warnings raised by the profiler.");
  L.push("", "## Detection summary", "");
  L.push(`Total alerts: **${ds.alerts.length}** — critical ${sev.critical}, high ${sev.high}, medium ${sev.medium}, low ${sev.low}.`);
  L.push("", "| Rule | Category | Alerts |", "| --- | --- | --- |");
  [...rules.entries()].sort((a, b) => b[1] - a[1]).forEach(([r, n]) => {
    const cat = ds.alerts.find((a) => a.ruleId === r)?.category ?? "";
    L.push(`| ${r} | ${cat} | ${n} |`);
  });
  L.push("", "## Model evaluation", "");
  if (e) {
    L.push(`- Precision ${e.precision.toFixed(3)} · Recall ${e.recall.toFixed(3)} · F1 ${e.f1.toFixed(3)}`);
    L.push(`- Transaction-level: ${e.tp} true positives, ${e.fp} false positives, ${e.fn} false negatives`);
    L.push(`- Scenario recall: ${e.scenarioRecall.map((s) => `${s.scenario} ${s.found ? "✓" : "✗"}`).join(", ")}`);
    L.push(`- Note: ${e.note}`);
  } else L.push("Not evaluated — this dataset carries no ground-truth manifest (uploads have no planted truth).");
  L.push("", "## Highest-priority alerts (top 25)", "");
  top.forEach((a) => {
    L.push(`### ${a.id} — ${a.title}`);
    L.push(`- Severity **${a.severity}** · review-priority ${Math.round(a.score)}/100 · rule \`${a.ruleId}\` (${a.category})`);
    L.push(`- ${a.explanation}`);
    L.push(`- Evidence: ${a.evidence.map((ev) => `${ev.label}=${ev.value}`).join("; ")}`);
    L.push(`- Transfers: ${a.txnIds.join(", ")}`, "");
  });
  L.push("## Scope, policy and limitations", "");
  L.push("- Alerts are **review signals, not confirmed financial crime** — every alert needs human review.");
  L.push("- Currency values are never cross-summed; per-currency figures carry their code.");
  L.push("- The anomaly model is unsupervised and freshly trained per run; scores rank unusualness, not probability of wrongdoing.");
  L.push("- No external country-risk, sanctions or ownership data is wired into these findings.");
  L.push("", `Generated by Aegis on ${stamp}. Rule set: ${ds.rules.filter((r) => r.enabled).map((r) => r.id).join(", ")}.`);
  return L.join("\n");
}

export default function Governance({ view }: { view: string }) {
  const ds = useMemo(() => { const a = loadAll(); return a.find((d) => d.id === getSelected()) ?? a[0]; }, []);
  if (!ds) return <Card><Empty title="No dataset selected" body="Upload or generate a dataset first — reports are always generated from the active dataset." /></Card>;

  function evalNow() {
    if (!ds!.manifest) return null;
    const hit = new Set<string>();
    ds!.alerts.forEach((a) => a.txnIds.forEach((t) => hit.add(t)));
    return evaluate(hit, ds!.manifest.groundTruth);
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

      {show === "reports" && <ReportStudio ds={ds} ev={evalNow()} />}

      {(show === "settings") && (
        <Card className="p-4 text-[13px]">
          <p>Workspace settings live at <Link to="/settings" className="text-[color:var(--primary)] hover:underline">/settings</Link> — provider configuration, retention, notifications.</p>
        </Card>
      )}
    </div>
  );
}

/** The full reports view: overview → KPIs → severity & rules → evaluation → inventory → exports. */
function ReportStudio({ ds, ev }: { ds: Dataset; ev: EvalResult | null }) {
  const sev: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  ds.alerts.forEach((a) => { sev[a.severity] = (sev[a.severity] ?? 0) + 1; });
  const ruleCounts = useMemo(() => {
    const m = new Map<string, { n: number; cat: string }>();
    ds.alerts.forEach((a) => m.set(a.ruleId, { n: (m.get(a.ruleId)?.n ?? 0) + 1, cat: a.category }));
    return [...m.entries()].map(([id, x]) => ({ id, ...x })).sort((a, b) => b.n - a.n).slice(0, 7);
  }, [ds.alerts]);
  const topAlerts = useMemo(() => [...ds.alerts].sort((a, b) => b.score - a.score).slice(0, 10), [ds.alerts]);
  const cards = reportCards(ds, () => ev);
  const risky = sev.critical + sev.high;
  const maxRule = Math.max(...ruleCounts.map((r) => r.n), 1);

  return (
    <div className="space-y-3">
      {/* overview identity */}
      <Card>
        <PanelTitle
          title="Report studio"
          sub="Every export is generated on click from the active dataset below — nothing is pre-rendered, and each file carries dataset, period, rule versions, currency policy, limitations and a generation timestamp."
          right={<button onClick={() => download(ds.name + "-full-report.md", fullMarkdown(ds, ev), "text/markdown")} className={`${btnPrimary} shrink-0`}><Download className="mr-1 inline h-3.5 w-3.5" /> Full report (.md)</button>}
        />
        <div className="flex flex-wrap gap-1.5 px-5 pb-4 pt-3 text-xs">
          {([
            [ds.name, "dataset"],
            [ds.source, "source"],
            [`tier ${ds.tier}`, "readiness"],
            [`${ds.report.minDate?.slice(0, 10) ?? "—"} → ${ds.report.maxDate?.slice(0, 10) ?? "—"}`, "period"],
            [num(ds.txns.length), "records"],
            [ds.report.currencies.map((c) => c.code).join(" · ") || "—", "currencies"],
            [new Date(ds.createdAt).toLocaleDateString(), "created"],
          ] as [string, string][]).map(([v, k]) => (
            <span key={k} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-[color:var(--glass)] px-2.5 py-1 backdrop-blur-md" title={k}>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</span>
              <span className="tnum font-semibold">{v}</span>
            </span>
          ))}
          <Link to={`/datasets/${ds.id}`} className="ml-auto self-center text-xs text-[color:var(--primary)] hover:underline">Open dataset detail →</Link>
        </div>
      </Card>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        <div className="rise rise-1"><Kpi label="Alerts in report" value={num(ds.alerts.length)} sub="review signals, not verdicts" /></div>
        <div className="rise rise-2"><Kpi label="Critical + high" value={num(risky)} sub={`${ds.alerts.length ? Math.round((risky / ds.alerts.length) * 100) : 0}% of all alerts`} accent="var(--destructive)" /></div>
        <div className="rise rise-3"><Kpi label="Most active rule" value={ruleCounts[0] ? ruleCounts[0].id : "—"} sub={ruleCounts[0] ? `${ruleCounts[0].n} alerts · ${ruleCounts[0].cat}` : "no alerts yet"} accent="var(--warning)" /></div>
        <div className="rise rise-4"><Kpi label="Quality warnings" value={num(ds.report.warnings.length)} sub={ds.report.warnings.length ? "see data-quality export" : "profiler found nothing"} accent="var(--teal)" /></div>
        <div className="rise rise-5"><Kpi label="Evaluation F1" value={ev ? ev.f1.toFixed(2) : "—"} sub={ev ? `precision ${ev.precision.toFixed(2)} · recall ${ev.recall.toFixed(2)}` : "no ground truth on uploads"} accent="var(--teal)" /></div>
        <div className="rise rise-6"><Kpi label="Records analysed" value={num(ds.txns.length)} sub={`${num(ds.alerts.flatMap((a) => a.txnIds).length)} alert-linked transfers`} /></div>
      </div>

      {/* severity mix + top rules */}
      <div className="grid gap-3 xl:grid-cols-2">
        <Card className="p-5">
          <PanelTitle title="Severity mix" sub="How the alert population splits across review priorities" />
          <div className="mt-4"><MixBar counts={sev} /></div>
          <p className="mt-3 text-[11px] leading-5 text-muted-foreground">Severity comes from the detection rules themselves (threshold proximity, volume, corridor size) — this page only aggregates it. Critical and high should be reviewed first; a large medium tier is normal for retail-scale data.</p>
        </Card>
        <Card className="p-5">
          <PanelTitle title="Rules that fired" sub="Alert count per detection rule · top 7" right={<Link to="/detections" className="text-xs text-[color:var(--primary)] hover:underline">Alert explorer →</Link>} />
          <div className="mt-4 space-y-2.5">
            {ruleCounts.map((r) => (
              <div key={r.id} className="group">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="mono font-semibold capitalize">{r.id}</span>
                  <span className="tnum text-muted-foreground">{r.n} alerts · {r.cat}</span>
                </div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-muted" title={`${Math.round((r.n / Math.max(1, ds.alerts.length)) * 100)}% of alerts`}>
                  <div className="h-full rounded-full bg-gradient-to-r from-[#8b5cf6] to-[#2dd4bf] transition-all duration-500" style={{ width: `${Math.max(2, (r.n / maxRule) * 100)}%` }} />
                </div>
              </div>
            ))}
            {ruleCounts.length === 0 && <p className="py-8 text-center text-[13px] text-muted-foreground">No rules have fired on this dataset — an empty report is still a report.</p>}
          </div>
        </Card>
      </div>

      {/* evaluation */}
      <Card className="p-5">
        <PanelTitle title="Model evaluation against ground truth" sub={ev ? "Transaction-level precision / recall / F1, plus scenario-level coverage" : "Unavailable for this dataset"} />
        {ev ? (
          <div className="mt-4 grid gap-5 lg:grid-cols-3">
            <div className="space-y-3">
              <GaugeRow label="precision" v={ev.precision} />
              <GaugeRow label="recall" v={ev.recall} />
              <GaugeRow label="f1" v={ev.f1} />
            </div>
            <div className="flex flex-wrap content-start gap-1.5">
              {([["true positives", ev.tp, "var(--success)"], ["false positives", ev.fp, "var(--warning)"], ["false negatives", ev.fn, "var(--destructive)"]] as [string, number, string][]).map(([k, v, c]) => (
                <span key={k} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-[color:var(--glass)] px-2.5 py-1 text-xs backdrop-blur-md">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
                  <span className="tnum font-bold">{v}</span> <span className="text-muted-foreground">{k}</span>
                </span>
              ))}
              <p className="mt-1 w-full text-[11px] leading-5 text-muted-foreground">{ev.note}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Scenario recall</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {ev.scenarioRecall.map((s) => (
                  <span key={s.scenario} className={`rounded-full border px-2 py-0.5 text-[11px] ${s.found ? "border-[color:var(--success)]/40 bg-[color:var(--success)]/10 text-[color:var(--success)]" : "border-[color:var(--destructive)]/40 bg-[color:var(--destructive)]/10 text-[color:var(--destructive)]"}`} title={s.found ? "at least one transfer of this scenario is covered by an alert" : "no alert covered this scenario"}>
                    {s.found ? "✓" : "✗"} {s.scenario}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-[13px] leading-6 text-muted-foreground">Evaluation compares alerts against planted ground truth, so it only exists for labelled synthetic sets. Uploads have no hidden truth to score against — generate the <Link to="/datasets" className="text-[color:var(--primary)] hover:underline">risk-graded sample</Link> to see precision, recall and per-scenario coverage here.</p>
        )}
      </Card>

      {/* alert inventory */}
      <Card>
        <PanelTitle title="Alert inventory preview" sub="Top 10 by review-priority — the complete list ships in the Detection summary CSV" right={<span className="text-xs text-muted-foreground">{num(ds.alerts.length)} total</span>} />
        <div className="overflow-x-auto px-4 pb-4 pt-3">
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <thead><tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
              {["Severity", "Alert", "Rule", "Priority", "Transfers"].map((h) => <th key={h} className="px-2 py-1.5 font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {topAlerts.map((a) => (
                <tr key={a.id} className="border-b border-border/40 transition-colors hover:bg-[color:var(--glass-hi)]">
                  <td className="px-2 py-2"><SevBadge sev={a.severity} /></td>
                  <td className="max-w-[340px] px-2 py-2">
                    <Link to={`/detections/${a.id}`} className="block truncate font-semibold hover:text-[color:var(--primary)] hover:underline" title={a.title}>{shortId(a.title)}</Link>
                    <p className="truncate text-[11px] text-muted-foreground" title={a.category}>{a.category}</p>
                  </td>
                  <td className="mono px-2 py-2 text-xs capitalize">{a.ruleId}</td>
                  <td className="px-2 py-2"><ScoreBar score={a.score} /></td>
                  <td className="tnum px-2 py-2 text-xs text-muted-foreground">{a.txnIds.length}</td>
                </tr>
              ))}
              {topAlerts.length === 0 && <tr><td colSpan={5} className="px-2 py-8 text-center text-[13px] text-muted-foreground">No alerts on this dataset — exports will still carry the quality profile and metadata.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {/* export centre */}
      <Card>
        <PanelTitle title="Export centre" sub="Generated on click from the figures above — attach these to cases, SARs or audits" />
        <div className="grid gap-3 px-4 pb-4 pt-3 lg:grid-cols-2 2xl:grid-cols-3">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <button key={c.label} onClick={c.fn} disabled={c.disabled}
                className={`group flex items-start gap-3 rounded-xl border p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50 ${c.primary ? "border-[color:var(--primary)]/45 bg-[color:var(--primary)]/8 hover:border-[color:var(--primary)] hover:shadow-[0_0_26px_-8px_rgba(167,139,250,0.6)]" : "border-border bg-[color:var(--glass)] hover:border-[color:var(--glass-border-hi)] hover:bg-[color:var(--glass-hi)]"}`}>
                <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${c.primary ? "border-[color:var(--primary)]/40 bg-[color:var(--primary)]/12 text-[#c4b5fd]" : "border-border bg-[color:var(--glass-hi)] text-muted-foreground group-hover:text-foreground"}`}>
                  <Icon className="h-4 w-4" strokeWidth={1.7} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{c.label}</span>
                    <span className="mono rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">{c.fmt}</span>
                    {c.disabled && <span className="text-[10px] text-muted-foreground">needs manifest</span>}
                  </span>
                  <span className="mt-1 block text-[12px] leading-5 text-muted-foreground">{c.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* provenance strip */}
      <Card className="p-4">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Every export carries</p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
          {["dataset identity", "coverage period", "rule-set version", "currency policy (no cross-summing)", "limitations section", "generation timestamp", "alert transfer ids"].map((x) => (
            <span key={x} className="rounded-full border border-border bg-[color:var(--glass)] px-2.5 py-1 text-muted-foreground">{x}</span>
          ))}
        </div>
      </Card>
    </div>
  );
}
