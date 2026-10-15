// Step-by-step "why was this entity flagged" simulation.
//
// Evidence-driven, never invented: every step is built from the stored alert
// (rule params, evidence labels/values, transaction IDs) plus the actual
// dataset transfers those IDs resolve to. No LLM, no guessing.
import type { NormalizedTxn } from "./csv";
import { DEFAULT_RULES, type Alert } from "./detect";

export interface SimStep {
  title: string;
  detail: string;
  tone: "info" | "flag" | "warn";
}

export interface EntitySim {
  alertId: string;
  ruleId: string;
  ruleName: string;
  category: string;
  severity: string;
  score: number;
  steps: SimStep[];
  trail: NormalizedTxn[];
}

function fmtT(t: NormalizedTxn): string {
  return `${t.id} · ${t.sender} → ${t.receiver} · ${t.amount.toLocaleString("en-IN")} ${t.currency} · ${t.timestamp.slice(0, 16).replace("T", " ")}`;
}

/** Rebuild the detection walkthrough for one entity, one alert per simulation. */
export function simulateEntity(
  entityId: string,
  allTxns: NormalizedTxn[],
  alerts: Alert[],
): EntitySim[] {
  const mine = allTxns
    .filter((t) => t.sender === entityId || t.receiver === entityId)
    .sort((a, b) => a.epoch - b.epoch);
  const byId = new Map(allTxns.map((t) => [t.id, t]));
  const out: EntitySim[] = [];

  for (const a of alerts.filter((x) => x.entities.includes(entityId))) {
    const rule = DEFAULT_RULES.find((r) => r.id === a.ruleId);
    const trail = a.txnIds
      .map((id) => byId.get(id))
      .filter((t): t is NormalizedTxn => !!t)
      .sort((x, y) => x.epoch - y.epoch);

    const steps: SimStep[] = [];
    const asSender = mine.filter((t) => t.sender === entityId).length;
    const span =
      mine.length > 0
        ? ` observed ${mine[0].timestamp.slice(0, 10)} → ${mine[mine.length - 1].timestamp.slice(0, 10)}`
        : "";
    steps.push({
      title: "Scope the entity",
      detail: `${mine.length} transfers in this dataset reference the entity (${asSender} as sender, ${mine.length - asSender} as receiver)${span}. Only these transfers can implicate it — nothing outside the file.`,
      tone: "info",
    });

    steps.push({
      title: `Apply rule — ${rule?.name ?? a.ruleId}`,
      detail: rule
        ? `Category ${a.category}. Thresholds used on this run: ${Object.entries(rule.params)
            .map(([k, v]) => `${k} = ${v}`)
            .join(", ")}.`
        : `Category ${a.category}.`,
      tone: "info",
    });

    a.evidence.forEach((e) => {
      steps.push({
        title: "Observed signal",
        detail: `${e.label}: ${e.value}`,
        tone: "flag",
      });
    });

    steps.push({
      title: "Score the priority",
      detail: `Review-priority ${a.score}/100 (${a.severity}). This ranks review order — it is not a probability of wrongdoing.`,
      tone: a.severity === "high" || a.severity === "critical" ? "flag" : "info",
    });

    steps.push({
      title: "State the limits",
      detail: `${a.limitations} Plausible legitimate reading: ${a.legitimate}`,
      tone: "warn",
    });

    out.push({
      alertId: a.id,
      ruleId: a.ruleId,
      ruleName: rule?.name ?? a.ruleId,
      category: a.category,
      severity: a.severity,
      score: a.score,
      steps,
      trail,
    });
  }

  return out.sort((x, y) => y.score - x.score);
}

export function formatTrailLine(t: NormalizedTxn): string {
  return fmtT(t);
}
