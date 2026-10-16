import { loadAll, saveAll, setSelected } from "@/lib/trace/store";
import { buildMapping, inferMapping, normalize } from "@/lib/trace/csv";
import { DEFAULT_RULES, runDetection } from "@/lib/trace/detect";
import { generateBalanced } from "@/lib/trace/synthetic";
import { TriangleAlert } from "lucide-react";
import React, { useEffect, useState, type ReactNode } from "react";

/** Re-render the caller whenever the workspace (datasets/selection) changes. */
export function useTick() {
  const [t, setT] = useState(0);
  useEffect(() => {
    const f = () => setT((x) => x + 1);
    window.addEventListener("trace:update", f);
    return () => window.removeEventListener("trace:update", f);
  }, []);
  return t;
}

/** Catches a crashing chart and shows a designed error state with retry. */
export class ChartBoundary extends React.Component<{ children: ReactNode; label?: string }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(e: Error) {
    return { err: e.message || "render failed" };
  }
  render() {
    if (this.state.err) {
      return (
        <div className="flex min-h-[140px] flex-col items-center justify-center gap-2 p-6 text-center">
          <p className="text-sm font-semibold text-foreground">{this.props.label ?? "Chart"} could not render</p>
          <p className="mono max-w-md break-words text-[11px] text-muted-foreground">{this.state.err}</p>
          <button onClick={() => this.setState({ err: null })} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">
            Retry chart
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Honest banner: findings are review signals, not model-confirmed verdicts. */
export function ModelNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-[color:var(--primary)]/35 bg-[color:var(--primary)]/8 px-3.5 py-2.5 text-[13px] leading-6">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--primary)]" />
      <p className="text-foreground">
        <span className="font-semibold">Review signals — not model-confirmed findings.</span>{" "}
        <span className="text-muted-foreground">
          {compact
            ? "Nothing here is confirmed as financial crime by any machine-learning model."
            : "Patterns below are ranked by deterministic rules and an unsupervised anomaly model trained on this dataset. No model in Aegis confirms financial crime — every alert needs human review."}
        </span>
      </p>
    </div>
  );
}

/**
 * Seed a labelled synthetic workspace on first launch so every chart,
 * graph, and table has real data before the user uploads anything.
 * Returns the seeded dataset, or null when a library already exists.
 */
export function seedDemoWorkspace() {
  if (loadAll().length > 0) return null;
  try {
    const out = generateBalanced();
    const cols = Object.keys(out.txns[0].raw);
    const table = { columns: cols, rows: out.txns.map((x) => x.raw as Record<string, string>), delimiter: ",", encodingNote: "" };
    const maps = inferMapping(table);
    const c2f: Record<string, string> = {};
    maps.forEach((m) => {
      c2f[m.column] = m.field ?? "";
    });
    const norm = normalize(table, buildMapping(c2f as never));
    const alerts = runDetection(norm.txns, DEFAULT_RULES.map((x) => ({ ...x })));
    const ds = {
      id: "ds-seeded-demo",
      name: "Seeded demo — risk-graded (clean + low + planted cases)",
      source: "demo" as const,
      createdAt: new Date().toISOString(),
      columns: cols,
      mappings: maps,
      col2field: c2f,
      txns: norm.txns,
      report: norm.report,
      alerts,
      rules: DEFAULT_RULES.map((x) => ({ ...x })),
      manifest: out.manifest,
      tier: 1 as const,
    };
    saveAll([ds]);
    setSelected(ds.id);
    window.dispatchEvent(new Event("trace:update"));
    return ds;
  } catch {
    return null;
  }
}
