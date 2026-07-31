# OCIE — Oncology Guidelines Intelligence Engine

Interactive dashboard for NSCLC drug-to-guideline mapping by **stage**, **biomarker**, and **line of therapy**. Shows current Standard of Care (NCCN/ASCO), pipeline trials, white-space gaps, and FDA timeline projections.

**Fully self-contained** — runs 100% on committed local data. No database, no cloud services, no API keys.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000

That's it. All data is in `data/*.json` and committed to the repo.

## Stack

- **Next.js 16** (App Router) + **TypeScript** + React 19
- **Tailwind CSS 4** for styling
- **No database** — data loaded from local JSON files at runtime
- **No env vars required**

## Dashboard modules

| Tab | What it shows |
|---|---|
| Current SOC | NCCN/ASCO guideline regimens, filterable by Stage (Metastatic / Stage III / All), biomarker, regimen type, histology, line of therapy |
| Pipeline / Trials | Industry-sponsored NSCLC trials from ClinicalTrials.gov, with FDA approval timeline projections |
| White Space | Biomarker × line-of-therapy gaps with gap scoring (preferred coverage + active trials) |
| Insights | Data-derived insights across SOC and pipeline |

## Data files (all committed)

| File | Contents |
|---|---|
| `data/soc_data.json` | **82 SOC regimens** — 62 Metastatic (Stage IV) + 20 Stage III, each tagged with `stage`, biomarker, tier, histology, notes, PD-L1, patient population |
| `data/pipeline_dashboard.json` | 186 pipeline trials / 50 drugs from ClinicalTrials.gov (fetched 2026-07-30) |
| `data/stage3_pipeline.json` | 5 hand-curated Stage III trials |
| `data/timeline_benchmarks.json` | 36 benchmark rows: months-to-SOC by biomarker × stage × segment |
| `data/phase_duration_lookups.json` | 12 rows: phase-duration lookup tables (p25/p50/p75) |
| `data/nct_mapping.json` | Drug → NCT ID mapping |
| `data/Clinical_Trials_NSCLC_with_PatientPop.xlsx` | Raw clinical trials source data |
| `data/Current Treatment mapping(NCCN_ASCO) for NSCLC.xlsx` | Raw Stage IV SOC source mapping |
| `data/NSCLC_Treatment_Mapping_with_PDL1.xlsx` | Raw SOC mapping with PD-L1 detail |

## Regenerating data (optional)

The committed data is up to date; refresh only if you want to re-pull or re-derive it.

```bash
# Re-fetch pipeline data from ClinicalTrials.gov (needs internet, no keys)
npm run data:refresh-pipeline

# Rebuild timeline benchmark lookups from approved-drug timelines
npm run data:refresh-benchmarks

# Validate lookup tables and model integrity
npm run data:validate
```

## Timeline estimator

The Pipeline tab projects when a trial drug reaches SOC using a JSON-backed lookup chain (no ML runtime):

1. `timeline_benchmarks.json` — biomarker + stage + segment match
2. `timeline_benchmarks.json` — Any + stage + segment match
3. `phase_duration_lookups.json` — phase + stage match
4. `phase_duration_lookups.json` — phase + Any match
5. Static default values

The underlying model research (additive model vs Bayesian) lives in `timeline-ml/` in a separate repo.

## Project structure

```
src/
  app/          # Next.js App Router (page.tsx loads local data)
  components/   # Dashboard, InsightsTab, CompanyHeatmap
  lib/
    db.ts                 # Loads all data from data/*.json
    timeline-estimator.ts # Timeline projection lookup chain
  types/        # Shared TypeScript types + filter logic
data/           # All source + derived data (committed)
scripts/        # Data validation & refresh scripts
```

## How the data flows

```
data/*.json ──> src/lib/db.ts (fs.readFileSync) ──> page.tsx ──> Dashboard components
```

No network calls at runtime. The dashboard works offline.

## Production deploy

Because there is no backend, the app deploys anywhere Next.js runs:

```bash
npm run build
npm run start
```

Or deploy to any static/hosting platform (Vercel, Netlify, Railway, Docker, etc.) with zero configuration — no env vars, no database setup.
