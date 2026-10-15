// CSV parsing, schema inference, data-quality profiling.
// Minimalism: pure functions, no dependencies.

export interface ParsedTable {
  columns: string[];
  rows: Record<string, string>[];
  delimiter: string;
  encodingNote: string;
}

export function detectDelimiter(head: string): string {
  const cands = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = -1;
  for (const d of cands) {
    const n = head.split(d).length;
    if (n > bestCount) { bestCount = n; best = d; }
  }
  return best;
}

function splitLine(line: string, d: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === d && !inQ) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseCSV(text: string, maxRows = 20000): ParsedTable {
  const clean = text.replace(/^\uFEFF/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { columns: [], rows: [], delimiter: ",", encodingNote: "empty file" };
  const delimiter = detectDelimiter(lines[0]);
  const columns = splitLine(lines[0], delimiter).map((c, i) => c || `col_${i}`);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length && rows.length < maxRows; i++) {
    const cells = splitLine(lines[i], delimiter);
    const r: Record<string, string> = {};
    columns.forEach((c, j) => { r[c] = (cells[j] ?? "").trim(); });
    rows.push(r);
  }
  return { columns, rows, delimiter, encodingNote: "utf-8 assumed; BOM stripped" };
}

// ---- semantic mapping ----
export type SemanticField =
  | "txn_id" | "sender" | "receiver" | "amount" | "currency"
  | "timestamp" | "origin_country" | "dest_country" | "channel"
  | "purpose" | "status" | "ignore";

export interface FieldMapping {
  column: string;
  field: SemanticField | null;
  confidence: number; // 0..1
  alternatives: SemanticField[];
  dtype: string;
  missingPct: number;
  samples: string[];
}

const ALIASES: Record<SemanticField, string[]> = {
  txn_id: ["transaction_id", "txn_id", "reference", "utr", "payment_id", "id", "ref", "txn"],
  sender: ["sender", "sender_id", "from_account", "originator", "payer", "from", "debtor", "sender_account", "remitter"],
  receiver: ["receiver", "recipient", "beneficiary", "to_account", "to", "creditor", "payee", "receiver_account", "benef"],
  amount: ["amount", "transaction_amount", "value", "payment_value", "amt", "sum", "total", "inr", "price"],
  currency: ["currency", "currency_code", "ccy", "curr"],
  timestamp: ["timestamp", "transaction_date", "created_at", "datetime", "date", "time", "value_date", "txn_date"],
  origin_country: ["origin_country", "sender_country", "source_country", "from_country", "origin"],
  dest_country: ["destination_country", "receiver_country", "beneficiary_country", "to_country", "destination"],
  channel: ["method", "channel", "payment_type", "mode", "rail", "payment_method", "type"],
  purpose: ["purpose", "description", "narrative", "remarks", "details", "memo", "purpose_code"],
  status: ["status", "transaction_status", "state"],
  ignore: [],
};

function norm(s: string) { return s.toLowerCase().replace(/[^a-z0-9]/g, ""); }

export function inferType(values: string[]): string {
  const v = values.filter((x) => x !== "");
  if (v.length === 0) return "empty";
  const numN = v.filter((x) => /^-?[\d,]+(\.\d+)?$/.test(x)).length;
  if (numN / v.length > 0.8) return "numeric";
  const dateN = v.filter((x) => !Number.isNaN(Date.parse(x))).length;
  if (dateN / v.length > 0.7) return "datetime";
  const uniq = new Set(v).size;
  if (uniq / v.length < 0.2 && uniq < 50) return "categorical";
  return "text";
}

