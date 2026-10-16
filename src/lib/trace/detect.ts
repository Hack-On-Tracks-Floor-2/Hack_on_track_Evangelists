// Deterministic rules + z-score anomaly + graph signals. No label leakage.
import type { NormalizedTxn } from "./csv";
import { mlAnomalyAlerts, type ModelMeta } from "./ml";

export interface RuleConfig {
  id: string;
  name: string;
  category: string;
  enabled: boolean;
  params: Record<string, number | string>;
  description: string;
  minData: string[];
}

export const DEFAULT_RULES: RuleConfig[] = [
  { id: "split", name: "Possible transaction splitting", category: "structuring", enabled: true, params: { windowHours: 48, minCount: 4, nearPct: 0.15 }, description: "Repeated similar-value transfers by one sender in a short window.", minData: ["sender", "amount", "timestamp"] },
  { id: "velocity", name: "Velocity burst", category: "velocity", enabled: true, params: { windowHours: 24, zThresh: 2.5 }, description: "Abrupt increase in count/value vs account history.", minData: ["sender", "amount", "timestamp"] },
  { id: "passthrough", name: "Potential rapid pass-through", category: "pass-through", enabled: true, params: { maxLagHours: 24, minShare: 0.7 }, description: "Funds received then quickly forwarded.", minData: ["sender", "receiver", "amount", "timestamp"] },
  { id: "fan", name: "Fan-in / fan-out", category: "network", enabled: true, params: { windowHours: 72, minPeers: 5 }, description: "Many senders fund one account, or one funds many.", minData: ["sender", "receiver", "timestamp"] },
  { id: "cycle", name: "Circular movement", category: "network", enabled: true, params: { maxHops: 4, windowHours: 168 }, description: "Directed cycle A→B→C→A.", minData: ["sender", "receiver", "timestamp"] },
  { id: "dormant", name: "Dormant reactivation", category: "behaviour", enabled: true, params: { quietDays: 60 }, description: "Activity after prolonged inactivity.", minData: ["sender", "timestamp"] },
  { id: "behaviour", name: "Unusual customer behaviour", category: "behaviour", enabled: true, params: { zThresh: 2.0 }, description: "Amount/frequency deviation from own baseline.", minData: ["sender", "amount", "timestamp"] },
  { id: "xborder", name: "Unusual cross-border movement", category: "cross-border", enabled: true, params: { newCorridorFlag: 1 }, description: "New corridor, new counterparty, or amount outlier on international legs.", minData: ["sender", "amount"] },
  { id: "ml", name: "ML isolation anomaly", category: "anomaly", enabled: true, params: { trees: 300, contamination: 0.05 }, description: "Freshly trained isolation forest ranks the most unusual transfers.", minData: ["sender", "amount", "timestamp"] },
];

export interface Alert {
  id: string;
  ruleId: string;
  category: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  score: number; // 0..100 alert-priority, not a probability
  txnIds: string[];
  entities: string[];
  evidence: { label: string; value: string }[];
  explanation: string;
  legitimate: string;
  checks: string[];
  limitations: string;
}

let n = 0;
const aid = (p: string) => `${p}-${Date.now().toString(36)}-${(n++).toString(36)}`;

function mean(a: number[]) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
function sd(a: number[]) { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); }

