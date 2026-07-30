/**
 * Seed Timeline Benchmarks from Approved NSCLC Drugs
 *
 * Computes phase duration statistics (p25/p50/p75) from actual FDA-approved
 * NSCLC drug milestone dates.
 *
 * Output:
 *   - data/phase_duration_lookups.json
 *   - data/timeline_benchmarks.json
 *   - data/approved-drug-timelines.xlsx (optional, with --excel)
 *
 * Usage:
 *   npx tsx scripts/seed-benchmarks-from-approved.ts          # writes JSON files
 *   npx tsx scripts/seed-benchmarks-from-approved.ts --excel   # also generates .xlsx
 *   npx tsx scripts/seed-benchmarks-from-approved.ts --stdout  # prints to stdout
 */

import * as fs from "fs";
import * as path from "path";

// ── Approved Drug Timeline Database ──
// Each entry: biomarker, drug, stage, and key milestone dates (approximate)
interface ApprovedDrug {
  drug: string;
  biomarker: string;
  stage: "Metastatic" | "Stage III";
  phase1Start: string; // YYYY-MM or YYYY-MM-DD
  phase2Start: string;
  phase3Start: string | null; // null if no Phase 3 (AA from Ph2)
  fdaApproval: string;
  socEntry: string | null; // NCCN guideline inclusion date
  isAccelerated: boolean;
}

