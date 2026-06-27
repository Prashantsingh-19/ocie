/**
 * OCIE Pipeline Dashboard Fetcher
 * ────────────────────────────────
 * Fetches ~10 pipeline-only NSCLC drugs + ~5 approved SOC drugs from
 * ClinicalTrials.gov, using the profile→weights system for timeline projection.
 *
 * Usage:
 *   npx tsx scripts/fetch-pipeline-dashboard.ts
 *
 * Output: data/pipeline_dashboard.json (read by Dashboard at build time)
 */

import { config } from "dotenv";
import { writeFileSync } from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

config({ path: path.resolve(__dirname, "../.env.local") });

const BASE = "https://clinicaltrials.gov/api/v2/studies";

const BIOMARKER_TERMS: Record<string, string> = {
  EGFR: "EGFR mutation NSCLC", "EGFR Exon 20": "EGFR exon 20 NSCLC",
  ALK: "ALK fusion NSCLC", ROS1: "ROS1 fusion NSCLC",
  "BRAF V600E": "BRAF V600E NSCLC", "KRAS G12C": "KRAS G12C NSCLC",
  NTRK: "NTRK fusion NSCLC", RET: "RET fusion NSCLC",
  MET: "MET exon 14 NSCLC", HER2: "HER2 mutation NSCLC",
  "PD-L1": "PD-L1 NSCLC", "No Driver": "non-small cell lung cancer",
};

const PROFILE_WEIGHTS = {
  standard: { submission: 2, review: 8, nccnLag: 5 },
  accelerated: { submission: 2, review: 4, nccnLag: 5 },
};

function addMonths(d: string, n: number) {
  const dt = new Date(d);
  dt.setMonth(dt.getMonth() + Math.round(n));
  return dt.toISOString().slice(0, 10);
}

function horizon(d: string) {
  const mo = (new Date(d).getTime() - Date.now()) / 2592000000;
  if (mo < 12) return "<1yr";
  if (mo < 36) return "1-3yr";
  if (mo < 60) return "3-5yr";
  return ">5yr";
}

