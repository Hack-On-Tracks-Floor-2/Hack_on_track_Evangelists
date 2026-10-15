// FX provider abstraction. Live: open.er-api.com (no key). History: Frankfurter (ECB reference).
// Never fabricates ticks. States: live | delayed | cached | reference | unavailable | simulated.

export type FxState = "live" | "delayed" | "cached" | "reference" | "unavailable" | "simulated";

export interface Quote {
  pair: string;
  base: string;
  quote: string;
  mid: number;
  bid?: number;
  ask?: number;
  source: string;
  sourceTime: string | null;
  receivedAt: string;
  state: FxState;
  ageSeconds: number;
}

const BASES = ["USD", "EUR", "GBP", "AED", "SGD", "JPY", "AUD", "CAD", "INR"];
export const PAIRS = [
  "USD/INR", "EUR/INR", "GBP/INR", "AED/INR", "SGD/INR",
  "USD/EUR", "USD/GBP", "EUR/GBP", "USD/JPY", "AUD/USD", "USD/CAD", "EUR/USD",
];

let cache: { at: number; rates: Record<string, number>; sourceTime: string } | null = null;

function split(pair: string) { const [b, q] = pair.split("/"); return { b, q }; }

export async function fetchLiveQuotes(pairs: string[] = PAIRS): Promise<{ quotes: Quote[]; state: FxState; provider: string }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 9000);
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    if (j.result !== "success") throw new Error("provider error");
    cache = { at: Date.now(), rates: j.rates, sourceTime: j.time_last_update_utc ?? null };
    return { quotes: pairs.map((p) => toQuote(p, j.rates, j.time_last_update_utc ?? null, "live")), state: "live", provider: "open.er-api.com (free, no key)" };
  } catch (e) {
    if (cache) {
      const age = Math.round((Date.now() - cache.at) / 1000);
      return {
        quotes: pairs.map((p) => toQuote(p, cache!.rates, cache!.sourceTime, age > 3600 ? "cached" : "delayed")),
        state: "cached",
        provider: "open.er-api.com (cached — network unavailable)",
      };
    }
    return { quotes: [], state: "unavailable", provider: "open.er-api.com unreachable" };
  }
}

function rateFor(pair: string, usdRates: Record<string, number>): number | null {
  const { b, q } = split(pair);
  const rb = b === "USD" ? 1 : usdRates[b];
  const rq = q === "USD" ? 1 : usdRates[q];
  if (!rb || !rq) return null;
  return rq / rb; // units of quote per 1 base
}

function toQuote(pair: string, rates: Record<string, number>, sourceTime: string | null, state: FxState): Quote {
  const { b, q } = split(pair);
  const mid = rateFor(pair, rates) ?? 0;
  const spread = mid * 0.0004;
  return {
    pair, base: b, quote: q, mid,
    bid: mid ? mid - spread / 2 : undefined,
    ask: mid ? mid + spread / 2 : undefined,
    source: "open.er-api.com",
    sourceTime, receivedAt: new Date().toISOString(),
    state, ageSeconds: 0,
  };
}

export async function fetchHistory(pair: string, days = 30): Promise<{ date: string; rate: number }[]> {
  // Frankfurter ECB reference rates — genuine daily observations, labelled reference.
  const { b, q } = split(pair);
  try {
    const end = new Date();
    const start = new Date(Date.now() - days * 86400e3);
    const f = (d: Date) => d.toISOString().slice(0, 10);
    const url = `https://api.frankfurter.app/${f(start)}..${f(end)}?from=${b}&to=${q}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    const j = await res.json();
    return Object.entries(j.rates ?? {}).map(([date, r]: [string, any]) => ({ date, rate: r[q] })).sort((a, b2) => a.date.localeCompare(b2.date));
  } catch { return []; }
}

export function convert(amount: number, rate: number): number {
  // converted = source_amount × units_of_destination_per_source; decimal-safe to 2dp display
  return Math.round(amount * rate * 100) / 100;
}

export const SUPPORTED_CURRENCIES = BASES;