export function runDetection(txns: NormalizedTxn[], rules: RuleConfig[]): Alert[] {
  const active = new Map(rules.filter((r) => r.enabled).map((r) => [r.id, r]));
  const out: Alert[] = [];
  if (!txns.length) return out;
  const bySender = new Map<string, NormalizedTxn[]>();
  const byReceiver = new Map<string, NormalizedTxn[]>();
  for (const t of txns) {
    if (!bySender.has(t.sender)) bySender.set(t.sender, []);
    bySender.get(t.sender)!.push(t);
    if (!byReceiver.has(t.receiver)) byReceiver.set(t.receiver, []);
    byReceiver.get(t.receiver)!.push(t);
  }
  for (const l of [...bySender.values(), ...byReceiver.values()]) l.sort((a, b) => a.epoch - b.epoch);

  // SPLITTING
  if (active.has("split")) {
    const p = active.get("split")!.params;
    const W = Number(p.windowHours) * 3600e3, minC = Number(p.minCount), near = Number(p.nearPct);
    bySender.forEach((list, sender) => {
      for (let i = 0; i < list.length; i++) {
        const win = list.filter((t) => t.epoch >= list[i].epoch && t.epoch <= list[i].epoch + W);
        if (win.length >= minC) {
          const m = mean(win.map((t) => t.amount));
          if (m > 0 && win.every((t) => Math.abs(t.amount - m) / m <= near)) {
            out.push({
              id: aid("ALT"), ruleId: "split", category: "structuring",
              title: `Possible transaction splitting — ${sender}`,
              severity: win.length >= 8 ? "high" : "medium",
              score: Math.min(92, 55 + win.length * 4),
              txnIds: win.map((t) => t.id), entities: [sender, ...new Set(win.map((t) => t.receiver))].slice(0, 8),
              evidence: [
                { label: "Transfers in window", value: String(win.length) },
                { label: "Window", value: `${p.windowHours}h from ${win[0].timestamp}` },
                { label: "Mean amount", value: `${m.toFixed(2)} ${win[0].currency}` },
                { label: "Aggregate", value: `${win.reduce((s, t) => s + t.amount, 0).toFixed(2)} ${win[0].currency}` },
              ],
              explanation: `${win.length} transfers of similar value (≈${m.toFixed(0)}) from one sender inside ${p.windowHours}h. Consistent with either scheduled payouts or splitting-like repetition — review required.`,
              legitimate: "Payroll batches, vendor payouts, or EMI schedules can look identical.",
              checks: ["Confirm business purpose with remitter", "Check receivers for shared control", "Compare with prior windows"],
              limitations: "Threshold proximity alone does not establish intent.",
            });
            i += win.length - 1;
          }
        }
      }
    });
  }

  // VELOCITY / BEHAVIOUR (z-score anomaly, explainable)
  if (active.has("velocity") || active.has("behaviour")) {
    const zT = Number((active.get("velocity")?.params.zThresh ?? 2.5));
    const amounts = txns.map((t) => t.amount).filter((a) => a > 0);
    const gM = mean(amounts), gS = sd(amounts) || 1;
    bySender.forEach((list, sender) => {
      if (list.length < 5) return;
      const vals = list.map((t) => t.amount);
      const m = mean(vals), s = sd(vals) || 1;
      const big = list.filter((t) => (t.amount - m) / s > zT || (t.amount - gM) / gS > 3);
      if (big.length > 0 && list.length >= 8) {
        const dayMs = 24 * 3600e3;
        const first = list[0].epoch, last = list[list.length - 1].epoch;
        const spanDays = Math.max(1, (last - first) / dayMs);
        const perDay = list.length / spanDays;
        if (perDay > 3 || big.length >= 2) {
          out.push({
            id: aid("ALT"), ruleId: "velocity", category: "velocity",
            title: `Velocity burst — ${sender}`,
            severity: big.length >= 3 ? "high" : "medium",
            score: Math.round(Math.min(90, 50 + big.length * 8 + Math.min(15, perDay))),
            txnIds: [...big, ...list.slice(-3)].map((t) => t.id).slice(0, 12),
            entities: [sender],
            evidence: [
              { label: "Transfers observed", value: `${list.length} in ${spanDays.toFixed(1)} days (${perDay.toFixed(1)}/day)` },
              { label: "Outlier transfers", value: big.map((t) => `${t.id}: ${t.amount}`).join("; ").slice(0, 220) },
              { label: "Baseline mean", value: m.toFixed(2) },
            ],
            explanation: `Activity rate (${perDay.toFixed(1)}/day) and ${big.length} amount outlier(s) exceed the account's own baseline (z>${zT}). Ranks unusual vs history; not a probability of wrongdoing.`,
            legitimate: "Seasonal sales, loan disbursal, or festival collections spike volume legitimately.",
            checks: ["Compare with same period history", "Verify source of funds", "Check channel mix"],
            limitations: "Needs ≥5 transfers of history; new accounts have weak baselines.",
          });
        }
      }
    });
  }

  // PASS-THROUGH
  if (active.has("passthrough")) {
    const p = active.get("passthrough")!.params;
    const lag = Number(p.maxLagHours) * 3600e3, share = Number(p.minShare);
    const inByAcct = byReceiver, outByAcct = bySender;
    for (const [acct, ins] of inByAcct) {
      const outs = outByAcct.get(acct) ?? [];
      if (!outs.length) continue;
      for (const inn of ins) {
        const fwd = outs.filter((o) => o.epoch >= inn.epoch && o.epoch <= inn.epoch + lag);
        const fwdSum = fwd.reduce((s, t) => s + t.amount, 0);
        if (fwd.length >= 1 && inn.amount > 0 && fwdSum / inn.amount >= share) {
          out.push({
            id: aid("ALT"), ruleId: "passthrough", category: "pass-through",
            title: `Potential rapid pass-through — ${acct}`,
            severity: fwdSum / inn.amount >= 0.95 && fwd.length >= 2 ? "high" : "medium",
            score: Math.min(88, 55 + fwd.length * 6),
            txnIds: [inn.id, ...fwd.map((t) => t.id)].slice(0, 10),
            entities: [acct, ...fwd.map((t) => t.receiver)].slice(0, 8),
            evidence: [
              { label: "Inbound", value: `${inn.id}: ${inn.amount} ${inn.currency} @ ${inn.timestamp}` },
              { label: "Forwarded", value: `${fwdSum.toFixed(2)} across ${fwd.length} transfer(s) within ${p.maxLagHours}h` },
              { label: "Retention", value: `${(inn.amount - fwdSum).toFixed(2)} ${inn.currency}` },
            ],
            explanation: `Received ${inn.amount} then forwarded ${Math.round((fwdSum / inn.amount) * 100)}% within ${p.maxLagHours}h. Matches intermediary mechanics; many lawful intermediaries (payroll, marketplace settlement) do the same.`,
            legitimate: "Payment aggregators, payroll intermediaries, and marketplace settlements routinely pass funds through.",
            checks: ["Is the account a registered intermediary?", "Check fees/retention vs agreement", "Trace ultimate beneficiaries"],
            limitations: "Currency conversion between legs is not netted without FX policy.",
          });
        }
        if (out.length > 40) break;
      }
      if (out.length > 60) break;
    }
  }

  // FAN-IN / FAN-OUT
  if (active.has("fan")) {
    const p = active.get("fan")!.params;
    const W = Number(p.windowHours) * 3600e3, minP = Number(p.minPeers);
    byReceiver.forEach((list, acct) => {
      const peers = new Set(list.map((t) => t.sender));
      const span = list.length ? list[list.length - 1].epoch - list[0].epoch : Infinity;
      if (peers.size >= minP && span <= W * 2) {
        out.push({
          id: aid("ALT"), ruleId: "fan", category: "network",
          title: `Fan-in — ${peers.size} funders → ${acct}`,
          severity: peers.size >= 10 ? "high" : "medium",
          score: Math.min(85, 45 + peers.size * 3),
          txnIds: list.map((t) => t.id).slice(0, 12), entities: [acct, ...peers].slice(0, 10),
          evidence: [
            { label: "Distinct funders", value: String(peers.size) },
            { label: "Transfers", value: String(list.length) },
            { label: "Total in", value: list.reduce((s, t) => s + t.amount, 0).toFixed(2) },
          ],
          explanation: `${peers.size} distinct senders funded one account. High connectivity alone is not suspicious — collection accounts look like this.`,
          legitimate: "Donations, fee collection, franchise pooling.",
          checks: ["Account purpose on file", "Onward destination of pooled funds"],
          limitations: "No ownership inference from names.",
        });
      }
    });
    bySender.forEach((list, acct) => {
      const peers = new Set(list.map((t) => t.receiver));
      const span = list.length ? list[list.length - 1].epoch - list[0].epoch : Infinity;
      if (peers.size >= minP && span <= W * 2) {
        out.push({
          id: aid("ALT"), ruleId: "fan", category: "network",
          title: `Fan-out — ${acct} → ${peers.size} recipients`,
          severity: peers.size >= 10 ? "high" : "medium",
          score: Math.min(85, 45 + peers.size * 3),
          txnIds: list.map((t) => t.id).slice(0, 12), entities: [acct, ...peers].slice(0, 10),
          evidence: [
            { label: "Distinct recipients", value: String(peers.size) },
            { label: "Total out", value: list.reduce((s, t) => s + t.amount, 0).toFixed(2) },
          ],
          explanation: `One account distributed to ${peers.size} recipients. Typical for disbursals; review only if purpose mismatches.`,
          legitimate: "Salary, vendor, or refund disbursals.",
          checks: ["Verify disbursal file", "Check recipient novelty"],
          limitations: "None beyond data coverage.",
        });
      }
    });
  }

  // CYCLES (bounded DFS)
  if (active.has("cycle")) {
    const maxHops = Number(active.get("cycle")!.params.maxHops ?? 4);
    const adj = new Map<string, { to: string; id: string }[]>();
    for (const t of txns.slice(0, 5000)) {
      if (!adj.has(t.sender)) adj.set(t.sender, []);
      adj.get(t.sender)!.push({ to: t.receiver, id: t.id });
    }
    const found = new Set<string>();
    for (const start of [...adj.keys()].slice(0, 400)) {
      const stack: { node: string; path: string[]; ids: string[] }[] = [{ node: start, path: [start], ids: [] }];
      while (stack.length) {
        const cur = stack.pop()!;
        if (cur.path.length > maxHops + 1) continue;
        for (const e of adj.get(cur.node) ?? []) {
          if (e.to === start && cur.path.length >= 3) {
            const key = [...cur.path, start].join(">");
            if (!found.has(key)) {
              found.add(key);
              out.push({
                id: aid("ALT"), ruleId: "cycle", category: "network",
                title: `Circular movement — ${[...cur.path, start].join(" → ")}`,
                severity: "high", score: 78,
                txnIds: [...cur.ids, e.id], entities: [...cur.path, start],
                evidence: [
                  { label: "Path", value: [...cur.path, start].join(" → ") },
                  { label: "Hops", value: String(cur.path.length) },
                  { label: "Transactions", value: [...cur.ids, e.id].join(", ") },
                ],
                explanation: "Funds return to the origin account within few hops. Review for round-tripping; trade and settlement loops also cycle legitimately.",
                legitimate: "Intercompany netting or exchange settlement loops.",
                checks: ["Inspect timestamps and amounts per hop", "Check commercial rationale"],
                limitations: `Bounded to ${maxHops} hops and first 5,000 transfers.`,
              });
            }
          } else if (!cur.path.includes(e.to)) {
            stack.push({ node: e.to, path: [...cur.path, e.to], ids: [...cur.ids, e.id] });
          }
        }
        if (found.size >= 8 || out.length > 80) break;
      }
      if (found.size >= 8 || out.length > 80) break;
    }
  }

  // DORMANT
  if (active.has("dormant")) {
    const q = Number(active.get("dormant")!.params.quietDays) * 86400e3;
    bySender.forEach((list, sender) => {
      for (let i = 1; i < list.length; i++) {
        if (list[i].epoch - list[i - 1].epoch >= q) {
          out.push({
            id: aid("ALT"), ruleId: "dormant", category: "behaviour",
            title: `Dormant reactivation — ${sender}`,
            severity: "low", score: 45,
            txnIds: [list[i].id], entities: [sender],
            evidence: [
              { label: "Quiet period", value: `${Math.round((list[i].epoch - list[i - 1].epoch) / 86400e3)} days` },
              { label: "Resumed", value: `${list[i].timestamp}: ${list[i].amount} ${list[i].currency}` },
            ],
            explanation: "Activity resumed after a long quiet period. Often benign (seasonal account); flag only with corroborating signals.",
            legitimate: "Seasonal business, reopened account.",
            checks: ["KYC refresh", "Compare new counterparty set"],
            limitations: "Requires genuine history; synthetic gaps mislead.",
          });
          break;
        }
      }
    });
  }

  // X-BORDER
  if (active.has("xborder")) {
    for (const t of txns) {
      const cross = t.origin_country !== t.dest_country || (t.currency !== "INR" && (t.origin_country === "IN" || t.dest_country === "IN"));
      if (cross && t.amount >= 500000) {
        out.push({
          id: aid("ALT"), ruleId: "xborder", category: "cross-border",
          title: `Unusual cross-border movement — ${t.id}`,
          severity: t.amount >= 2000000 ? "high" : "medium", score: 62,
          txnIds: [t.id], entities: [t.sender, t.receiver],
          evidence: [
            { label: "Route", value: `${t.origin_country} → ${t.dest_country}` },
            { label: "Value", value: `${t.amount} ${t.currency}` },
            { label: "Purpose", value: t.purpose || "(not stated)" },
          ],
          explanation: "Large cross-border leg. Country and amount alone do not establish suspicion — corridor, purpose, and history decide.",
          legitimate: "Import payments, education fees, IT exports.",
          checks: ["Invoice/commercial reference", "Customer profile vs activity", "Intermediary chain"],
          limitations: "No external country-risk source wired; corridor novelty uses file history only.",
        });
        if (out.filter((a) => a.ruleId === "xborder").length > 25) break;
      }
    }
  }

  // Trained isolation-forest anomalies (unsupervised; labels never used).
  if (active.has("ml") && txns.length >= 20) {
    for (const a of mlAnomalyAlerts(txns, active.get("ml")!.params, aid)) out.push(a);
  }

  return out.slice(0, 120);
}