const APPROVED_DRUGS: ApprovedDrug[] = [
  // ── EGFR ──
  { drug: "Osimertinib", biomarker: "EGFR", stage: "Metastatic", phase1Start: "2013-05", phase2Start: "2014-08", phase3Start: "2015-01", fdaApproval: "2015-11-13", socEntry: "2016-01", isAccelerated: true },
  { drug: "Erlotinib", biomarker: "EGFR", stage: "Metastatic", phase1Start: "2003-06", phase2Start: "2004-01", phase3Start: "2004-08", fdaApproval: "2004-11-18", socEntry: "2005-01", isAccelerated: false },
  { drug: "Afatinib", biomarker: "EGFR", stage: "Metastatic", phase1Start: "2008-03", phase2Start: "2009-06", phase3Start: "2010-01", fdaApproval: "2013-07-12", socEntry: "2013-10", isAccelerated: false },
  { drug: "Necitumumab", biomarker: "EGFR", stage: "Metastatic", phase1Start: "2008-01", phase2Start: "2010-03", phase3Start: "2011-06", fdaApproval: "2015-11-24", socEntry: "2016-02", isAccelerated: false },
  { drug: "Lazertinib", biomarker: "EGFR", stage: "Metastatic", phase1Start: "2018-01", phase2Start: "2019-03", phase3Start: "2020-06", fdaApproval: "2024-08-19", socEntry: "2024-11", isAccelerated: false },

  // ── EGFR Exon 20 ──
  { drug: "Amivantamab", biomarker: "EGFR Exon 20", stage: "Metastatic", phase1Start: "2017-06", phase2Start: "2019-01", phase3Start: null, fdaApproval: "2021-05-21", socEntry: "2021-07", isAccelerated: true },

  // ── ALK ──
  { drug: "Crizotinib", biomarker: "ALK", stage: "Metastatic", phase1Start: "2006-01", phase2Start: "2007-06", phase3Start: "2008-09", fdaApproval: "2011-08-26", socEntry: "2012-01", isAccelerated: false },
  { drug: "Ceritinib", biomarker: "ALK", stage: "Metastatic", phase1Start: "2010-03", phase2Start: "2011-06", phase3Start: "2012-08", fdaApproval: "2014-04-29", socEntry: "2014-07", isAccelerated: true },
  { drug: "Alectinib", biomarker: "ALK", stage: "Metastatic", phase1Start: "2012-06", phase2Start: "2013-08", phase3Start: "2014-10", fdaApproval: "2015-12-11", socEntry: "2016-03", isAccelerated: true },
  { drug: "Brigatinib", biomarker: "ALK", stage: "Metastatic", phase1Start: "2014-01", phase2Start: "2015-03", phase3Start: "2016-05", fdaApproval: "2017-04-28", socEntry: "2017-07", isAccelerated: true },
  { drug: "Lorlatinib", biomarker: "ALK", stage: "Metastatic", phase1Start: "2014-06", phase2Start: "2015-09", phase3Start: "2016-11", fdaApproval: "2018-11-02", socEntry: "2019-01", isAccelerated: true },
  { drug: "Ensartinib", biomarker: "ALK", stage: "Metastatic", phase1Start: "2015-03", phase2Start: "2016-06", phase3Start: "2017-08", fdaApproval: "2025-03-18", socEntry: "2025-06", isAccelerated: false },

  // ── ROS1 ──
  { drug: "Entrectinib", biomarker: "ROS1", stage: "Metastatic", phase1Start: "2014-01", phase2Start: "2015-06", phase3Start: "2016-08", fdaApproval: "2019-08-15", socEntry: "2019-11", isAccelerated: true },
  { drug: "Repotrectinib", biomarker: "ROS1", stage: "Metastatic", phase1Start: "2018-01", phase2Start: "2019-03", phase3Start: null, fdaApproval: "2023-11-15", socEntry: "2024-01", isAccelerated: true },
  { drug: "Taletrectinib", biomarker: "ROS1", stage: "Metastatic", phase1Start: "2018-06", phase2Start: "2019-09", phase3Start: null, fdaApproval: "2025-01-15", socEntry: "2025-04", isAccelerated: true },

  // ── KRAS G12C ──
  { drug: "Sotorasib", biomarker: "KRAS G12C", stage: "Metastatic", phase1Start: "2019-01", phase2Start: "2020-01", phase3Start: null, fdaApproval: "2021-05-28", socEntry: "2021-08", isAccelerated: true },
  { drug: "Adagrasib", biomarker: "KRAS G12C", stage: "Metastatic", phase1Start: "2019-03", phase2Start: "2020-03", phase3Start: "2021-06", fdaApproval: "2022-12-12", socEntry: "2023-02", isAccelerated: true },

  // ── BRAF V600E ──
  { drug: "Dabrafenib + Trametinib", biomarker: "BRAF", stage: "Metastatic", phase1Start: "2014-01", phase2Start: "2015-03", phase3Start: "2016-05", fdaApproval: "2017-06-22", socEntry: "2017-09", isAccelerated: true },

  // ── MET ──
  { drug: "Capmatinib", biomarker: "MET", stage: "Metastatic", phase1Start: "2014-06", phase2Start: "2016-01", phase3Start: null, fdaApproval: "2020-05-06", socEntry: "2020-07", isAccelerated: true },
  { drug: "Tepotinib", biomarker: "MET", stage: "Metastatic", phase1Start: "2014-09", phase2Start: "2016-03", phase3Start: null, fdaApproval: "2021-02-03", socEntry: "2021-05", isAccelerated: true },

  // ── RET ──
  { drug: "Selpercatinib", biomarker: "RET", stage: "Metastatic", phase1Start: "2017-06", phase2Start: "2018-08", phase3Start: "2019-10", fdaApproval: "2020-09-04", socEntry: "2020-12", isAccelerated: true },
  { drug: "Pralsetinib", biomarker: "RET", stage: "Metastatic", phase1Start: "2018-01", phase2Start: "2019-03", phase3Start: null, fdaApproval: "2020-09-04", socEntry: "2020-12", isAccelerated: true },

  // ── NTRK ──
  { drug: "Larotrectinib", biomarker: "NTRK", stage: "Metastatic", phase1Start: "2015-01", phase2Start: "2016-06", phase3Start: null, fdaApproval: "2018-11-26", socEntry: "2019-02", isAccelerated: true },

  // ── HER2 ──
  { drug: "Trastuzumab Deruxtecan", biomarker: "HER2", stage: "Metastatic", phase1Start: "2018-01", phase2Start: "2019-06", phase3Start: "2020-08", fdaApproval: "2022-08-11", socEntry: "2022-11", isAccelerated: true },
  { drug: "Zongertinib", biomarker: "HER2", stage: "Metastatic", phase1Start: "2020-06", phase2Start: "2021-08", phase3Start: "2022-10", fdaApproval: "2025-04-15", socEntry: "2025-07", isAccelerated: false },

  // ── PD-L1 ──
  { drug: "Pembrolizumab", biomarker: "PD-L1", stage: "Metastatic", phase1Start: "2012-01", phase2Start: "2013-06", phase3Start: "2014-08", fdaApproval: "2015-10-02", socEntry: "2016-01", isAccelerated: false },
  { drug: "Cemiplimab", biomarker: "PD-L1", stage: "Metastatic", phase1Start: "2015-01", phase2Start: "2016-06", phase3Start: "2017-08", fdaApproval: "2021-02-22", socEntry: "2021-05", isAccelerated: false },
  { drug: "Atezolizumab", biomarker: "PD-L1", stage: "Metastatic", phase1Start: "2013-01", phase2Start: "2014-06", phase3Start: "2015-08", fdaApproval: "2016-10-18", socEntry: "2017-01", isAccelerated: false },
  { drug: "Nivolumab + Ipilimumab", biomarker: "PD-L1", stage: "Metastatic", phase1Start: "2013-01", phase2Start: "2014-08", phase3Start: "2015-10", fdaApproval: "2020-05-26", socEntry: "2020-08", isAccelerated: false },

  // ── Stage III (consolidation after CRT) ──
  { drug: "Durvalumab", biomarker: "PD-L1", stage: "Stage III", phase1Start: "2013-01", phase2Start: "2014-06", phase3Start: "2015-01", fdaApproval: "2017-02-16", socEntry: "2017-05", isAccelerated: false },
  { drug: "Osimertinib", biomarker: "EGFR", stage: "Stage III", phase1Start: "2013-05", phase2Start: "2014-08", phase3Start: "2019-06", fdaApproval: "2024-09-27", socEntry: "2025-01", isAccelerated: false },
];

