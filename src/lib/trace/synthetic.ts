// Deterministic synthetic ledger generator with planted scenarios + manifests.
import type { NormalizedTxn } from "./csv";

export interface GenSpec {
  name: string;
  count: number;
  accounts: number;
  mode: "domestic" | "international" | "mixed";
  days: number;
  seed: number;
  splitting: number;
  passthrough: number;
  circular: number;
}

export interface ScenarioManifest {
  dataset: string;
  seed: number;
  generatedAt: string;
  scenarios: { kind: string; txnIds: string[]; description: string }[];
  groundTruth: { txnId: string; scenario: string }[];
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CHANNELS = ["UPI", "IMPS", "NEFT", "RTGS", "bank transfer", "card", "wallet"];
const PURPOSES = ["vendor payment", "salary", "merchant settlement", "supplier invoice", "fees", "refund", "services"];

export function generate(spec: GenSpec): { txns: NormalizedTxn[]; manifest: ScenarioManifest; csv: string } {
  const rnd = mulberry(spec.seed);
  const txns: NormalizedTxn[] = [];
  const gt: { txnId: string; scenario: string }[] = [];
  const scenarios: ScenarioManifest["scenarios"] = [];
  const accts = Array.from({ length: spec.accounts }, (_, i) => `ACC-${String(i + 1).padStart(4, "0")}`);
  const now = Date.now();
  const dayMs = 86400e3;
  let id = 1;
  const nid = () => `SYN-${String(id++).padStart(6, "0")}`;
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

  const baseCount = Math.max(0, spec.count - (spec.splitting * 5 + spec.passthrough * 3 + spec.circular * 3));
  for (let i = 0; i < baseCount; i++) {
    const s = pick(accts); let r = pick(accts);
    if (r === s) r = pick(accts);
    const intl = spec.mode !== "domestic" && rnd() < (spec.mode === "international" ? 0.8 : 0.15);
    const cur = intl ? pick(["USD", "EUR", "AED", "SGD", "GBP"]) : "INR";
    const amt = Math.round((500 + rnd() * 95000) * 100) / 100;
    const epoch = now - Math.floor(rnd() * spec.days * dayMs);
    const t: NormalizedTxn = {
      id: nid(), sender: s, receiver: r, amount: amt, currency: cur,
      timestamp: new Date(epoch).toISOString(), epoch,
      origin_country: intl ? pick(["US", "AE", "SG", "GB"]) : "IN",
      dest_country: intl ? "IN" : "IN",
      channel: pick(CHANNELS), purpose: pick(PURPOSES), status: "completed", raw: {},
    };
    t.raw = { transaction_id: t.id, sender: s, receiver: r, amount: String(amt), currency: cur, timestamp: t.timestamp, channel: t.channel, origin_country: t.origin_country, destination_country: t.dest_country, purpose: t.purpose };
    txns.push(t);
  }
  // planted splitting
  for (let k = 0; k < spec.splitting; k++) {
    const s = pick(accts), r = pick(accts);
    const ids: string[] = [];
    const t0 = now - Math.floor(rnd() * spec.days * dayMs);
    const base = 40000 + rnd() * 8000;
    for (let j = 0; j < 5; j++) {
      const t: NormalizedTxn = {
        id: nid(), sender: s, receiver: r, amount: Math.round(base * 100) / 100, currency: "INR",
        timestamp: new Date(t0 + j * 5 * 3600e3).toISOString(), epoch: t0 + j * 5 * 3600e3,
        origin_country: "IN", dest_country: "IN", channel: "IMPS", purpose: "vendor payment", status: "completed", raw: {},
      };
      t.raw = { transaction_id: t.id, sender: s, receiver: r, amount: String(t.amount), currency: "INR", timestamp: t.timestamp, channel: "IMPS", origin_country: "IN", destination_country: "IN", purpose: "vendor payment" };
      txns.push(t); ids.push(t.id); gt.push({ txnId: t.id, scenario: `splitting-${k + 1}` });
    }
    scenarios.push({ kind: "splitting", txnIds: ids, description: `5 near-identical transfers ${s}→${r} in ~24h` });
  }
  // pass-through
  for (let k = 0; k < spec.passthrough; k++) {
    const a = pick(accts), hub = pick(accts), c = pick(accts);
    const t0 = now - Math.floor(rnd() * spec.days * dayMs);
    const amt = Math.round((60000 + rnd() * 40000) * 100) / 100;
    const mk = (s: string, r: string, ep: number, v: number) => {
      const t: NormalizedTxn = {
        id: nid(), sender: s, receiver: r, amount: v, currency: "INR",
        timestamp: new Date(ep).toISOString(), epoch: ep,
        origin_country: "IN", dest_country: "IN", channel: "NEFT", purpose: "settlement", status: "completed", raw: {},
      };
      t.raw = { transaction_id: t.id, sender: s, receiver: r, amount: String(v), currency: "INR", timestamp: t.timestamp, channel: "NEFT", origin_country: "IN", destination_country: "IN", purpose: "settlement" };
      txns.push(t); gt.push({ txnId: t.id, scenario: `passthrough-${k + 1}` }); return t.id;
    };
    const ids = [mk(a, hub, t0, amt), mk(hub, c, t0 + 4 * 3600e3, Math.round(amt * 0.97 * 100) / 100), mk(hub, c, t0 + 6 * 3600e3, Math.round(amt * 0.02 * 100) / 100)];
    scenarios.push({ kind: "passthrough", txnIds: ids, description: `${a}→${hub}→${c} within 6h` });
  }
  // circular
  for (let k = 0; k < spec.circular; k++) {
    const a = pick(accts), b = pick(accts), c = pick(accts);
    const t0 = now - Math.floor(rnd() * spec.days * dayMs);
    const mk = (s: string, r: string, h: number) => {
      const t: NormalizedTxn = {
        id: nid(), sender: s, receiver: r, amount: 75000, currency: "INR",
        timestamp: new Date(t0 + h * 3600e3).toISOString(), epoch: t0 + h * 3600e3,
        origin_country: "IN", dest_country: "IN", channel: "UPI", purpose: "transfer", status: "completed", raw: {},
      };
      t.raw = { transaction_id: t.id, sender: s, receiver: r, amount: "75000", currency: "INR", timestamp: t.timestamp, channel: "UPI", origin_country: "IN", destination_country: "IN", purpose: "transfer" };
      txns.push(t); gt.push({ txnId: t.id, scenario: `circular-${k + 1}` }); return t.id;
    };
    const ids = [mk(a, b, 0), mk(b, c, 8), mk(c, a, 16)];
    scenarios.push({ kind: "circular", txnIds: ids, description: `${a}→${b}→${c}→${a}` });
  }

  txns.sort((x, y) => x.epoch - y.epoch);
  const header = ["transaction_id", "sender", "receiver", "amount", "currency", "timestamp", "channel", "origin_country", "destination_country", "purpose"];
  const csv = [header.join(","), ...txns.map((t) => header.map((h) => (t.raw as Record<string, string>)[h] ?? "").join(","))].join("\n");
  return {
    txns,
    manifest: { dataset: spec.name, seed: spec.seed, generatedAt: new Date().toISOString(), scenarios, groundTruth: gt },
    csv,
  };
}

export function specFromPrompt(prompt: string): GenSpec {
  const nums = prompt.match(/\d[\d,]*/g)?.map((x) => parseInt(x.replace(/,/g, ""), 10)) ?? [];
  const count = nums[0] && nums[0] >= 50 && nums[0] <= 100000 ? nums[0] : 2000;
  const lower = prompt.toLowerCase();
  return {
    name: "AI scenario dataset",
    count,
    accounts: lower.includes("small") ? 40 : 120,
    mode: lower.includes("international") && !lower.includes("domestic") ? "international" : lower.includes("domestic") && !lower.includes("international") ? "domestic" : "mixed",
    days: 90, seed: 42,
    splitting: /split/i.test(prompt) ? 3 : 1,
    passthrough: /intermediary|pass-?through/i.test(prompt) ? 2 : 1,
    circular: /circular|cycle/i.test(prompt) ? 1 : 1,
  };
}
