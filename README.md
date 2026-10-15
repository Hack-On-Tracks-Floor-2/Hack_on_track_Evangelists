# TRACE Intelligence — Every transaction tells a story. Connect the evidence.

Dark fintech workspace (default) + optional light theme. `/` redirects to `/dashboard`.
Stack: React + TypeScript + Tailwind v4 + shadcn/ui + Lucide + TanStack Query (FX server state) +
React Router, Cytoscape.js (network), Recharts, Convex backend. `tsc -b --noEmit` clean.

## Implementation checklist (all routes live, no placeholders)

- [x] `/dashboard` — KPIs with sparklines, activity chart (count/value), detection donut, domestic vs intl,
      currency exposure, network snapshot, recent-alerts table. Filters: scope, dataset, range, currency, category.
- [x] `/datasets` — library (open, preview, profile, run, download, delete with confirm).
- [x] `/datasets/new` — 6-step CSV wizard: select → inspect → map (Confirmed/Suggested/Requires Review) →
      configure (unsupported modes disabled with reasons) → run (real staged progress) → results via detail page.
- [x] `/datasets/:id` — rows, quality report, scenario manifest, exports.
- [x] `/studio`, `/demo` — split layout, deterministic generation, NL→spec parser (offline template),
      preview/download/save/run/evaluate/reset. Synthetic always labelled; labels never leak into features.
- [x] `/domestic` — INR KPIs, in/out volume, channel distribution (data-only labels), hourly activity,
      7 detection tabs opening evidence. No banking-integration claims.
- [x] `/international` — corridor bars (click filters), value-by-currency, review-signal alert list.
- [x] `/transactions`, `/monitoring` — searchable/filterable ledger, pagination, exact-record drawer, filtered export.
- [x] `/detections` — stat row, 7 filters, dense table, rapid-inspection drawer. Scores labelled risk-priority, not probability.
- [x] `/detections/:id` — two-column workbench: evidence/timeline/transactions/legitimate-explanation/checks/missing-context
      + status, versions, notes, actions (reviewed / escalate→case / false-positive / reviewing / export / audit).
- [x] `/network` — Cytoscape canvas (blue neutral nodes, amber highlights, teal selection), search/zoom/filters,
      cycle + fan-in/out detection, reset, JSON export, node/edge context panel. Nothing invented.
- [x] `/entities`, `/entities/:id` — searchable table + profiles (history, baseline, alerts, timeline, notes, provenance).
- [x] `/fund-flows`, `/flows` — directed 2-hop sequences with currency-aware totals and txn IDs.
- [x] `/fx-market` — terminal quote table (pair/quote/bid/ask/spread/change/status), pair panel with reference history,
      watchlist, provider metadata, observed-quote stream. States: live/delayed/cached/reference/unavailable/loading.
- [x] `/fx-converter` — market vs reference modes, swap, fee, basket totals, history log. Formula shown; indicative only.
- [x] `/fx-history` — pair/range/source selectors, chart + table views, stats, actual-data CSV export.
- [x] `/rules` — table (fields, config, status, version, test), threshold edits validated, rule-logic drawer.
- [x] `/models`, `/evaluation` — detector versions, measured precision/recall/F1/confusion counts/scenario recall,
      rules-only vs full comparison; "Not evaluated yet" without manifests. Nothing fabricated.
- [x] `/reports` — quality, detection, evidence, FX log, evaluation downloads from real data.
- [x] `/investigations`, `/investigations/:id` — cases with filters, persistent status/notes, linked alerts.
- [x] `/audit` — actor/action/record/outcome table with filters + event-detail drawer.
- [x] `/settings`, `/governance` — workspace, provider, notification, retention settings persisted locally.
- [x] Portal (kept working): `/catalog`, `/catalog/:id`, `/bookings`, `/checkout`, `/community`, `/admin`.
- [x] Shell: sectioned collapsible sidebar, breadcrumbs, dataset selector, global search, notifications,
      theme toggle, user menu, mobile drawer + mobile search. Reduced-motion respected.

## Honest states

- FX: keyless providers (`open.er-api.com` live, Frankfurter/ECB reference). Offline → explicit
  cached/unavailable, last-known marked stale. One-second refresh is a *target*; provider cadence governs.
- Isolation Forest: not fitted (stated in UI); z-score anomaly ships. No AI LLM wired: NL studio uses an
  offline template parser; generation is always deterministic code.
- Datasets persist in-browser (localStorage); library metadata/cases/bookings/orders/posts/audit persist in Convex.
- No test suite in repo: verified via `convex dev --once` + `tsc -b --noEmit` (both green) and code review.
- No live-bank / SWIFT / UPI integration claimed anywhere. Country/channel/amount alone never decide alerts.