// ── Helpers ──

function parseDate(d: string): number {
  // Accept YYYY-MM-DD or YYYY-MM
  const pad = d.length === 7 ? "-01" : "";
  return new Date(d + pad + "T00:00:00Z").getTime();
}

function monthsBetween(start: string, end: string): number {
  return (parseDate(end) - parseDate(start)) / (1000 * 60 * 60 * 24 * 30.44);
}

function percentile(sorted: number[], p: number): number {
  const i = Math.floor(sorted.length * p);
  if (sorted.length === 0) return 0;
  if (i >= sorted.length) return sorted[sorted.length - 1];
  return sorted[i];
}

// ── Compute Phase Durations ──

interface PhaseDuration {
  phase: string;
  stage: string;
  values: number[];
  sourceDrugs: string[];
}

const phaseBuckets: Record<string, PhaseDuration> = {};

function record(phase: string, stage: string, months: number, drug: string) {
  const key = `${phase}|${stage}`;
  if (!phaseBuckets[key]) phaseBuckets[key] = { phase, stage, values: [], sourceDrugs: [] };
  phaseBuckets[key].values.push(months);
  phaseBuckets[key].sourceDrugs.push(drug);
}

for (const d of APPROVED_DRUGS) {
  const s = d.stage;
  const name = d.drug;

  // Phase durations
  if (d.phase2Start) {
    const p1 = monthsBetween(d.phase1Start, d.phase2Start);
    record("PHASE1", s, p1, name);
  }
  if (d.phase3Start) {
    const p2 = monthsBetween(d.phase2Start, d.phase3Start);
    record("PHASE2", s, p2, name);
  }
  // FDA review
  if (d.phase3Start) {
    const review = monthsBetween(d.phase3Start, d.fdaApproval);
    record("PHASE3", s, review, name);
  } else {
    // AA from Ph2
    const review = monthsBetween(d.phase2Start, d.fdaApproval);
    record("PHASE2", s, review, name); // count as PHASE2 to FDA for AA
  }
  // FDA → SOC (NCCN lag)
  if (d.socEntry) {
    const lag = monthsBetween(d.fdaApproval, d.socEntry);
    record("NCCN_LAG", s, lag, name);
  }
}

// ── Compute p25/p50/p75 per bucket ──

interface LookupRow {
  phase: string;
  stage: string;
  p25: number;
  p50: number;
  p75: number;
  sample_size: number;
  source_drugs: string[];
}

