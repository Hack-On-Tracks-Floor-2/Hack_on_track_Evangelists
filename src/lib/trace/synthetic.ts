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
  /** Risk-graded datasets only: documented per-entity tiers, verified against detection output. */
  personas?: GradedPersona[];
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

/* ── Risk-graded balanced ledger ──────────────────────────────────────────
   A deliberately tiered showcase dataset: the majority of accounts are
   benign BY CONSTRUCTION, so a reviewer can finally see entities marked low
   risk alongside the medium/high ones — the full spread every analysis
   screen needs. Constraints below are derived directly from detect.ts:
   • split:  ≥4 transfers within ±15% of the window mean in 48h  → benign
     senders never exceed 2 transfers per 48h window and amounts vary widely.
   • velocity: needs ≥8 sends AND ≥1 amount outlier AND (perDay>3 OR ≥2
     outliers) → benign outflows stay ≤ ~4,400, inside 1.1σ of the sender's
     own baseline, and every sender stays under 8 sends unless planted.
   • passthrough: ≥70% of an inbound forwarded within 24h → benign same-day
     and next-day outflows stay ≤ 0.67× the inbound (credits land at 21:00,
     after the day's last spend hour; rent anchors never follow a credit).
   • fan-in/out: ≥5 distinct peers with the ENTIRE list spanning ≤144h →
     benign accounts have months of history, so the span can never fit.
   • cycle: persona→persona transfers only go to higher-indexed personas,
     so the retail graph is a DAG — cycles exist only where planted.
   • dormant: ≥60 days of silence between consecutive sends → benign cadence
     is a few days, seasonal accounts are planted explicitly.
   • xborder: cross-border legs ≥ 500,000 → exactly one is planted.
   • ml: top-20 isolation scores land on the planted extremes (huge round
     figures, cross-border, bursts), not on the dense everyday cluster.
   Ground truth stays in the manifest; models never see it. */

export interface GradedPersona {
  id: string;
  tier: "clean" | "low" | "medium" | "high";
  why: string;
}
export interface BalancedOut {
  txns: NormalizedTxn[];
  manifest: ScenarioManifest;
  personas: GradedPersona[];
  csv: string;
}

