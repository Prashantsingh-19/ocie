/**
 * OCIE Biomarker Pipeline Fetcher
 * ──────────────────────────────
 * Fetches live trial data from ClinicalTrials.gov for drugs in a specified
 * biomarker, cross-references with approved SOC regimens, and projects
 * timelines using the validated formula.
 *
 * Usage:
 *   npx tsx scripts/fetch-biomarker-pipeline.ts --biomarker="KRAS G12C"
 *   npx tsx scripts/fetch-biomarker-pipeline.ts --biomarker="EGFR" --output=json
 *
 * Output: results printed to console or saved to data/pipeline_{biomarker}.json
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { writeFileSync } from "fs";
import path from "path";

config({ path: path.resolve(__dirname, "../.env.local") });

// ── Configurable timeline weights ──
const WEIGHTS = {
  standard: { submission: 2, review: 8, nccnLag: 5 },
  accelerated: { submission: 2, review: 4, nccnLag: 5 },
};

const BASE_URL = "https://clinicaltrials.gov/api/v2/studies";

interface TrialResult {
  nctId: string;
  title: string;
  phases: string[];
  status: string;
  startDate: string | null;
  primaryCompletionDate: string | null;
  enrollment: number | null;
  interventions: string[];
}

interface PipelineDrug {
  drugName: string;
  nctId: string;
  title: string;
  phases: string[];
  status: string;
  startDate: string | null;
  primaryCompletionDate: string | null;
  enrollment: number | null;
  inSOC: boolean;
  socTier: string | null;
  projectedFDA: string | null;
  projectedSOC: string | null;
  horizon: string | null;
}

function parseArgs() {
  const args: Record<string, string> = {};
  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      args[k] = v || "true";
    }
  }
  return args;
}

function addMonths(date: string, n: number): string {
  const d = new Date(date);
  d.setMonth(d.getMonth() + Math.round(n));
  return d.toISOString().slice(0, 10);
}

function getHorizon(d: string): string {
  const mo = (new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30.44);
  if (mo < 12) return "<1yr";
  if (mo < 36) return "1-3yr";
  if (mo < 60) return "3-5yr";
  return ">5yr";
}

function inferApprovalType(trial: TrialResult): "standard" | "accelerated" {
  const phases = trial.phases.join(" ");
  if (phases.includes("PHASE3")) return "standard";
  return "accelerated";
}

async function searchTrials(biomarker: string): Promise<TrialResult[]> {
  // Map common biomarker names to ClinicalTrials.gov search terms
  const biomarkerMap: Record<string, string> = {
    "EGFR": "EGFR mutation",
    "EGFR Exon 20": "EGFR exon 20",
    "ALK": "ALK fusion",
    "ROS1": "ROS1 fusion",
    "BRAF V600E": "BRAF V600E",
    "KRAS G12C": "KRAS G12C",
    "NTRK": "NTRK fusion",
    "RET": "RET fusion",
    "MET": "MET exon 14",
    "HER2": "HER2 mutation",
    "PD-L1": "PD-L1",
    "No Driver": "non-small cell lung cancer",
  };

  const queryTerm = biomarkerMap[biomarker] || biomarker;
  const url = `${BASE_URL}?query.cond=NSCLC&query.term=${encodeURIComponent(queryTerm)}&filter.overallStatus=RECRUITING,ACTIVE_NOT_RECRUITING,NOT_YET_RECRUITING,ENROLLING_BY_INVITATION&pageSize=100`;

  console.log(`  Searching: ${url}`);

  const res = await fetch(url);
  if (!res.ok) {
    console.error(`  API error: ${res.status}`);
    return [];
  }

  const data = await res.json();
  const studies = data.studies || [];

  console.log(`  Found ${studies.length} trials`);

  return studies.map((s: any) => {
    const p = s.protocolSection;
    const idMod = p.identificationModule;
    const statusMod = p.statusModule;
    const desMod = p.designModule;
    const armMod = p.armsInterventionsModule;

    return {
      nctId: idMod.nctId,
      title: idMod.briefTitle,
      phases: desMod.phases || [],
      status: statusMod.overallStatus,
      startDate: statusMod.startDateStruct?.date || null,
      primaryCompletionDate: statusMod.primaryCompletionDateStruct?.date || null,
      enrollment: desMod.enrollmentInfo?.count || null,
      interventions: (armMod?.interventions || []).map((i: any) => i.name),
    };
  });
}

async function main() {
  const args = parseArgs();
  const biomarker = args.biomarker || "KRAS G12C";
  const outputFormat = args.output || "table";

  console.log(`\n╔════════════════════════════════════════╗`);
  console.log(`║  OCIE Biomarker Pipeline Fetcher      ║`);
  console.log(`╚════════════════════════════════════════╝`);
  console.log(`\nBiomarker: ${biomarker}\n`);

  // 1. Get existing SOC drugs from Supabase
  console.log("1. Loading approved SOC drugs...");
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data: socDrugs, error: socErr } = await supabase
    .from("regimens")
    .select("drug, biomarker, tier, lot");

  if (socErr) { console.error("  DB error:", socErr.message); return; }

  const socSet = new Set((socDrugs || []).map((r: any) => r.drug.toLowerCase()));
  const socTiers = new Map(
    (socDrugs || []).map((r: any) => [r.drug.toLowerCase(), r.tier])
  );

  console.log(`  ${socSet.size} unique drugs in SOC database\n`);

  // 2. Fetch live trials from ClinicalTrials.gov
  console.log("2. Fetching live pipeline trials...");
  const trials = await searchTrials(biomarker);
  if (trials.length === 0) {
    console.log("\n  No trials found. Try a different biomarker.");
    return;
  }

  // 3. Extract unique drug names from trial interventions
  console.log("\n3. Extracting pipeline drugs...");
  const drugMap = new Map<string, TrialResult[]>();

  for (const t of trials) {
    for (const drug of t.interventions) {
      const key = drug.toLowerCase().trim();
      if (!drugMap.has(key)) drugMap.set(key, []);
      drugMap.get(key)!.push(t);
    }
  }

  // 4. Cross-reference with SOC and project timelines
  console.log("4. Cross-referencing with SOC & projecting timelines...");

  const results: PipelineDrug[] = [];
  for (const [drugName, drugTrials] of drugMap) {
    // Pick the best trial (highest phase)
    const ordered = drugTrials.sort((a, b) => {
      const phaseRank = (p: string[]) =>
        p.includes("PHASE3") ? 0 : p.includes("PHASE2") ? 1 : p.includes("PHASE1") ? 2 : 3;
      return phaseRank(a.phases) - phaseRank(b.phases);
    });
    const best = ordered[0];

    const inSOC = socSet.has(drugName) || [...socSet].some((s) => drugName.includes(s) || s.includes(drugName));
    const socTier = inSOC ? socTiers.get(drugName) || "Approved" : null;

    let projectedFDA: string | null = null;
    let projectedSOC: string | null = null;
    let horizon: string | null = null;

    if (best.primaryCompletionDate) {
      const type = inferApprovalType(best);
      const w = WEIGHTS[type];
      projectedFDA = addMonths(best.primaryCompletionDate, w.submission + w.review);
      projectedSOC = addMonths(best.primaryCompletionDate, w.submission + w.review + w.nccnLag);
      horizon = getHorizon(projectedSOC);
    }

    results.push({
      drugName: drugName.charAt(0).toUpperCase() + drugName.slice(1),
      nctId: best.nctId,
      title: best.title,
      phases: best.phases,
      status: best.status,
      startDate: best.startDate,
      primaryCompletionDate: best.primaryCompletionDate,
      enrollment: best.enrollment,
      inSOC,
      socTier,
      projectedFDA,
      projectedSOC,
      horizon,
    });
  }

  // Sort: pipeline (not in SOC) first, then by horizon
  results.sort((a, b) => {
    if (a.inSOC !== b.inSOC) return a.inSOC ? 1 : -1;
    if (!a.projectedSOC) return 1;
    if (!b.projectedSOC) return -1;
    return a.projectedSOC.localeCompare(b.projectedSOC);
  });

  // 5. Output
  if (outputFormat === "json") {
    const outPath = path.resolve(__dirname, `../data/pipeline_${biomarker.replace(/\s+/g, "_")}.json`);
    writeFileSync(outPath, JSON.stringify({ biomarker, fetchedAt: new Date().toISOString(), results }, null, 2));
    console.log(`\n  Saved to ${outPath}`);
  }

  console.log("\n5. RESULTS\n");
  console.log(`Found ${drugMap.size} unique drugs across ${trials.length} trials\n`);

  const header = `${"Drug".padEnd(32)} ${"Phase".padEnd(12)} ${"Status".padEnd(22)} ${"PCD".padEnd(12)} ${"Proj FDA".padEnd(12)} ${"Proj SOC".padEnd(12)} ${"Horizon".padEnd(8)} ${"SOC?"}`;
  console.log(header);
  console.log("─".repeat(header.length));

  let pipelineCount = 0;
  for (const r of results) {
    const phase = r.phases.join("/").replace("PHASE", "").replace(/PHASE/g, "P") || "—";
    const status = r.status.replace(/_/g, " ");
    const socFlag = r.inSOC ? "✓" : "○";
    if (!r.inSOC) pipelineCount++;
    console.log(
      `${r.drugName.slice(0, 30).padEnd(32)} ` +
      `${phase.padEnd(12)} ${status.padEnd(22)} ` +
      `${(r.primaryCompletionDate || "—").padEnd(12)} ` +
      `${(r.projectedFDA || "—").padEnd(12)} ` +
      `${(r.projectedSOC || "—").padEnd(12)} ` +
      `${(r.horizon || "—").padEnd(8)} ${socFlag}`
    );
  }

  console.log("\n───");
  console.log(`Pipeline drugs (○ not in SOC): ${pipelineCount}`);
  console.log(`Approved drugs (✓ in SOC):     ${results.length - pipelineCount}`);
  console.log(`Total:                         ${results.length}`);

  console.log("\nDone.");
}

main().catch(console.error);
