// Machine-learned anomaly detection: a freshly trained Isolation Forest per run.
// Unsupervised only — no labels (including synthetic ground truth) are ever used.
import type { Alert } from "./detect";
import type { NormalizedTxn } from "./csv";
import { scoreForest, trainForest } from "./isolation";
import { toast } from "sonner";

export interface ModelMeta {
  version: string;
  trees: number;
  seeds: number[];
  sample: number;
  records: number;
  features: string[];
  contamination: number;
  threshold: number;
  trainedAt: string;
  seed: number;
}

export const MODEL_KEY = "trace.v1.model";

export function readModelMeta(): ModelMeta | null {
  try {
    const raw = localStorage.getItem(MODEL_KEY);
    return raw ? (JSON.parse(raw) as ModelMeta) : null;
  } catch {
    return null;
  }
}

function mean(a: number[]) {
  return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
}
function sd(a: number[]) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(mean(a.map((x) => (x - m) * (x - m))));
}

const FEATURE_NAMES = [
  "log_amount",
  "sender_amount_z",
  "sender_log_freq",
  "sender_value_share",
  "hour_of_day",
  "novel_pair",
  "cross_border",
  "sender_per_day",
  "fan_peer_count",
  "is_weekend",
  "is_round_figure",
  "sender_median_ratio",
  "channel_rarity",
  "night_hour",
];

function featureMatrix(txns: NormalizedTxn[]): number[][] {
  const byS = new Map<string, number[]>();
  const epochs = new Map<string, number[]>();
  const peers = new Map<string, Set<string>>();
  txns.forEach((t) => {
    if (!byS.has(t.sender)) { byS.set(t.sender, []); epochs.set(t.sender, []); peers.set(t.sender, new Set()); }
    byS.get(t.sender)!.push(t.amount);
    epochs.get(t.sender)!.push(t.epoch);
    peers.get(t.sender)!.add(t.receiver);
  });
  const totals = new Map<string, number>();
  let grand = 0;
  byS.forEach((v, k) => {
    const s = v.reduce((a, b) => a + b, 0);
    totals.set(k, s);
    grand += s;
  });
  const medians = new Map<string, number>();
  byS.forEach((v, k) => {
    const srt = [...v].sort((a, b) => a - b);
    medians.set(k, srt[Math.floor(srt.length / 2)] ?? 0);
  });
  const chFreq = new Map<string, number>();
  txns.forEach((t) => {
    const k = t.channel || "unknown";
    chFreq.set(k, (chFreq.get(k) ?? 0) + 1);
  });
  const order = [...txns].sort((a, b) => a.epoch - b.epoch);
  const known = new Set(order.slice(0, Math.floor(order.length * 0.7)).map((t) => t.sender + ">" + t.receiver));
  const raw = txns.map((t) => {
    const arr = byS.get(t.sender) ?? [t.amount];
    const m = mean(arr);
    const s = sd(arr) || 1;
    const ep = epochs.get(t.sender) ?? [t.epoch];
    const spanDays = Math.max(1, (Math.max(...ep) - Math.min(...ep)) / 86400e3);
    const perDay = arr.length / spanDays;
    const peerCount = peers.get(t.sender)?.size ?? 1;
    const dow = new Date(t.epoch).getUTCDay();
    const med = medians.get(t.sender) ?? t.amount;
    const chF = (chFreq.get(t.channel || "unknown") ?? 1) / Math.max(1, txns.length);
    const hr = new Date(t.epoch).getHours();
    return [
      Math.log10(Math.max(1, t.amount)),
      (t.amount - m) / s,
      Math.log10(arr.length),
      grand > 0 ? (totals.get(t.sender) ?? 0) / grand : 0,
      new Date(t.epoch).getHours() / 23,
      known.has(t.sender + ">" + t.receiver) ? 0 : 1,
      t.origin_country !== t.dest_country ? 1 : 0,
      Math.log10(1 + perDay),
      Math.log10(peerCount),
      dow === 0 || dow === 6 ? 1 : 0,
      t.amount >= 1000 && t.amount % 1000 === 0 ? 1 : 0,
      med > 0 ? Math.log10(Math.max(0.01, t.amount / med)) : 0,
      1 - chF,
      hr < 6 || hr >= 22 ? 1 : 0,
    ];
  });
  const dim = FEATURE_NAMES.length;
  const cols: number[][] = [];
  for (let j = 0; j < dim; j++) {
    const col = raw.map((r) => r[j]);
    const m = mean(col);
    const s = sd(col) || 1;
    cols.push(col.map((v) => (v - m) / s));
  }
  return raw.map((_, i) => cols.map((c) => c[i]));
}

