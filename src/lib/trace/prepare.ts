// Cleaning + verification engine for uploaded CSVs.
// Runs BEFORE schema mapping: trims, drops empties/duplicates, repairs amounts,
// dates, currencies and countries in detected columns. Every action is logged —
// nothing is silently dropped. Pure functions, no dependencies.
import type { ParsedTable } from "./csv";

export interface CleaningOp {
  step: string;
  detail: string;
}

export interface PreparedTable {
  columns: string[];
  rows: Record<string, string>[];
  ops: CleaningOp[];
  rowsIn: number;
  rowsOut: number;
  droppedEmpty: number;
  droppedDuplicates: number;
  cellsFixed: number;
  issues: string[];
}

const lc = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const isAmountCol = (c: string) => ["amount", "value", "amt", "total", "price", "inr", "paymentvalue", "transactionamount"].some((k) => lc(c).includes(k));
const isDateCol = (c: string) => ["date", "time", "timestamp", "datetime", "day", "createdat", "valuedate", "txndate"].some((k) => lc(c).includes(k));
const isCurrencyCol = (c: string) => ["currency", "ccy", "curr", "currencycode"].some((k) => lc(c).includes(k));
const isCountryCol = (c: string) => ["country", "origin", "destination"].some((k) => lc(c).includes(k));

/** Strip symbols/commas/spaces; handle (1,000) and trailing-minus accounting negatives. */
export function cleanAmount(raw: string): { value: string; fixed: boolean } {
  const t = raw.trim();
  if (!t) return { value: "", fixed: false };
  let neg = false;
  let s = t;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/-$/.test(s)) { neg = true; s = s.slice(0, -1); }
  s = s.replace(/[₹$€£,\s]/g, "").replace(/[a-zA-Z]+/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return { value: t, fixed: false };
  const n = (neg ? -1 : 1) * parseFloat(s);
  const out = String(Math.round(n * 100) / 100);
  return { value: out, fixed: out !== t };
}

const CUR_MAP: Record<string, string> = {
  rupee: "INR", rupees: "INR", rs: "INR", inr: "INR",
  dollar: "USD", dollars: "USD", usd: "USD", us: "USD",
  euro: "EUR", eur: "EUR", dirham: "AED", aed: "AED",
  pound: "GBP", gbp: "GBP", sgd: "SGD", singapore: "SGD",
};

export function cleanCurrency(raw: string): { value: string; fixed: boolean } {
  const t = raw.trim();
  if (!t) return { value: "", fixed: false };
  const sym = t.replace("₹", "INR").replace("$", "USD").replace("€", "EUR").replace("£", "GBP").trim();
  const letters = sym.replace(/[^a-zA-Z]/g, "");
  const mapped = CUR_MAP[letters.toLowerCase()];
  if (mapped && mapped !== t) return { value: mapped, fixed: true };
  const up = letters.toUpperCase();
  if (/^[A-Z]{3}$/.test(up) && up !== t) return { value: up, fixed: true };
  return { value: t, fixed: false };
}

const COUNTRY_MAP: Record<string, string> = {
  india: "IN", usa: "US", unitedstates: "US", unitedstatesofamerica: "US",
  uae: "AE", unitedarabemirates: "AE", dubai: "AE",
  uk: "GB", unitedkingdom: "GB", britain: "GB",
  singapore: "SG", germany: "DE", france: "FR", canada: "CA", australia: "AU",
};

export function cleanCountry(raw: string): { value: string; fixed: boolean } {
  const t = raw.trim();
  if (!t) return { value: "", fixed: false };
  const mapped = COUNTRY_MAP[lc(t)];
  if (mapped) return { value: mapped, fixed: mapped !== t };
  const up = t.toUpperCase();
  if (up !== t) return { value: up, fixed: true };
  return { value: t, fixed: false };
}

/** Parse human + machine date formats to ISO. Returns null when unparseable. */
export function parseFlexibleDate(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^\d{10}$/.test(t)) return new Date(Number(t) * 1000).toISOString();
  if (/^\d{13}$/.test(t)) return new Date(Number(t)).toISOString();
  const direct = Date.parse(t);
  if (!Number.isNaN(direct)) return new Date(direct).toISOString();
  const dmY = t.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dmY) {
    const dd = Number(dmY[1]), mm = Number(dmY[2]);
    let yyyy = Number(dmY[3]);
    if (yyyy < 100) yyyy += 2000;
    // Disambiguate DD-MM vs MM-DD: values above 12 must be the day.
    const dayFirst = dd > 12 || mm > 12 ? dd > 12 : true;
    const day = dayFirst ? dd : mm;
    const mon = dayFirst ? mm : dd;
    if (mon >= 1 && mon <= 12 && day >= 1 && day <= 31) {
      const d = new Date(Date.UTC(yyyy, mon - 1, day, Number(dmY[4] ?? 0), Number(dmY[5] ?? 0), Number(dmY[6] ?? 0)));
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
  }
  const ymd = t.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (ymd) {
    const d = new Date(Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])));
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

