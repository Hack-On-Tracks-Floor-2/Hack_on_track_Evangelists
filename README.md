# Aegis (customer portal + financial-intelligence workspace)

Tagline: **Every transaction tells a story.**

Aegis serves the customers of the business: sign up and log in, see your own dashboard,
browse and search the service catalog, open detail pages, book times, pay at checkout,
post your own content, and message or comment — with an admin area managing it all.
The original CSV analysis workspace (datasets, detection, network, FX, cases) is unchanged.

v1 scope: **analyse uploaded CSVs** for a **compliance team**. Minimalism theme, near-monochrome, tabular numerals.

## What v1 does
- **Arbitrary CSV intake** (`/datasets`): drag-and-drop, delimiter detection, type inference, confidence-scored semantic mapping, manual override, ambiguous sender/beneficiary confirmation, Tier 1–3 readiness, data-quality report. Files ≤25 MB / 20k rows, parsed locally.
- **Detection** (`/detections`, `/monitoring`): splitting, velocity burst, pass-through, fan-in/out, cycles (bounded), dormancy, behaviour deviation, cross-border large-leg. Every alert cites transaction IDs, evidence, legitimate explanations, checks, limitations. Scores are **priorities 0–100, not probabilities**.
- **Overview** (`/dashboard`, `/domestic`, `/international`): real metrics, volume trend, severity/category splits, per-currency values (never summed across currencies), FX snapshot.
- **Network** (`/network`, `/flows`, `/entities`): topological SVG graph (no invented coordinates), entity ranking, fund-flow legs with sample IDs.
- **Studio / demo** (`/studio`, `/demo`): deterministic generator (seeded) with planted splitting / pass-through / circular scenarios + ground-truth manifest kept separate from detection inputs. Plain-English → spec parser works offline.
- **FX** (`/fx-market`, `/fx-history`, `/fx-converter`): live quotes from `open.er-api.com` (no key), history from Frankfurter/ECB daily reference. States labelled live / delayed / cached / reference / unavailable — never fabricated. Converter validates quote direction: `converted = amount × destination-per-source`.
- **Cases + audit** (`/investigations`, `/audit`): Convex-persisted cases, notes, status, audit trail.
- **Governance** (`/rules`, `/models`, `/evaluation`, `/reports`, `/settings`): rule toggles + threshold edits, model card (z-score v1, no label leakage), measured precision/recall/F1 only when a manifest exists else "Not evaluated yet", real-data exports.

## Run
- `bun install` · `bun convex dev --once` · `bun tsc -b --noEmit`
- Dev server and Convex are managed by the platform; just edit files.

## Honest boundaries
- No live-bank / SWIFT / UPI-infrastructure connection is claimed; channel labels describe file contents.
- Country/channel/amount alone never decide an alert. Wording stays neutral ("possible", "potential").
- FX mids are indicative, never executable offers. Reference rates are daily, not ticks.
- Synthetic sets are always labelled; manifests never feed detection features.

## Demo script (5 min)
1. `/datasets` → Load demo → confirm mapping → open detail → quality warnings.
2. `/detections` → open a splitting alert → evidence + timeline → escalate to case.
3. `/network` → hover edges for txn IDs → entity table.
4. `/fx-market` → watchlist + history → `/fx-converter` → convert + record.
5. `/studio` → generate with seed → save → `/evaluation` → measured precision/recall + scenario recall.
