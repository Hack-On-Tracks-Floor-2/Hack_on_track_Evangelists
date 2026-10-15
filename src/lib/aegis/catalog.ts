// Aegis service catalog — the bookable, purchasable items customers browse.
export interface CatalogItem {
  id: string;
  title: string;
  tagline: string;
  description: string;
  price: number;
  currency: string;
  unit: string;
  color: string;
  duration: string;
  includes: string[];
  technical: string;
}

export const CATALOG: CatalogItem[] = [
  {
    id: "health-check",
    title: "Transaction Health Check",
    tagline: "Upload a CSV, get answers in an hour.",
    description:
      "Our flagship review. Bring any transaction export and we will map the columns, profile the data quality, and run the full detection suite with you. You leave with an evidence pack you can hand to anyone.",
    price: 149, currency: "USD", unit: "per dataset", color: "#4F46E5",
    duration: "60 min session",
    includes: ["Column mapping with you", "Data-quality report", "Full detection run", "Evidence pack export"],
    technical: "datasets.upload → mapping.confirm → detection.run · tier1 needs sender + receiver + amount + timestamp",
  },
  {
    id: "xborder-review",
    title: "Cross-Border Payment Review",
    tagline: "Corridors, intermediaries, and context.",
    description:
      "For teams moving money across borders. We trace the route country by country, check the intermediaries, and separate genuine trade payments from patterns that deserve a second look.",
    price: 249, currency: "USD", unit: "per review", color: "#0891B2",
    duration: "90 min session",
    includes: ["Route tracing", "Intermediary check", "Corridor benchmarking", "Reviewer-ready summary"],
    technical: "origin_country != dest_country → corridor novelty + amount deviation · normalized at tx-date rate",
  },
  {
    id: "fx-briefing",
    title: "FX & Currency Briefing",
    tagline: "Know what your money is really worth.",
    description:
      "A friendly walkthrough of your currency exposure using live market data and daily reference rates. We compare quotes, explain spreads in plain language, and show what rate movements mean for your totals.",
    price: 79, currency: "USD", unit: "per session", color: "#059669",
    duration: "30 min session",
    includes: ["Exposure snapshot", "Quote vs reference compare", "Conversion playbook", "Open Q&A"],
    technical: "fx.quotes state in {live, delayed, cached, reference} · converted = amount × dest-per-source",
  },
  {
    id: "team-workshop",
    title: "Team Detection Workshop",
    tagline: "Teach your whole crew to read alerts.",
    description:
      "A playful, hands-on session where your team works real (synthetic) cases: splitting schemes, pass-throughs, circular flows. Everyone learns to read evidence without the jargon.",
    price: 399, currency: "USD", unit: "per team", color: "#DB2777",
    duration: "2 hour session",
    includes: ["5 guided cases", "Evidence-reading drills", "Rule-tuning playground", "Take-home playbook"],
    technical: "studio.generate(seed) → manifest.scenarios · labels never leak into features",
  },
  {
    id: "network-deepdive",
    title: "Network Deep Dive",
    tagline: "See how the money actually moves.",
    description:
      "We turn your transaction history into a relationship map: who funds whom, where it pools, where it fans out. Circular routes and hub accounts light up so you can ask the right questions.",
    price: 199, currency: "USD", unit: "per map", color: "#EA580C",
    duration: "60 min session",
    includes: ["Relationship graph", "Hub & cycle highlights", "Entity profiles", "Annotated export"],
    technical: "nodes = accounts, edges = transfers · cycles ≤ 4 hops · degree-weighted layout",
  },
  {
    id: "audit-pack",
    title: "Audit-Ready Evidence Pack",
    tagline: "Serious paperwork, zero headaches.",
    description:
      "For the premium tier of peace of mind. We compile every finding, method, limitation, and timestamp into a signed, audit-ready pack your auditors will actually enjoy reading.",
    price: 299, currency: "USD", unit: "per pack", color: "#7C3AED",
    duration: "Delivered in 3 days",
    includes: ["Signed summary", "Full evidence appendix", "Method & limitation notes", "Analyst walkthrough call"],
    technical: "reports.export(format=pdf, includes=[evidence, methods, limitations, timestamps])",
  },
];

export function searchCatalog(q: string): CatalogItem[] {
  const s = q.trim().toLowerCase();
  if (!s) return CATALOG;
  return CATALOG.filter((c) =>
    (c.title + " " + c.tagline + " " + c.description).toLowerCase().includes(s),
  );
}