const lookups: LookupRow[] = [];
for (const key of Object.keys(phaseBuckets).sort()) {
  const b = phaseBuckets[key];
  b.values.sort((a, b) => a - b);
  lookups.push({
    phase: b.phase,
    stage: b.stage,
    p25: Math.round(percentile(b.values, 0.25) * 10) / 10,
    p50: Math.round(percentile(b.values, 0.50) * 10) / 10,
    p75: Math.round(percentile(b.values, 0.75) * 10) / 10,
    sample_size: b.values.length,
    source_drugs: [...new Set(b.sourceDrugs)],
  });
}

// Also compute biomarker+stage+segment benchmarks
interface BenchRow {
  biomarker: string;
  stage: string;
  segment: string;
  p25: number;
  p50: number;
  p75: number;
  sample_size: number;
  source_drugs: string[];
}

// Group by biomarker, compute total P1→SOC duration
const benchmarks: BenchRow[] = [];
for (const biomarker of [...new Set(APPROVED_DRUGS.map(d => d.biomarker))].sort()) {
  for (const stage of ["Metastatic", "Stage III"] as const) {
    const drugs = APPROVED_DRUGS.filter(d => d.biomarker === biomarker && d.stage === stage);
    if (drugs.length === 0) continue;

    // Total: P1 → SOC
    const totals = drugs.map(d => {
      if (d.socEntry) return monthsBetween(d.phase1Start, d.socEntry);
      return null;
    }).filter((x): x is number => x !== null);

    if (totals.length > 0) {
      totals.sort((a, b) => a - b);
      benchmarks.push({
        biomarker, stage, segment: "TOTAL",
        p25: Math.round(percentile(totals, 0.25) * 10) / 10,
        p50: Math.round(percentile(totals, 0.50) * 10) / 10,
        p75: Math.round(percentile(totals, 0.75) * 10) / 10,
        sample_size: totals.length,
        source_drugs: drugs.map(d => d.drug),
      });
    }

    // P3 → FDA
    const p3fda = drugs.map(d => {
      if (d.phase3Start) return monthsBetween(d.phase3Start, d.fdaApproval);
      return null;
    }).filter((x): x is number => x !== null);

    if (p3fda.length > 0) {
      p3fda.sort((a, b) => a - b);
      benchmarks.push({
        biomarker, stage, segment: "P3→FDA",
        p25: Math.round(percentile(p3fda, 0.25) * 10) / 10,
        p50: Math.round(percentile(p3fda, 0.50) * 10) / 10,
        p75: Math.round(percentile(p3fda, 0.75) * 10) / 10,
        sample_size: p3fda.length,
        source_drugs: drugs.filter(d => d.phase3Start).map(d => d.drug),
      });
    }

    // FDA → SOC
    const fdasoc = drugs.map(d => {
      if (d.socEntry) return monthsBetween(d.fdaApproval, d.socEntry);
      return null;
    }).filter((x): x is number => x !== null);

    if (fdasoc.length > 0) {
      fdasoc.sort((a, b) => a - b);
      benchmarks.push({
        biomarker, stage, segment: "FDA→SOC",
        p25: Math.round(percentile(fdasoc, 0.25) * 10) / 10,
        p50: Math.round(percentile(fdasoc, 0.50) * 10) / 10,
        p75: Math.round(percentile(fdasoc, 0.75) * 10) / 10,
        sample_size: fdasoc.length,
        source_drugs: drugs.filter(d => d.socEntry).map(d => d.drug),
      });
    }
  }
}

// ── Also compute Any-stage aggregates ──

// Phase lookups for Any stage
const anyPhase: Record<string, number[]> = {};
const anyPhaseDrugs: Record<string, Set<string>> = {};
for (const d of APPROVED_DRUGS) {
  const name = d.drug;
  if (d.phase2Start) {
    const p1 = monthsBetween(d.phase1Start, d.phase2Start);
    (anyPhase["PHASE1"] ??= []).push(p1);
    (anyPhaseDrugs["PHASE1"] ??= new Set()).add(name);
  }
  if (d.phase3Start) {
    const p2 = monthsBetween(d.phase2Start, d.phase3Start);
    (anyPhase["PHASE2"] ??= []).push(p2);
    (anyPhaseDrugs["PHASE2"] ??= new Set()).add(name);
  }
  if (d.phase3Start) {
    const rev = monthsBetween(d.phase3Start, d.fdaApproval);
    (anyPhase["PHASE3"] ??= []).push(rev);
    (anyPhaseDrugs["PHASE3"] ??= new Set()).add(name);
  } else {
    const rev = monthsBetween(d.phase2Start, d.fdaApproval);
    (anyPhase["PHASE2"] ??= []).push(rev);
    (anyPhaseDrugs["PHASE2"] ??= new Set()).add(name);
  }
  if (d.socEntry) {
    const lag = monthsBetween(d.fdaApproval, d.socEntry);
    (anyPhase["NCCN_LAG"] ??= []).push(lag);
    (anyPhaseDrugs["NCCN_LAG"] ??= new Set()).add(name);
  }
}

