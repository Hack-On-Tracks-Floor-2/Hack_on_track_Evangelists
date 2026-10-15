// Deterministic synthetic ledger generator with planted scenarios + manifests.
// Realism model: masked Indian bank accounts, UTR-style references, statement-grade
// narrations, salary/rent cycles, business-hour weighting, and channel mixes that
// mirror Indian retail payments (UPI-heavy). Ground truth stays hidden from models.
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

const FIRST = ["Rajesh", "Priya", "Amit", "Sneha", "Vikram", "Anita", "Rahul", "Divya", "Suresh", "Kavya", "Arun", "Meera", "Karan", "Pooja", "Nikhil", "Lakshmi", "Sanjay", "Ritu", "Manoj", "Shreya", "Deepak", "Nisha", "Rohan", "Asha", "Varun", "Kiran", "Geeta", "Harish", "Nandini", "Sahil"];
const LAST = ["Kumar", "Sharma", "Patel", "Iyer", "Reddy", "Desai", "Nair", "Gupta", "Mehta", "Joshi", "Chopra", "Rao", "Menon", "Kulkarni", "Agarwal", "Das", "Pillai", "Verma", "Mishra", "Bose"];
const BANKS = ["HDFC", "ICICI", "SBI", "Axis", "Kotak"];
const MERCHANTS = ["SWIGGY", "ZOMATO", "AMAZON PAY", "FLIPKART", "BIGBASKET", "IRCTC", "UBER INDIA", "DMART", "BOOKMYSHOW", "TATA POWER", "BESCOM", "AIRTEL", "JIO RECHARGE", "DECATHLON", "PHONEPE WALLET"];
const EMPLOYERS = ["INFOSYS", "TCS", "WIPRO", "HDFC BANK", "STATE GOVT"];
const INTL_JOBS = [
  { from: "GULF EXCHANGE · DUBAI", cur: "AED", purpose: "SALARY CREDIT - GULF", origin: "AE" },
  { from: "WELLS FARGO · US REMITTANCE", cur: "USD", purpose: "FAMILY MAINTENANCE", origin: "US" },
  { from: "DBS · SINGAPORE", cur: "SGD", purpose: "CONSULTING FEES", origin: "SG" },
  { from: "BARCLAYS · LONDON", cur: "GBP", purpose: "TUITION FEE REFUND", origin: "GB" },
];

interface Actor { id: string; kind: "person" | "merchant" | "employer" | "intl"; }

function round2(x: number) { return Math.round(x * 100) / 100; }