async function search(queryTerm: string, pageSize = 40): Promise<any[]> {
  const url = `${BASE}?query.cond=NSCLC&query.term=${encodeURIComponent(queryTerm)}&filter.overallStatus=RECRUITING,ACTIVE_NOT_RECRUITING,NOT_YET_RECRUITING,ENROLLING_BY_INVITATION&pageSize=${pageSize}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.studies || []).map((s: any) => {
    const p = s.protocolSection;
    return {
      nctId: p.identificationModule.nctId,
      title: p.identificationModule.briefTitle,
      phases: p.designModule.phases || [],
      status: p.statusModule.overallStatus,
      startDate: p.statusModule.startDateStruct?.date || null,
      pcd: p.statusModule.primaryCompletionDateStruct?.date || null,
      interventions: (p.armsInterventionsModule?.interventions || []).map((i: any) => i.name),
    };
  });
}

interface PipelineEntry {
  drug: string;
  nctId: string;
  biomarker: string;
  phases: string[];
  status: string;
  startDate: string | null;
  pcd: string | null;
  inSOC: boolean;
  socTier: string | null;
  projectedFDA: string | null;
  projectedSOC: string | null;
  horizon: string | null;
  approvalType: "standard" | "accelerated";
}

async function main() {
  console.log("OCIE Pipeline Dashboard Fetcher\n");

  // 1. Load SOC drugs from Supabase
  console.log("1. Loading SOC drugs...");
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data: soc } = await supabase.from("regimens").select("drug, biomarker, tier");
  const socSet = new Set((soc || []).map((r: any) => r.drug.toLowerCase()));
  const socTiers = new Map((soc || []).map((r: any) => [r.drug.toLowerCase(), r.tier]));
  console.log(`   ${socSet.size} unique SOC drugs\n`);

  // 2. Search all biomarkers
  console.log("2. Searching trials across all biomarkers...");
  const allTrials: any[] = [];
  for (const [bm, term] of Object.entries(BIOMARKER_TERMS)) {
    const trials = await search(term);
    allTrials.push(...trials.map((t) => ({ ...t, biomarker: bm })));
    console.log(`   ${bm}: ${trials.length} trials`);
  }

  // 3. Group by drug name
  const drugMap = new Map<string, { biomarker: string; trials: any[] }>();
  for (const t of allTrials) {
    for (const drug of t.interventions) {
      const key = drug.toLowerCase().trim();
      if (!drugMap.has(key)) drugMap.set(key, { biomarker: t.biomarker, trials: [] });
      drugMap.get(key)!.trials.push(t);
    }
  }

  console.log(`\n   ${drugMap.size} unique drugs found\n`);

  // 4. For each drug, pick best trial and classify
  const entries: PipelineEntry[] = [];
  for (const [drugName, { biomarker, trials }] of drugMap) {
    const sorted = trials.sort((a, b) => {
      const rank = (p: string[]) =>
        p.includes("PHASE3") ? 0 : p.includes("PHASE2") ? 1 : p.includes("PHASE1") ? 2 : 3;
      return rank(a.phases) - rank(b.phases);
    });
    const best = sorted[0];
    const dl = drugName.toLowerCase();

    const inSOC = socSet.has(dl) || [...socSet].some((s) => dl.includes(s) || s.includes(dl));
    const tier = inSOC ? socTiers.get(dl) || "Approved" : null;
    const at = best.phases.includes("PHASE3") || !inSOC ? "standard" : "accelerated";
    const w = PROFILE_WEIGHTS[at];

    let pFDA: string | null = null, pSOC: string | null = null, hz: string | null = null;
    if (best.pcd) {
      pFDA = addMonths(best.pcd, w.submission + w.review);
      pSOC = addMonths(best.pcd, w.submission + w.review + w.nccnLag);
      hz = horizon(pSOC);
    }

    entries.push({
      drug: drugName.charAt(0).toUpperCase() + drugName.slice(1),
      nctId: best.nctId,
      biomarker,
      phases: best.phases,
      status: best.status,
      startDate: best.startDate,
      pcd: best.pcd,
      inSOC,
      socTier: tier,
      projectedFDA: pFDA,
      projectedSOC: pSOC,
      horizon: hz,
      approvalType: at,
    });
  }

  // 5. Sort & select: pipeline-first, then nearest horizon
  entries.sort((a, b) => {
    if (a.inSOC !== b.inSOC) return a.inSOC ? 1 : -1;
    if (!a.projectedSOC) return 1;
    if (!b.projectedSOC) return -1;
    return a.projectedSOC.localeCompare(b.projectedSOC);
  });

  const pipeline = entries.filter((e) => !e.inSOC).slice(0, 10);
  const approved = entries.filter((e) => e.inSOC).slice(0, 5);

  const output = {
    fetchedAt: new Date().toISOString(),
    totalTrials: allTrials.length,
    totalDrugs: drugMap.size,
    pipeline,
    approved,
    weights: PROFILE_WEIGHTS,
  };

  const outPath = path.resolve(__dirname, "../data/pipeline_dashboard.json");
  writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.log(`\n3. Results saved to ${outPath}\n`);
  console.log(`   Pipeline drugs: ${pipeline.length}`);
  console.log(`   Approved drugs: ${approved.length}\n`);

  // Print table
  const print = (list: PipelineEntry[], label: string) => {
    console.log(`   ── ${label} ──`);
    for (const e of list) {
      console.log(
        `   ${e.drug.padEnd(22)} ${e.biomarker.padEnd(12)} ` +
        `${(e.phases.join("/").replace(/PHASE/g, "P") || "—").padEnd(8)} ` +
        `${(e.pcd || "—").padEnd(12)} ${(e.projectedSOC || "—").padEnd(12)} ${e.horizon || "—"}`
      );
    }
    console.log("");
  };
  print(pipeline, "Pipeline (not yet SOC)");
  print(approved, "Approved (model validation)");

  console.log("Done.");
}

main().catch(console.error);