function scoreColumn(col: string, values: string[], field: SemanticField): number {
  const c = norm(col);
  let s = 0;
  for (const a of ALIASES[field]) {
    const na = norm(a);
    if (c === na) s = Math.max(s, 0.95);
    else if (c.includes(na) || na.includes(c)) s = Math.max(s, 0.7);
  }
  // value-shape boosts
  if (field === "amount" && inferType(values) === "numeric") s = Math.min(1, s + 0.15);
  if (field === "timestamp" && inferType(values) === "datetime") s = Math.min(1, s + 0.2);
  if ((field === "currency") && values.some((x) => /^[A-Z]{3}$/.test(x.trim()))) s = Math.min(1, s + 0.25);
  if ((field === "sender" || field === "receiver") && inferType(values) === "text") s = Math.min(1, s + 0.05);
  return s;
}

const FIELDS: SemanticField[] = ["txn_id","sender","receiver","amount","currency","timestamp","origin_country","dest_country","channel","purpose","status"];

export function inferMapping(table: ParsedTable): FieldMapping[] {
  return table.columns.map((col) => {
    const vals = table.rows.slice(0, 200).map((r) => r[col] ?? "");
    const missingPct = vals.length ? vals.filter((x) => x === "").length / vals.length : 1;
    const scored = FIELDS.map((f) => ({ f, s: scoreColumn(col, vals, f) })).sort((a, b) => b.s - a.s);
    const best = scored[0];
    return {
      column: col,
      field: best.s >= 0.4 ? best.f : null,
      confidence: Math.round(best.s * 100) / 100,
      alternatives: scored.slice(1, 4).map((x) => x.f),
      dtype: inferType(vals),
      missingPct: Math.round(missingPct * 1000) / 1000,
      samples: [...new Set(vals.filter(Boolean))].slice(0, 3),
    };
  });
}

// ---- quality report ----
export interface QualityReport {
  records: number;
  columns: number;
  missingByColumn: { column: string; pct: number }[];
  duplicateRows: number;
  duplicateIds: number;
  invalidAmounts: number;
  invalidDates: number;
  badCurrencies: string[];
  currencies: { code: string; n: number }[];
  channels: { name: string; n: number }[];
  minDate: string | null;
  maxDate: string | null;
  warnings: string[];
}

export interface NormalizedTxn {
  id: string;
  sender: string;
  receiver: string;
  amount: number;
  currency: string;
  timestamp: string;
  epoch: number;
  origin_country: string;
  dest_country: string;
  channel: string;
  purpose: string;
  status: string;
  raw: Record<string, string>;
}

export function buildMapping(col2field: Record<string, SemanticField | "">): Record<SemanticField, string | null> {
  const inv: Record<SemanticField, string | null> = {
    txn_id: null, sender: null, receiver: null, amount: null, currency: null,
    timestamp: null, origin_country: null, dest_country: null, channel: null,
    purpose: null, status: null, ignore: null,
  };
  for (const [col, f] of Object.entries(col2field)) {
    if (f && f !== "ignore") inv[f as SemanticField] = col;
  }
  return inv;
}