export function generate(spec: GenSpec): { txns: NormalizedTxn[]; manifest: ScenarioManifest; csv: string } {
  const rnd = mulberry(spec.seed);
  const txns: NormalizedTxn[] = [];
  const gt: { txnId: string; scenario: string }[] = [];
  const scenarios: ScenarioManifest["scenarios"] = [];
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const now = Date.now();
  const dayMs = 86400e3;
  let id = 1;
  // UTR-style 12-digit numeric reference, unique across base + planted legs.
  const nid = () => String(423000000000 + (id++));

  // --- population: named people on masked accounts ---
  const people: Actor[] = [];
  const seenAcct = new Set<string>();
  for (let i = 0; i < spec.accounts; i++) {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    let acct = `${pick(BANKS)} ••${1000 + Math.floor(rnd() * 9000)}`;
    while (seenAcct.has(name + acct)) acct = `${pick(BANKS)} ••${1000 + Math.floor(rnd() * 9000)}`;
    seenAcct.add(name + acct);
    people.push({ id: `${name} · ${acct}`, kind: "person" });
  }
  const merchants: Actor[] = MERCHANTS.map((m) => ({ id: m, kind: "merchant" }));
  const employers: Actor[] = EMPLOYERS.map((m) => ({ id: `SALARY · ${m}`, kind: "employer" }));
  const person = () => pick(people);

  // Business-hour weighting: quiet nights, lunch + evening UPI peaks.
  const HOURS = [7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 15, 16, 17, 18, 18, 19, 19, 19, 20, 20, 21, 21, 22, 9, 12, 18];
  const epochOn = (daysBack: number, hour?: number) => {
    const d = new Date(now - daysBack * dayMs);
    d.setHours(hour ?? pick(HOURS), Math.floor(rnd() * 60), Math.floor(rnd() * 60), 0);
    return d.getTime();
  };
  const firstOfMonth = (daysBack: number) => {
    const d = new Date(now - daysBack * dayMs);
    d.setDate(1); d.setHours(9 + Math.floor(rnd() * 3), Math.floor(rnd() * 60), 0, 0);
    return d.getTime();
  };

  const mk = (o: { s: string; r: string; amount: number; currency: string; epoch: number; origin: string; dest: string; channel: string; purpose: string; status?: string }) => {
    const t: NormalizedTxn = {
      id: nid(), sender: o.s, receiver: o.r, amount: round2(o.amount), currency: o.currency,
      timestamp: new Date(o.epoch).toISOString(), epoch: o.epoch,
      origin_country: o.origin, dest_country: o.dest,
      channel: o.channel, purpose: o.purpose, status: o.status ?? "completed", raw: {},
    };
    t.raw = { transaction_id: t.id, sender: o.s, receiver: o.r, amount: String(t.amount), currency: o.currency, timestamp: t.timestamp, channel: o.channel, origin_country: o.origin, destination_country: o.dest, purpose: o.purpose };
    txns.push(t);
    return t;
  };
  const upiSpend = () => round2(40 + (-Math.log(1 - rnd())) * 900 + (rnd() < 0.12 ? 0.5 : 0));

  const baseCount = Math.max(0, spec.count - (spec.splitting * 5 + spec.passthrough * 3 + spec.circular * 3));
  for (let i = 0; i < baseCount; i++) {
    const intl = spec.mode !== "domestic" && rnd() < (spec.mode === "international" ? 0.8 : 0.12);
    const daysBack = Math.floor(rnd() * spec.days);
    if (intl) {
      const job = pick(INTL_JOBS);
      const p = person();
      const amt = round2(20000 + rnd() * 280000);
      mk({ s: job.from, r: p.id, amount: amt, currency: job.cur, epoch: epochOn(daysBack, 10 + Math.floor(rnd() * 6)), origin: job.origin, dest: "IN", channel: "SWIFT", purpose: job.purpose });
      continue;
    }
    const roll = rnd();
    if (roll < 0.5) {
      // UPI everyday spend, person → person/merchant.
      const s = person();
      const r = rnd() < 0.45 ? person() : pick(merchants);
      const amt = r.kind === "merchant" ? upiSpend() : round2(100 + (-Math.log(1 - rnd())) * 4000);
      mk({ s: s.id, r: r.id === s.id ? pick(merchants).id : r.id, amount: amt, currency: "INR", epoch: epochOn(daysBack), origin: "IN", dest: "IN", channel: "UPI", purpose: r.kind === "merchant" ? `UPI/${r.id.replace(/\s/g, "")}/MERCHANTPAY` : `UPI/P2P/${r.id.split(" · ")[0].replace(/\s/g, "").toUpperCase()}` });
    } else if (roll < 0.62) {
      // Account transfer between people.
      const s = person(); let r = person();
      if (r.id === s.id) r = person();
      mk({ s: s.id, r: r.id, amount: round2(1000 + rnd() * 80000), currency: "INR", epoch: epochOn(daysBack), origin: "IN", dest: "IN", channel: rnd() < 0.6 ? "IMPS" : "NEFT", purpose: pick(["FAMILY TRANSFER", "LOAN REPAYMENT", "SHARED EXPENSES", "HOUSEHOLD"]) });
    } else if (roll < 0.7) {
      // Bill payments.
      const s = person();
      const biller = pick(["BESCOM", "AIRTEL", "JIO RECHARGE", "TATA POWER"]);
      mk({ s: s.id, r: biller, amount: round2(249 + rnd() * 6000), currency: "INR", epoch: epochOn(daysBack), origin: "IN", dest: "IN", channel: rnd() < 0.7 ? "UPI" : "NEFT", purpose: `BILLPAY/${biller}` });
    } else if (roll < 0.76) {
      // Card point-of-sale.
      const s = person(); const m = pick(merchants);
      mk({ s: s.id, r: m.id, amount: round2(499 + rnd() * 24000), currency: "INR", epoch: epochOn(daysBack), origin: "IN", dest: "IN", channel: "card", purpose: `POS 416021******${1000 + Math.floor(rnd() * 9000)} ${m.id}` });
    } else if (roll < 0.83) {
      // Salary credit on the 1st.
      const e = pick(employers); const p = person();
      mk({ s: e.id, r: p.id, amount: (28 + Math.floor(rnd() * 150)) * 1000, currency: "INR", epoch: firstOfMonth(daysBack), origin: "IN", dest: "IN", channel: "NEFT", purpose: `SALARY CREDIT - ${e.id.replace("SALARY · ", "")}` });
    } else if (roll < 0.89) {
      // Rent, early month, round figures.
      const s = person(); let r = person();
      if (r.id === s.id) r = person();
      const d = new Date(now - daysBack * dayMs); d.setDate(1 + Math.floor(rnd() * 5)); d.setHours(10, Math.floor(rnd() * 60), 0, 0);
      mk({ s: s.id, r: r.id, amount: (8 + Math.floor(rnd() * 37)) * 1000, currency: "INR", epoch: d.getTime(), origin: "IN", dest: "IN", channel: rnd() < 0.5 ? "NEFT" : "IMPS", purpose: "HOUSE RENT" });
    } else {
      // Business / current-account movement.
      const s = person(); let r = person();
      if (r.id === s.id) r = person();
      mk({ s: s.id, r: r.id, amount: round2(50000 + rnd() * 950000), currency: "INR", epoch: epochOn(daysBack, 10 + Math.floor(rnd() * 8)), origin: "IN", dest: "IN", channel: rnd() < 0.4 ? "RTGS" : "NEFT", purpose: pick(["VENDOR PAYMENT", "SUPPLIER INVOICE", "PROFESSIONAL FEES", "TRADE SETTLEMENT"]) });
    }
  }

  // --- planted splitting: vendor payouts just under a round figure, same day ---
  for (let k = 0; k < spec.splitting; k++) {
    const s = person(), r = person();
    const ids: string[] = [];
    const t0 = epochOn(Math.floor(rnd() * spec.days), 11);
    for (let j = 0; j < 5; j++) {
      const t = mk({ s: s.id, r: r.id === s.id ? person().id : r.id, amount: 49500, currency: "INR", epoch: t0 + j * 5 * 3600e3, origin: "IN", dest: "IN", channel: "IMPS", purpose: "VENDOR PAYMENT" });
      ids.push(t.id); gt.push({ txnId: t.id, scenario: `splitting-${k + 1}` });
    }
    scenarios.push({ kind: "splitting", txnIds: ids, description: `5 identical vendor payouts ${s.id}→${r.id} in ~24h` });
  }
  // --- planted pass-through: settlement account forwards within hours ---
  for (let k = 0; k < spec.passthrough; k++) {
    const a = person(), hub = person(), c = person();
    const t0 = epochOn(Math.floor(rnd() * spec.days), 10);
    const amt = round2(60000 + rnd() * 40000);
    const i1 = mk({ s: a.id, r: hub.id, amount: amt, currency: "INR", epoch: t0, origin: "IN", dest: "IN", channel: "NEFT", purpose: "CLIENT SETTLEMENT" });
    const i2 = mk({ s: hub.id, r: c.id, amount: round2(amt * 0.97), currency: "INR", epoch: t0 + 4 * 3600e3, origin: "IN", dest: "IN", channel: "IMPS", purpose: "ONWARD SETTLEMENT" });
    const i3 = mk({ s: hub.id, r: c.id, amount: round2(amt * 0.02), currency: "INR", epoch: t0 + 6 * 3600e3, origin: "IN", dest: "IN", channel: "IMPS", purpose: "BALANCE SWEEP" });
    [i1, i2, i3].forEach((t) => gt.push({ txnId: t.id, scenario: `passthrough-${k + 1}` }));
    scenarios.push({ kind: "passthrough", txnIds: [i1.id, i2.id, i3.id], description: `${a.id}→${hub.id}→${c.id} within 6h` });
  }
  // --- planted circular: round-tripping trade payments ---
  for (let k = 0; k < spec.circular; k++) {
    const a = person(), b = person(), c = person();
    const t0 = epochOn(Math.floor(rnd() * spec.days), 9);
    const legs = [
      mk({ s: a.id, r: b.id, amount: 75000, currency: "INR", epoch: t0, origin: "IN", dest: "IN", channel: "RTGS", purpose: "TRADE SETTLEMENT" }),
      mk({ s: b.id, r: c.id, amount: 75000, currency: "INR", epoch: t0 + 8 * 3600e3, origin: "IN", dest: "IN", channel: "RTGS", purpose: "TRADE SETTLEMENT" }),
      mk({ s: c.id, r: a.id, amount: 75000, currency: "INR", epoch: t0 + 16 * 3600e3, origin: "IN", dest: "IN", channel: "RTGS", purpose: "TRADE SETTLEMENT" }),
    ];
    legs.forEach((t) => gt.push({ txnId: t.id, scenario: `circular-${k + 1}` }));
    scenarios.push({ kind: "circular", txnIds: legs.map((t) => t.id), description: `${a.id}→${b.id}→${c.id}→${a.id}` });
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