/** Train hard (many trees, full data) and return alerts for the top-contamination tail. */
export function mlAnomalyAlerts(
  txns: NormalizedTxn[],
  params: Record<string, number | string>,
  makeId: (p: string) => string,
): Alert[] {
  const out: Alert[] = [];
  if (txns.length < 20) return out;
  const trees = Math.max(100, Math.min(400, Number(params.trees ?? 300)));
  const cont = Math.min(0.2, Math.max(0.01, Number(params.contamination ?? 0.05)));
  const baseSeed = 20240 + (txns.length % 997);
  const seeds = [baseSeed, baseSeed + 101, baseSeed + 977];
  const X = featureMatrix(txns);
  const perSeed = Math.max(50, Math.round(trees / seeds.length));
  const totalTrees = perSeed * seeds.length;
  const sample = Math.min(512, X.length);
  // Multi-seed ensemble: average isolation scores so one unlucky split can't dominate.
  const acc = new Array<number>(X.length).fill(0);
  for (const s of seeds) {
    const forest = trainForest(X, { trees: perSeed, sample, seed: s });
    const sc = scoreForest(forest, X);
    for (let i = 0; i < acc.length; i++) acc[i] += (sc[i] ?? 0) / seeds.length;
  }
  const scores = acc;
  const ordered = [...scores].sort((a, b) => a - b);
  const threshold = ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * (1 - cont)))];
  try {
    const meta: ModelMeta = {
      version: "iforest-v3",
      trees: totalTrees,
      seeds,
      sample,
      records: X.length,
      features: FEATURE_NAMES,
      contamination: cont,
      threshold: Math.round(threshold * 1000) / 1000,
      trainedAt: new Date().toISOString(),
      seed: baseSeed,
    };
    localStorage.setItem(MODEL_KEY, JSON.stringify(meta));
  } catch {
    /* private mode — training still ran, persistence skipped */
  }

  const gAmts = txns.map((t) => t.amount).filter((a) => a > 0);
  const gM = mean(gAmts);
  const gS = sd(gAmts) || 1;
  const pairFirst = new Map<string, number>();
  [...txns]
    .sort((a, b) => a.epoch - b.epoch)
    .forEach((t) => {
      const k = t.sender + ">" + t.receiver;
      if (!pairFirst.has(k)) pairFirst.set(k, t.epoch);
    });

  const ranked = txns
    .map((t, i) => ({ t, s: scores[i] ?? 0 }))
    .filter((x) => x.s >= threshold)
    .sort((a, b) => b.s - a.s);

  let added = 0;
  for (const item of ranked) {
    if (added >= 20) break;
    const t = item.t;
    const s = item.s;
    const reasons: string[] = [];
    const z = (t.amount - gM) / gS;
    if (z > 1.5) reasons.push("amount " + z.toFixed(1) + "σ above dataset mean");
    if (txns.length > 30 && pairFirst.get(t.sender + ">" + t.receiver) === t.epoch) {
      reasons.push("first-seen sender to receiver pair");
    }
    if (t.origin_country !== t.dest_country) {
      reasons.push("cross-border leg " + t.origin_country + " to " + t.dest_country);
    }
    if (reasons.length === 0) continue;
    out.push({
      id: makeId("ALT"),
      ruleId: "ml",
      category: "anomaly",
      title: "ML isolation anomaly — " + t.id,
      severity: s >= 0.8 ? "high" : "medium",
      score: Math.min(95, Math.round(40 + s * 50)),
      txnIds: [t.id],
      entities: [t.sender, t.receiver],
      evidence: [
        { label: "Isolation score", value: s.toFixed(3) + " (threshold " + threshold.toFixed(3) + ", top " + Math.round(cont * 100) + "%)" },
        { label: "Model", value: "iforest-v3 · " + totalTrees + " trees x 3 seeds · " + X.length + " records · " + FEATURE_NAMES.length + " features" },
        { label: "Top signals", value: reasons.join("; ").slice(0, 240) },
        { label: "Transfer", value: t.sender + " to " + t.receiver + " · " + t.amount + " " + t.currency },
      ],
      explanation:
        "A freshly trained isolation forest ranked this transfer in the most unusual " +
        Math.round(cont * 100) +
        "% of the dataset. " +
        reasons.join("; ") +
        ".",
      legitimate: "Rare does not mean wrong — large one-off payments, new suppliers, and first-time corridors all score highly.",
      checks: ["Confirm business purpose", "Compare with sender history", "Check corridor and invoice context"],
      limitations: "Anomaly scores rank unusualness; they are not calibrated probabilities and do not confirm financial crime.",
    });
    added++;
  }
  return out;
}

/** Wrap a detection result with a training notification. Returns alerts unchanged. */
export function announceAnalysis(label: string, alerts: Alert[]): Alert[] {
  const meta = readModelMeta();
  const mlN = alerts.filter((a) => a.ruleId === "ml").length;
  const rulesN = alerts.length - mlN;
  toast.success("Analysis complete — " + label, {
    description:
      alerts.length +
      " review signals — not confirmed findings (" +
      mlN +
      " scored by the freshly trained isolation-forest model" +
      (meta ? " — " + meta.trees + " trees over " + meta.records + " records" : "") +
      "; " +
      rulesN +
      " from deterministic rules only and not confirmed by any model). Every alert needs human review.",
  });
  return alerts;
}