export function prepareTable(table: ParsedTable): PreparedTable {
  const ops: CleaningOp[] = [];
  const issues: string[] = [];
  const rowsIn = table.rows.length;
  let cellsFixed = 0;

  const amtCols = table.columns.filter(isAmountCol);
  const dateCols = table.columns.filter(isDateCol);
  const curCols = table.columns.filter(isCurrencyCol);
  const ctyCols = table.columns.filter(isCountryCol);

  // 1. Trim + drop fully-empty rows.
  let droppedEmpty = 0;
  const trimmed = table.rows.filter((r) => {
    let empty = true;
    for (const c of table.columns) {
      const v = (r[c] ?? "").trim();
      r[c] = v;
      if (v) empty = false;
    }
    if (empty) { droppedEmpty++; return false; }
    return true;
  });
  if (droppedEmpty > 0) ops.push({ step: "Drop empty rows", detail: `${droppedEmpty} fully-blank row(s) removed` });
  else ops.push({ step: "Drop empty rows", detail: "no fully-blank rows found" });

  // 2. Repair amounts / dates / currencies / countries in detected columns.
  let amtFixed = 0, dateFixed = 0, curFixed = 0, ctyFixed = 0;
  const badAmtByCol = new Map<string, number>();
  const badDateByCol = new Map<string, number>();
  for (const r of trimmed) {
    for (const c of amtCols) {
      const v = r[c] ?? "";
      if (!v) continue;
      const { value, fixed } = cleanAmount(v);
      if (fixed) { r[c] = value; amtFixed++; cellsFixed++; }
      else if (!/^-?\d+(\.\d+)?$/.test(value)) badAmtByCol.set(c, (badAmtByCol.get(c) ?? 0) + 1);
    }
    for (const c of dateCols) {
      const v = r[c] ?? "";
      if (!v) continue;
      const iso = parseFlexibleDate(v);
      if (iso && iso !== v) { r[c] = iso; dateFixed++; cellsFixed++; }
      else if (!iso) badDateByCol.set(c, (badDateByCol.get(c) ?? 0) + 1);
    }
    for (const c of curCols) {
      const v = r[c] ?? "";
      if (!v) continue;
      const { value, fixed } = cleanCurrency(v);
      if (fixed) { r[c] = value; curFixed++; cellsFixed++; }
    }
    for (const c of ctyCols) {
      const v = r[c] ?? "";
      if (!v) continue;
      const { value, fixed } = cleanCountry(v);
      if (fixed) { r[c] = value; ctyFixed++; cellsFixed++; }
    }
  }
  if (amtCols.length) ops.push({ step: "Repair amounts", detail: `${amtFixed} value(s) normalised across ${amtCols.join(", ")}` });
  if (dateCols.length) ops.push({ step: "Repair dates", detail: `${dateFixed} date(s) converted to ISO across ${dateCols.join(", ")}` });
  if (curCols.length) ops.push({ step: "Repair currencies", detail: `${curFixed} code(s) normalised across ${curCols.join(", ")}` });
  if (ctyCols.length) ops.push({ step: "Repair countries", detail: `${ctyFixed} name(s) mapped to ISO codes across ${ctyCols.join(", ")}` });
  badAmtByCol.forEach((n, c) => issues.push(`Column "${c}": ${n} non-numeric amount(s) will be treated as 0 by the analyser`));
  badDateByCol.forEach((n, c) => issues.push(`Column "${c}": ${n} unparseable date(s) will fall back to ingestion order`));

  // 3. Drop exact-duplicate rows.
  const seen = new Set<string>();
  let droppedDuplicates = 0;
  const deduped = trimmed.filter((r) => {
    const k = JSON.stringify(r);
    if (seen.has(k)) { droppedDuplicates++; return false; }
    seen.add(k);
    return true;
  });
  ops.push({ step: "Drop duplicates", detail: droppedDuplicates > 0 ? `${droppedDuplicates} exact-duplicate row(s) removed` : "no exact duplicates found" });

  // 4. Verify: report coverage for the detection engine.
  const colSet = new Set(table.columns.map(lc));
  const hasParty = [...colSet].some((c) => ["sender", "from", "payer", "remitter", "receiver", "beneficiary", "payee", "to"].some((k) => c.includes(k)));
  const hasAmt = amtCols.length > 0;
  const hasDate = dateCols.length > 0;
  ops.push({
    step: "Verify coverage",
    detail: `${table.columns.length} columns · ${deduped.length} rows · parties ${hasParty ? "found" : "MISSING"} · amounts ${hasAmt ? "found" : "MISSING"} · dates ${hasDate ? "found" : "MISSING"}`,
  });
  if (!hasParty) issues.push("No counterparty columns detected — network and pass-through rules will stay disabled");
  if (!hasAmt) issues.push("No amount column detected — value-based rules will stay disabled");
  if (!hasDate) issues.push("No date column detected — time-window rules will stay disabled");

  return {
    columns: table.columns, rows: deduped, ops,
    rowsIn, rowsOut: deduped.length,
    droppedEmpty, droppedDuplicates, cellsFixed, issues,
  };
}
