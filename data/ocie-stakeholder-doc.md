# OCIE — Oncology Competitive Intelligence Engine
### Stakeholder Briefing Document | July 2026

---

## 1. The Problem

Pharmaceutical companies face a critical blind spot in oncology:

- **Fragmented data**: SOC guidelines (NCCN, ASCO), clinical trial registries (ClinicalTrials.gov), FDA approval records, and competitor pipeline data live in separate silos. No single tool connects them.
- **Manual effort**: Competitive intelligence teams spend weeks manually cross-referencing guidelines, trial databases, and FDA records to assess where a competitor's pipeline drug fits against current Standard of Care.
- **Reactive decisions**: Without automated, real-time visibility into projected competitor entry timelines, portfolio strategy becomes reactive. Teams learn about competitive threats months after they emerge.
- **White space invisibility**: Identifying biomarker categories with low SOC saturation (potential entry points) requires manual analysis across multiple data sources, making it easy to overlook high-value opportunities.

> *"In pharma, the gap between leading a category and reacting to it often comes down to timing."* — Prezent.ai, Pharma CI Report 2026

---

## 2. Our Solution: OCIE

OCIE is a **single-pane-of-glass dashboard** that ingests structured SOC data (NCCN/ASCO guidelines) and live ClinicalTrials.gov data, cross-references FDA approvals, and presents four integrated views:

| Tab | Purpose |
|-----|---------|
| **SOC** | Current Standard of Care regimens by biomarker, line of therapy, histology, and regimen type |
| **Pipeline** | Competitor pipeline trials from ClinicalTrials.gov with projected FDA approval and SOC entry dates |
| **White Space** | Per-biomarker opportunity assessment (SOC count vs. pipeline count) with tiered labels |
| **Insights** | Side-by-side LOT comparison showing current SOC and incoming pipeline with projected timelines |

**Key differentiators:**
- **SOC-first architecture**: Pipeline data is filtered against known SOC drugs — already-approved drugs never appear as pipeline
- **Projected timelines**: Uses a configurable weight-based model to estimate FDA submission → approval → NCCN inclusion lag from primary completion dates
- **Biomarker-native grouping**: All data organized by actionable driver (EGFR, ALK, ROS1, KRAS, BRAF, etc.) with subtype drill-down

---

## 3. Market Landscape

**Existing commercial platforms** (Evaluate Pharma, Cortellis, IQVIA, Biomedtracker, DelveInsight) offer deep pipeline analytics, consensus forecasts, and deal tracking — but they share common gaps:

| Platform | Strength | Gap |
|----------|----------|-----|
| Evaluate Pharma | Consensus sales forecasts, catalyst tracking | No SOC-vs-pipeline white space view; expensive enterprise licensing |
| Cortellis (Clarivate) | Deep drug profiles, 3,000+ disease coverage, early-phase data | No real-time clinical trial integration; static reports |
| IQVIA | Largest health data footprint, real-world evidence | Not designed for competitive pipeline monitoring |
| Biomedtracker | Real-time trial event tracking, catalyst calendars | No projected timeline modeling or biomarker-native views |
| DelveInsight | Custom interactive dashboards, market assessments | Consulting-heavy; no self-service live data ingestion |

**The gap OCIE fills**: None of these platforms offer a **free, self-service dashboard that directly connects SOC guidelines to competitor pipeline data with automated timeline projections and biomarker-native white space analysis**. The closest equivalent would be a custom-built internal tool costing $200K+ in development and requiring dedicated data engineering support.

**OCIE's position**: OCIE is not a replacement for Evaluate or Cortellis — it is a **complementary strategic layer** that answers a specific question no current platform addresses well: *"For a given biomarker, what is the current SOC landscape, which competitor pipeline drugs are incoming, when will they likely arrive, and where is the white space?"*

---

## 4. How It Works

### Data Pipeline