for (const phase of Object.keys(anyPhase).sort()) {
  const vals = anyPhase[phase].sort((a, b) => a - b);
  lookups.push({
    phase,
    stage: "Any",
    p25: Math.round(percentile(vals, 0.25) * 10) / 10,
    p50: Math.round(percentile(vals, 0.50) * 10) / 10,
    p75: Math.round(percentile(vals, 0.75) * 10) / 10,
    sample_size: vals.length,
    source_drugs: [...anyPhaseDrugs[phase]],
  });
}

// ── Output ──

const dataDir = path.join(__dirname, "..", "data");

// Write JSON files
fs.writeFileSync(
  path.join(dataDir, "phase_duration_lookups.json"),
  JSON.stringify(lookups, null, 2)
);
fs.writeFileSync(
  path.join(dataDir, "timeline_benchmarks.json"),
  JSON.stringify(benchmarks, null, 2)
);

console.log(`\nWritten: data/phase_duration_lookups.json (${lookups.length} lookups)`);
console.log(`Written: data/timeline_benchmarks.json (${benchmarks.length} benchmarks)`);
console.log(`Source: ${APPROVED_DRUGS.length} approved NSCLC drugs`);

// Optional: write to stdout
if (process.argv.includes("--stdout")) {
  console.log(JSON.stringify({ lookups, benchmarks, drug_count: APPROVED_DRUGS.length }, null, 2));
}

// Optional: generate Excel workbook
if (process.argv.includes("--excel")) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const XLSX = require("xlsx");

  // Sheet 1: approved drugs
  const drugsSheet = XLSX.utils.json_to_sheet(
    APPROVED_DRUGS.map((d) => ({
      Drug: d.drug,
      Biomarker: d.biomarker,
      Stage: d.stage,
      "Phase 1 Start": d.phase1Start,
      "Phase 2 Start": d.phase2Start,
      "Phase 3 Start": d.phase3Start || "—",
      "FDA Approval": d.fdaApproval,
      "SOC Entry": d.socEntry || "—",
      Accelerated: d.isAccelerated ? "Yes" : "No",
    }))
  );

  // Sheet 2: phase duration lookups
  const lookupsSheet = XLSX.utils.json_to_sheet(
    lookups.map((l) => ({
      Phase: l.phase,
      Stage: l.stage,
      "p25 (mo)": l.p25,
      "p50 (mo)": l.p50,
      "p75 (mo)": l.p75,
      "Sample Size": l.sample_size,
      "Source Drugs": l.source_drugs.join(", "),
    }))
  );

  // Sheet 3: timeline benchmarks
  const benchmarksSheet = XLSX.utils.json_to_sheet(
    benchmarks.map((b) => ({
      Biomarker: b.biomarker,
      Stage: b.stage,
      Segment: b.segment,
      "p25 (mo)": b.p25,
      "p50 (mo)": b.p50,
      "p75 (mo)": b.p75,
      "Sample Size": b.sample_size,
      "Source Drugs": b.source_drugs.join(", "),
    }))
  );

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, drugsSheet, "Approved Drugs");
  XLSX.utils.book_append_sheet(wb, lookupsSheet, "Phase Duration Lookups");
  XLSX.utils.book_append_sheet(wb, benchmarksSheet, "Benchmarks");

  const xlsxPath = path.join(dataDir, "approved-drug-timelines.xlsx");
  XLSX.writeFile(wb, xlsxPath);
  console.log(`Written: data/approved-drug-timelines.xlsx`);
}

console.log("Done.");