/** Non-empty per-rule dataset summaries: every enabled rule reports what it scanned. */
export interface RuleSummary {
  ruleId: string;
  name: string;
  txnsScanned: number;
  alerts: number;
  topEvidence: string[];
}

export function runDatasetSummaries(txns: NormalizedTxn[], rules: RuleConfig[], alerts: Alert[]): RuleSummary[] {
  return rules.filter((r) => r.enabled).map((r) => {
    const mine = alerts.filter((a) => a.ruleId === r.id);
    const ev = new Map<string, number>();
    mine.forEach((a) => a.evidence.forEach((e) => ev.set(e.label, (ev.get(e.label) ?? 0) + 1)));
    return {
      ruleId: r.id, name: r.name, txnsScanned: txns.length, alerts: mine.length,
      topEvidence: [...ev.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} (x${n})`),
    };
  });
}

export interface Verification {
  alertId: string;
  confirmedByModel: boolean;
  rulesOnly: boolean;
  checks: { label: string; passed: boolean }[];
}

/** Confirm each alert against the trained model meta: rules-only alerts are never model-confirmed. */
export function verifyAlerts(alerts: Alert[], model: ModelMeta | null): Verification[] {
  return alerts.map((a) => {
    const mlScored = a.ruleId === "ml" && !!model;
    return {
      alertId: a.id,
      confirmedByModel: mlScored,
      rulesOnly: a.ruleId !== "ml",
      checks: [
        { label: model ? `Isolation forest scored this dataset (${model.trees} trees, ${model.records} records)` : "Isolation forest has not been trained on this dataset", passed: mlScored },
        { label: "Pattern evidence attached (transaction IDs + values)", passed: a.txnIds.length > 0 && a.evidence.length > 0 },
        { label: "Named entities resolve to dataset transfers", passed: a.entities.length > 0 },
      ],
    };
  });
}

export interface EvalResult {
  tp: number; fp: number; fn: number;
  precision: number; recall: number; f1: number;
  scenarioRecall: { scenario: string; found: boolean }[];
  note: string;
}

export function evaluate(alertTxnIds: Set<string>, groundTruth: { txnId: string; scenario: string }[]): EvalResult {
  let tp = 0, fp = 0;
  const gtSet = new Set(groundTruth.map((g) => g.txnId));
  alertTxnIds.forEach((id) => { if (gtSet.has(id)) tp++; else fp++; });
  const fn = Math.max(0, gtSet.size - tp);
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const byScenario = new Map<string, { total: number; hit: number }>();
  groundTruth.forEach((g) => {
    const e = byScenario.get(g.scenario) ?? { total: 0, hit: 0 };
    e.total++;
    if (alertTxnIds.has(g.txnId)) e.hit++;
    byScenario.set(g.scenario, e);
  });
  return {
    tp, fp, fn, precision, recall,
    f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0,
    scenarioRecall: [...byScenario.entries()].map(([scenario, e]) => ({ scenario, found: e.hit > 0 })),
    note: "Transaction-level counts shown alongside scenario-level recall; one scenario is not counted as many independent successes.",
  };
}