```
SOC XLSX ──> Supabase (regimens, 62 rows)
                  │
ClinicalTrials.gov API ──> Fetcher ──> pipeline_dashboard.json (50 pipeline drugs)
       │                              │
  Filter: INDUSTRY sponsor            │
  Filter: US sites only               │
  Filter: RECRUITING / ACTIVE         │
  Filter: PCD > today                 │
       │                              │
  FDA Drugs@FDA API ──> Cross-reference (exclude approved drugs)
```

### Timeline Projection Formula

```
Projected FDA  = PCD + submission_weight + review_weight  
Projected SOC  = PCD + submission_weight + review_weight + nccn_lag_weight

Where weights are derived from trial profile:
  - Standard pathway: submission(2) + review(8) + NCCN lag(5) = 15 months
  - Accelerated pathway: submission(2) + review(4) + NCCN lag(5) = 11 months

Adjustments based on:
  - Endpoint (OS/ORR/PFS) → ± review time
  - Enrollment rate (Fast/Average/Slow) → ± review time
  - Design (RCT/SingleArm/Adaptive) → ± submission/review time
  - BTD/AA/PR designations → pathway selection
```

### Horizon Classification

```
< 12 months  → "<1yr"     (green)
12–24 months → "1-2yr"    (amber)
24–48 months → "2-4yr"    (red)
> 48 months  → ">4yr"     (purple)
```

---

## 5. Limitations & What OCIE Is NOT

### What OCIE does NOT do:

| Limitation | Explanation |
|------------|-------------|
| **Does not forecast sales** | No revenue projections, market sizing, or pricing analysis. Use Evaluate Pharma for forecasts. |
| **Does not track deals/M&A** | No licensing, partnership, or acquisition monitoring. Use Cortellis Deals Intelligence. |
| **Does not replace real-world data** | No claims, EHR, or outcomes data. Use IQVIA for RWE. |
| **Does not provide primary research** | No KOL interviews or field intelligence. Use Two Labs for primary insights. |
| **Not a regulatory tracker** | No submission milestone alerts or PDUFA date tracking. Use Biomedtracker for catalysts. |
| **No multi-indication support** | Currently NSCLC only. Future indications would require new SOC data ingestion. |
| **Data recency depends on SOC updates** | SOC data is as current as the NCCN/ASCO guidelines ingested. Does not auto-detect guideline changes. |
| **Pipeline data limited to ClinicalTrials.gov** | Does not capture preclinical assets, non-US trials, or trials with non-INDUSTRY sponsors. |
| **Timeline projections are estimates** | Weights are configurable defaults. Real FDA review times vary. Projections are directional, not guarantees. |

### Important Caveat

OCIE is a **strategic visualization and alerting layer**, not a decision-making system. It reduces the time to answer *"what's happening in this biomarker space?"* from weeks to seconds — but final portfolio decisions require human domain expertise, competitive nuance, and commercial judgment that no automated system can replicate.

---

## 6. Opportunities OCIE Enables

- **White space identification**: Instantly spot biomarkers with ≤2 SOC regimens and active pipeline — potential entry points for new asset development
- **Competitor timing awareness**: Projected SOC entry dates let teams prepare pre-launch activities 12–48 months in advance
- **Portfolio gap analysis**: Compare internal pipeline against SOC + competitor pipeline to identify under-served biomarker populations
- **Due diligence acceleration**: When evaluating in-licensing opportunities, OCIE provides immediate context on the competitive landscape the asset would enter
- **Congress preparation**: Before ASCO/ESMO/WCLC, OCIE gives teams a structured view of which competitor readouts matter for their assets

---

## 7. Technical Stack

| Component | Technology |
|-----------|------------|
| Frontend | Next.js 16 (React), TypeScript |
| Backend | Supabase (PostgreSQL) |
| Data Fetching | ClinicalTrials.gov v2 API, FDA Drugs@FDA API |
| Deployment | Vercel / Node.js |
| Data Storage | Supabase (regimens), JSON (pipeline) |
| Timeline Engine | Custom profileToWeights + projectTimeline functions |

---

*OCIE — Oncology Competitive Intelligence Engine*  
*Built for the July 2026 Stakeholder Review*