export function generateBalanced(): BalancedOut {
  const rnd = mulberry(1907);
  const txns: NormalizedTxn[] = [];
  const gt: { txnId: string; scenario: string }[] = [];
  const scenarios: ScenarioManifest["scenarios"] = [];
  const personas: GradedPersona[] = [];
  const now = Date.now();
  const dayMs = 86400e3;
  let seq = 1;
  const nid = () => String(610000000000 + (seq++));

  const mk = (o: { s: string; r: string; amount: number; currency: string; epoch: number; origin: string; dest: string; channel: string; purpose: string }) => {
    const t: NormalizedTxn = {
      id: nid(), sender: o.s, receiver: o.r, amount: Math.round(o.amount * 100) / 100, currency: o.currency,
      timestamp: new Date(o.epoch).toISOString(), epoch: o.epoch,
      origin_country: o.origin, dest_country: o.dest,
      channel: o.channel, purpose: o.purpose, status: "completed", raw: {},
    };
    t.raw = { transaction_id: t.id, sender: o.s, receiver: o.r, amount: String(t.amount), currency: o.currency, timestamp: t.timestamp, channel: o.channel, origin_country: o.origin, destination_country: o.dest, purpose: o.purpose };
    txns.push(t);
    return t;
  };
  const dayAt = (dayBack: number, hour = 10, min = 0) => {
    const d = new Date(now - dayBack * dayMs);
    d.setHours(hour, min, 0, 0);
    return d.getTime();
  };
  // Monthly cadence as fixed day-offsets: always in the past, never two
  // anchors collapsing onto the same date at a month boundary.
  const monthly = (monthsBack: number, anchorBack: number, hour: number) => {
    const d = new Date(now - (monthsBack * 30 + anchorBack) * dayMs);
    d.setHours(hour, Math.floor(rnd() * 50), 0, 0);
    return d.getTime();
  };

  const merch = ["SWIGGY", "ZOMATO", "AMAZON PAY", "FLIPKART", "BIGBASKET", "IRCTC", "UBER INDIA", "DMART", "BOOKMYSHOW", "DECATHLON", "CROMA", "RELIANCE FRESH"];
  const billers = ["BESCOM", "AIRTEL", "JIO RECHARGE", "TATA POWER"];
  const employers = ["SALARY · INFOSYS", "SALARY · TCS", "SALARY · WIPRO", "SALARY · HDFC BANK", "SALARY · STATE GOVT"];
  const intlJobs = [
    { from: "GULF EXCHANGE · DUBAI", cur: "AED", purpose: "SALARY CREDIT - GULF", origin: "AE" },
    { from: "WELLS FARGO · US REMITTANCE", cur: "USD", purpose: "FAMILY MAINTENANCE", origin: "US" },
    { from: "DBS · SINGAPORE", cur: "SGD", purpose: "CONSULTING FEES", origin: "SG" },
    { from: "BARCLAYS · LONDON", cur: "GBP", purpose: "TUITION FEE REFUND", origin: "GB" },
  ];
  // Everyday UPI amounts — deliberately below 2,500 and non-round so they
  // sit inside the dense common cluster (never own-z outliers, never ML tail).
  const SPENDS = [147, 892, 2340, 465, 1128, 378, 2415, 940, 1853, 592, 1265, 735, 2104, 486, 1396, 658];

  const used = new Set<string>();
  const personId = (i: number, salt = 0) => {
    let c = salt;
    let n = "";
    do {
      const k = i * 13 + c * 7 + 5;
      n = `${FIRST[(k * 3 + 1) % FIRST.length]} ${LAST[(k * 5 + 2) % LAST.length]} · ${BANKS[(k + c) % BANKS.length]} ••${1000 + ((k * 61 + 311) % 9000)}`;
      c++;
    } while (used.has(n));
    used.add(n);
    return n;
  };

  // — population layout —
  // 0–47 clean retail · 48–53 fan-in funders · 54 fan hub · 55–57 cycle ·
  // 58 pass-through hub · 59–60 silent beneficiaries · 61–63 businesses ·
  // 64 seasonal (dormant) · 65 cross-border buyer · 66 landlord · 67 burst
  const retail: string[] = [];
  for (let i = 0; i < 48; i++) retail.push(personId(i));
  const donors: string[] = [];
  for (let i = 0; i < 6; i++) donors.push(personId(100 + i));
  const hub = personId(200);
  const cycA = personId(210), cycB = personId(211), cycC = personId(212);
  const passHub = personId(220), passS1 = personId(221), passS2 = personId(222);
  const biz1 = personId(230), biz2 = personId(231), biz3 = personId(232);
  const seasonal = personId(240);
  const xbBuyer = personId(250);
  const landlord = personId(260);
  const burst = personId(270);
  const trader = "VEDANTA TRADERS";
  const cement = "SHREE CEMENTS DEALER";
  const suppliers = ["OKAYA LOGISTICS", "NIMBUS FREIGHT", "DELTA STEELS"];
  const clearing = "SETTLEMENT · CLEARING HOUSE";
  const aeVendor = "AL NOOR TRADING LLC · AE";

  // Benign retail routine: salary in, small varied spends every 5 days,
  // monthly bills, optional rent/family support, occasional salary corridor.
  // Anti-false-positive design (verified by scratch-verify-balanced.mjs):
  //  • salaries: employer (i%5) and pay-day (4+i%7) are decoupled, and the
  //    per-day salary ladder differs by ≥30% between adjacent days — no 48h
  //    window can hold 4 transfers within ±15% of its mean, so the split
  //    rule never fires on an employer batch.
  //  • rents (≈4k) and family support (≈4k) stay inside 1σ of the sender's
  //    own outflow baseline, so the velocity rule never fires on retail.
  //  • gift pay-day anchors are 3 days apart per index (i%6), the pair's
  //    anchors are forced to differ, and credits land at 21:00 — so a
  //    receiver can never forward ≥70% of a gift inside 24h (no spurious
  //    pass-through alerts), and no rent day falls the day after a credit.
  const SAL_BY_DAY = [29000, 43000, 59000, 78000, 33000, 52000, 68000]; // anchor days 4..10
  const retailRoutine = (i: number, id: string, opts: { rent?: boolean; gift?: boolean; intl?: boolean }) => {
    for (let m = 0; m < 3; m++) {
      mk({ s: employers[i % employers.length], r: id, amount: SAL_BY_DAY[i % 7] + (i % 5) * 200, currency: "INR", epoch: monthly(m, 4 + (i % 7), 9 + (i % 4)), origin: "IN", dest: "IN", channel: "NEFT", purpose: "SALARY CREDIT" });
    }
    for (let d = 6 + (i % 5); d <= 86; d += 5) {
      const m = merch[(i + d) % merch.length];
      mk({ s: id, r: m, amount: SPENDS[(i + d) % SPENDS.length] + ((i * 13 + d) % 41), currency: "INR", epoch: dayAt(d, 8 + ((i + d) % 13), (i * 7 + d) % 55), origin: "IN", dest: "IN", channel: "UPI", purpose: `UPI/${m.replace(/\s/g, "")}/MERCHANTPAY` });
    }
    for (let m = 0; m < 3; m++) {
      const b = billers[i % billers.length];
      mk({ s: id, r: b, amount: 249 + ((i * 11 + m * 37) % 2200), currency: "INR", epoch: monthly(m, 8 + (i % 3), 18), origin: "IN", dest: "IN", channel: m % 2 ? "UPI" : "NEFT", purpose: `BILLPAY/${b}` });
    }
    if (opts.rent) {
      for (let m = 0; m < 3; m++) {
        mk({ s: id, r: landlord, amount: 4000 + ((i + m) % 3) * 200, currency: "INR", epoch: monthly(m, 2, 11), origin: "IN", dest: "IN", channel: "NEFT", purpose: "HOUSE RENT" });
      }
    }
    if (opts.gift && i < 47) {
      for (let m = 0; m < 2; m++) {
        let j = i + 1 + ((i * 3 + m * 7) % (47 - i)); // strictly higher index → DAG, no accidental cycles
        if (j % 6 === i % 6) j = j + 1 < 47 ? j + 1 : j - 1; // pair must not share a pay-day anchor
        if (j === i) continue;
        mk({ s: id, r: retail[j], amount: 3900 + ((i + m) % 3) * 250, currency: "INR", epoch: monthly(m, 20 + (i % 6) * 3, 21), origin: "IN", dest: "IN", channel: "IMPS", purpose: "FAMILY SUPPORT" });
      }
    }
    if (opts.intl) {
      for (let m = 0; m < 2; m++) {
        const job = intlJobs[(i + m) % 4];
        // Days 11–54: first occurrence lands inside the model's known-pair
        // region (first 70% of the timeline) and amounts stay modest, so a
        // routine foreign salary has no ML reason beyond the corridor itself
        // and stays inside the dense cluster — these retail stay low risk.
        mk({ s: job.from, r: id, amount: 18000 + ((i * 9 + m * 17) % 11) * 1000, currency: job.cur, epoch: dayAt(51 - m * 20 + (i % 4), 10), origin: job.origin, dest: "IN", channel: "SWIFT", purpose: job.purpose });
      }
    }
  };

  for (let i = 0; i < 48; i++) {
    retailRoutine(i, retail[i], { rent: true, gift: i % 2 === 0 });
    personas.push({ id: retail[i], tier: "clean", why: "Regular salary + everyday UPI + scheduled bills; no rule conditions met" });
  }
  // Foreign-inward corridors land on non-persona filler accounts: keeps the
  // international analysis populated while persona labels stay independent of
  // the model's cross-border novelty scoring (which wobbles around its
  // threshold from day to day).
  for (let f = 0; f < 6; f++) retailRoutine(f, personId(400 + f), { intl: true });
  // Landlord: rent inflows ≈ 4k, own outflows ≤ 2.6k → pass-through share stays low.
  retailRoutine(67, landlord, {});
  personas.push({ id: landlord, tier: "clean", why: "Collects monthly rent (many funders, months apart → fan rule can't fire)" });

  // — planted cases: one per detection rule —

  // Fan-in (medium): collection hub whose ENTIRE inbound history is 5 donors
  // over 5 days — the fan rule needs ≥5 distinct funders with list span ≤144h.
  // Days chosen so no donor forwards ≥70% of its fan credit within 24h
  // (their rent credit lands on day 33 before the day-33 fan transfer).
  const FAN_DAYS = [29, 30, 31, 33, 34]; // span ≈ 5d (≤144h)
  for (let k = 0; k < 5; k++) {
    retailRoutine(1 + 3 * k, donors[k], { rent: true, intl: false });
    personas.push({ id: donors[k], tier: "medium", why: "Funder in the planted fan-in alert" });
    mk({ s: donors[k], r: hub, amount: 13000, currency: "INR", epoch: dayAt(FAN_DAYS[k], 12, k * 7), origin: "IN", dest: "IN", channel: "IMPS", purpose: "COMMUNITY FUND CONTRIBUTION" });
  }
  personas.push({ id: hub, tier: "medium", why: "Collection hub — 5 distinct funders inside 5 days (fan-in)" });
  const fanTx = txns.filter((t) => t.receiver === hub).map((t) => t.id);
  fanTx.forEach((txnId) => gt.push({ txnId, scenario: "fanin-1" }));
  scenarios.push({ kind: "fan-in", txnIds: fanTx, description: `5 funders → ${hub} within 5 days` });

  // Businesses: large payments but few in number — the velocity rule's ≥8-sends
  // gate never opens, so size alone stays unflagged (legit high-value activity).
  mk({ s: clearing, r: biz1, amount: 200000, currency: "INR", epoch: dayAt(18, 11), origin: "IN", dest: "IN", channel: "NEFT", purpose: "CLIENT RECEIPT" });
  mk({ s: biz1, r: trader, amount: 120000, currency: "INR", epoch: dayAt(45, 12), origin: "IN", dest: "IN", channel: "NEFT", purpose: "VENDOR PAYMENT" });
  mk({ s: clearing, r: biz2, amount: 180000, currency: "INR", epoch: dayAt(16, 11), origin: "IN", dest: "IN", channel: "NEFT", purpose: "CLIENT RECEIPT" });
  mk({ s: biz2, r: trader, amount: 90000, currency: "INR", epoch: dayAt(30, 12), origin: "IN", dest: "IN", channel: "NEFT", purpose: "VENDOR PAYMENT" });
  mk({ s: biz2, r: cement, amount: 140000, currency: "INR", epoch: dayAt(50, 12), origin: "IN", dest: "IN", channel: "RTGS", purpose: "SUPPLIER INVOICE" });
  mk({ s: clearing, r: biz3, amount: 150000, currency: "INR", epoch: dayAt(22, 11), origin: "IN", dest: "IN", channel: "NEFT", purpose: "CLIENT RECEIPT" });
  mk({ s: biz3, r: cement, amount: 95000, currency: "INR", epoch: dayAt(40, 12), origin: "IN", dest: "IN", channel: "NEFT", purpose: "SUPPLIER INVOICE" });
  mk({ s: biz3, r: trader, amount: 110000, currency: "INR", epoch: dayAt(60, 12), origin: "IN", dest: "IN", channel: "NEFT", purpose: "VENDOR PAYMENT" });
  personas.push({ id: biz2, tier: "medium", why: "Rule-clean, but the isolation model scores its six-figure invoices unusual — model surprise, not a rule hit" });
  personas.push({ id: biz3, tier: "medium", why: "Rule-clean, but the isolation model scores its six-figure invoices unusual — model surprise, not a rule hit" });
  personas.push({ id: clearing, tier: "medium", why: "Rule-clean settlement house — model ranks its 150–200k receipts in the unusual tail" });

  // Splitting (medium): five identical vendor payouts inside 20h.
  const splitIds: string[] = [];
  const s0 = dayAt(20, 11);
  for (let j = 0; j < 5; j++) {
    splitIds.push(mk({ s: biz1, r: trader, amount: 49500, currency: "INR", epoch: s0 + j * 5 * 3600e3, origin: "IN", dest: "IN", channel: "IMPS", purpose: "VENDOR PAYMENT" }).id);
  }
  splitIds.forEach((txnId) => gt.push({ txnId, scenario: "splitting-1" }));
  scenarios.push({ kind: "splitting", txnIds: splitIds, description: `5 × 49,500 IMPS from ${biz1} to ${trader} in 20h` });
  personas.push({ id: biz1, tier: "medium", why: "Planted structuring: 5 identical vendor payouts in 20h" });
  personas.push({ id: trader, tier: "medium", why: "Receiver in the planted splitting alert" });

  // Rapid pass-through (high): 99.5% of a 100k credit forwarded within 6h
  // (share ≥ 0.95 with ≥2 forwards is what escalates this to high).
  const p0 = mk({ s: clearing, r: passHub, amount: 100000, currency: "INR", epoch: dayAt(35, 10), origin: "IN", dest: "IN", channel: "NEFT", purpose: "CLIENT SETTLEMENT" });
  const p1 = mk({ s: passHub, r: passS1, amount: 95000, currency: "INR", epoch: dayAt(35, 14), origin: "IN", dest: "IN", channel: "IMPS", purpose: "ONWARD SETTLEMENT" });
  const p2 = mk({ s: passHub, r: passS2, amount: 4500, currency: "INR", epoch: dayAt(35, 16), origin: "IN", dest: "IN", channel: "IMPS", purpose: "BALANCE SWEEP" });
  [p0, p1, p2].forEach((t) => gt.push({ txnId: t.id, scenario: "passthrough-1" }));
  scenarios.push({ kind: "passthrough", txnIds: [p0.id, p1.id, p2.id], description: `${clearing}→${passHub}→beneficiaries within 6h (99.5% forwarded)` });
  personas.push({ id: passHub, tier: "high", why: "Forwards 99.5% of a 100k credit within 6 hours" });
  personas.push({ id: passS1, tier: "high", why: "Beneficiary named in the high-severity pass-through alert" });
  personas.push({ id: passS2, tier: "high", why: "Beneficiary named in the high-severity pass-through alert" });

  // Circular movement (high): A→B→C→A round trip in 60h (inside the 168h
  // cycle window; hops are >24h apart so nobody also trips the pass-through
  // rule). The only edge that breaks the retail DAG.
  const c0 = dayAt(40, 9);
  const legs = [
    mk({ s: cycA, r: cycB, amount: 75000, currency: "INR", epoch: c0, origin: "IN", dest: "IN", channel: "RTGS", purpose: "TRADE SETTLEMENT" }),
    mk({ s: cycB, r: cycC, amount: 75000, currency: "INR", epoch: c0 + 32 * 3600e3, origin: "IN", dest: "IN", channel: "RTGS", purpose: "TRADE SETTLEMENT" }),
    mk({ s: cycC, r: cycA, amount: 75000, currency: "INR", epoch: c0 + 60 * 3600e3, origin: "IN", dest: "IN", channel: "RTGS", purpose: "TRADE SETTLEMENT" }),
  ];
  legs.forEach((t) => gt.push({ txnId: t.id, scenario: "circular-1" }));
  scenarios.push({ kind: "circular", txnIds: legs.map((t) => t.id), description: `${cycA}→${cycB}→${cycC}→${cycA}` });
  personas.push({ id: cycA, tier: "high", why: "Planted A→B→C→A round trip (circular movement)" });
  personas.push({ id: cycB, tier: "high", why: "Planted round trip — middle node of the cycle" });
  personas.push({ id: cycC, tier: "high", why: "Planted round trip — returns funds to the origin" });

  // Dormant reactivation (low): a full-cadence seasonal shopper whose sends
  // stop for 61 days and then resume. Eight normal transfers keep the
  // account inside the dense cluster for the anomaly model, so the ONLY
  // signal is the dormant rule — severity low, robust to model wobble.
  const seasonalDays = [86, 81, 76, 71, 66, 5, 3, 1]; // gap 66 → 5 = 61 days (array is epoch order)
  let d2 = "";
  seasonalDays.forEach((d, k) => {
    const m = merch[k % 4];
    const t = mk({ s: seasonal, r: m, amount: SPENDS[(240 + k) % SPENDS.length] + ((k * 13) % 41), currency: "INR", epoch: dayAt(d, 9 + (k % 9), (k * 11) % 55), origin: "IN", dest: "IN", channel: "UPI", purpose: `UPI/${m.replace(/\s/g, "")}/MERCHANTPAY` });
    if (k === 5) d2 = t.id; // first transfer after the quiet period
  });
  gt.push({ txnId: d2, scenario: "dormant-1" });
  scenarios.push({ kind: "dormant", txnIds: [d2], description: `${seasonal} resumes after a 61-day closure (low severity)` });
  personas.push({ id: seasonal, tier: "low", why: "61-day seasonal closure then resume → dormant reactivation, severity low" });

  // Unusual cross-border movement (medium): single 620k IN→AE import payment.
  const xb = mk({ s: xbBuyer, r: aeVendor, amount: 620000, currency: "INR", epoch: dayAt(25, 11), origin: "IN", dest: "AE", channel: "SWIFT", purpose: "MACHINE IMPORT PAYMENT" });
  gt.push({ txnId: xb.id, scenario: "xborder-1" });
  scenarios.push({ kind: "xborder", txnIds: [xb.id], description: `620,000 INR ${xbBuyer} → ${aeVendor} (IN→AE)` });
  personas.push({ id: xbBuyer, tier: "medium", why: "Single import payment ≥500k across the IN→AE corridor" });
  personas.push({ id: aeVendor, tier: "medium", why: "Beneficiary of the cross-border alert" });

  // Velocity burst (high): 12 supplier invoices in 36h including four
  // six-figure outliers — global z>3 outliers + 8 transfers/day clears both
  // halves of the velocity condition (and big≥3 escalates it to high).
  const bSmall = [48700, 51200, 49500, 50400, 49800, 51000, 48900, 50600];
  // Big invoices deliberately differ by >15% pairwise so the split rule
  // cannot fire on the burst itself (which would flag the suppliers).
  const bBig = [250000, 362000, 271000, 405000];
  const burstIds: string[] = [];
  const b0 = dayAt(41, 6);
  for (let j = 0; j < 12; j++) {
    const big = j >= 8;
    const t = mk({
      s: burst, r: suppliers[j % 3], amount: big ? bBig[j - 8] : bSmall[j],
      currency: "INR", epoch: b0 + j * 3 * 3600e3, origin: "IN", dest: "IN",
      channel: big ? "RTGS" : "NEFT", purpose: "SUPPLIER INVOICE",
    });
    if (big) burstIds.push(t.id);
  }
  burstIds.forEach((txnId) => gt.push({ txnId, scenario: "velocity-1" }));
  scenarios.push({ kind: "velocity", txnIds: burstIds, description: `${burst}: 12 invoices in 36h, four ≥250k outliers` });
  personas.push({ id: burst, tier: "high", why: "12 invoices in 36h incl. four six-figure outliers (velocity burst)" });
  suppliers.forEach((s) => personas.push({ id: s, tier: "medium", why: "Rule-clean (inbound only) — model ranks the large incoming invoices unusual" }));

  txns.sort((x, y) => x.epoch - y.epoch);
  const header = ["transaction_id", "sender", "receiver", "amount", "currency", "timestamp", "channel", "origin_country", "destination_country", "purpose"];
  const csv = [header.join(","), ...txns.map((t) => header.map((h) => (t.raw as Record<string, string>)[h] ?? "").join(","))].join("\n");
  return {
    txns,
    manifest: { dataset: "Risk-graded sample", seed: 1907, generatedAt: new Date().toISOString(), scenarios, groundTruth: gt, personas },
    personas,
    csv,
  };
}