export function normalize(table: ParsedTable, map: Record<SemanticField, string | null>): { txns: NormalizedTxn[]; report: QualityReport } {
  const txns: NormalizedTxn[] = [];
  let invalidAmounts = 0, invalidDates = 0;
  const seenIds = new Map<string, number>();
  const seenRows = new Set<string>();
  let dupRows = 0;
  const curCount = new Map<string, number>();
  const chCount = new Map<string, number>();
  const badCur = new Set<string>();
  let minE = Infinity, maxE = -Infinity;

  table.rows.forEach((r, i) => {
    const key = JSON.stringify(r);
    if (seenRows.has(key)) dupRows++; else seenRows.add(key);
    const g = (f: SemanticField) => (map[f] ? (r[map[f]!] ?? "") : "");
    const idRaw = g("txn_id") || `row-${i + 1}`;
    seenIds.set(idRaw, (seenIds.get(idRaw) ?? 0) + 1);
    const amtRaw = g("amount").replace(/,/g, "");
    const amt = parseFloat(amtRaw);
    if (g("amount") && (amtRaw === "" || Number.isNaN(amt))) invalidAmounts++;
    const tsRaw = g("timestamp");
    let epoch = Date.parse(tsRaw);
    if (tsRaw && Number.isNaN(epoch)) { invalidDates++; epoch = NaN as unknown as number; }
    if (Number.isNaN(epoch)) epoch = Date.now();
    if (epoch < minE) minE = epoch;
    if (epoch > maxE) maxE = epoch;
    const cur = (g("currency") || "INR").toUpperCase().trim();
    if (!/^[A-Z]{3}$/.test(cur)) badCur.add(cur || "(blank)");
    curCount.set(cur, (curCount.get(cur) ?? 0) + 1);
    const ch = g("channel") || "unknown";
    chCount.set(ch, (chCount.get(ch) ?? 0) + 1);
    txns.push({
      id: idRaw, sender: g("sender") || "unknown", receiver: g("receiver") || "unknown",
      amount: Number.isNaN(amt) ? 0 : amt, currency: cur,
      timestamp: tsRaw || new Date(epoch).toISOString(), epoch,
      origin_country: g("origin_country") || "IN", dest_country: g("dest_country") || "IN",
      channel: ch, purpose: g("purpose"), status: g("status") || "completed", raw: r,
    });
  });

  const missingByColumn = table.columns.map((c) => ({
    column: c,
    pct: Math.round((table.rows.filter((r) => !r[c]).length / Math.max(1, table.rows.length)) * 1000) / 1000,
  }));
  let dupIds = 0;
  seenIds.forEach((n) => { if (n > 1) dupIds += n - 1; });

  const warnings: string[] = [];
  if (!map.sender || !map.receiver) warnings.push("Counterparty columns missing — network and pass-through analysis unavailable (Tier 2/3).");
  if (!map.amount) warnings.push("Amount column missing — value-based rules disabled.");
  if (!map.timestamp) warnings.push("Timestamp missing — velocity and time-window rules disabled.");
  if (dupIds > 0) warnings.push(`${dupIds} duplicate reference(s) — possible retries or double-counting.`);
  if (invalidAmounts > 0) warnings.push(`${invalidAmounts} invalid amount(s) treated as 0.`);
  if (badCur.size > 0) warnings.push(`Unrecognized currency values: ${[...badCur].slice(0, 5).join(", ")}.`);

  return {
    txns,
    report: {
      records: table.rows.length, columns: table.columns.length, missingByColumn,
      duplicateRows: dupRows, duplicateIds: dupIds, invalidAmounts, invalidDates,
      badCurrencies: [...badCur],
      currencies: [...curCount.entries()].map(([code, n]) => ({ code, n })).sort((a, b) => b.n - a.n).slice(0, 12),
      channels: [...chCount.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n).slice(0, 12),
      minDate: Number.isFinite(minE) ? new Date(minE).toISOString() : null,
      maxDate: Number.isFinite(maxE) ? new Date(maxE).toISOString() : null,
      warnings,
    },
  };
}

export function readiness(map: Record<SemanticField, string | null>): { tier: 1|2|3|4; score: number; supported: string[]; missing: string[] } {
  const has = (f: SemanticField) => !!map[f];
  const supported: string[] = [];
  const missing: string[] = [];
  if (has("sender") && has("receiver") && has("amount") && has("timestamp")) {
    supported.push("velocity", "splitting", "pass-through", "fan-in/fan-out", "cycles", "behaviour", "network", "ML anomaly");
    return { tier: 1, score: 95, supported, missing };
  }
  if (has("amount") || has("timestamp") || has("sender")) {
    if (has("amount")) supported.push("value distribution", "outlier scan");
    if (has("timestamp")) supported.push("volume trend");
    if (!has("sender") || !has("receiver")) missing.push("counterparty graph");
    if (!has("timestamp")) missing.push("time-window rules");
    if (!has("amount")) missing.push("value rules");
    return { tier: 2, score: 55, supported, missing };
  }
  return { tier: 3, score: 30, supported: ["data profile", "distributions"], missing: ["transaction monitoring"] };
}

export function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}
