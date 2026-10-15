// Workspace store: datasets + analysis in localStorage (fast v1), mirrored to Convex library.
import type { NormalizedTxn, QualityReport, FieldMapping } from "./csv";
import type { Alert, RuleConfig } from "./detect";
import type { ScenarioManifest } from "./synthetic";

export interface Dataset {
  id: string;
  name: string;
  source: "upload" | "synthetic" | "demo";
  createdAt: string;
  columns: string[];
  mappings: FieldMapping[];
  col2field: Record<string, string>;
  txns: NormalizedTxn[];
  report: QualityReport;
  alerts: Alert[];
  rules: RuleConfig[];
  manifest?: ScenarioManifest | null;
  tier: 1 | 2 | 3 | 4;
}

const KEY = "trace.v1.datasets";
const SEL = "trace.v1.selected";

export function loadAll(): Dataset[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}
export function saveAll(d: Dataset[]) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* quota — keep memory only */ }
}
export function getSelected(): string | null { return localStorage.getItem(SEL); }
export function setSelected(id: string) { localStorage.setItem(SEL, id); }

export function download(name: string, content: string, type = "text/csv") {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function fmt(n: number, cur = "") {
  const s = n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return cur ? `${s} ${cur}` : s;
}
