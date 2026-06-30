/**
 * OCIE Pipeline Dashboard Fetcher v3
 * ─────────────────────────────────────
 * Fetches pipeline NSCLC drugs from ClinicalTrials.gov v2 API with:
 *   - Industry-sponsored only (filter.leadSponsorClass=INDUSTRY)
 *   - US-based sites only (post-filter locations[].country)
 *   - Real trial metadata extraction (design, endpoint, enrollment rate, FDA)
 *   - FDA-approved NSCLC drug check via FDA Drugs@FDA API
 *   - profileToWeights timeline projection
 *
 * Usage:
 *   npx tsx scripts/fetch-pipeline-dashboard.ts
 *   npx tsx scripts/fetch-pipeline-dashboard.ts --skip-fda  (skip FDA API call)
 *
 * Output: data/pipeline_dashboard.json
 */

import { config } from "dotenv";
import { writeFileSync } from "fs";
import path from "path";

config({ path: path.resolve(__dirname, "../.env.local") });

const CTGOV_BASE = "https://clinicaltrials.gov/api/v2/studies";
const FDA_BASE = "https://api.fda.gov/drug/drugsfda.json";

// ─────────────────────────────────────────
// 1. Biomarker search terms
// ─────────────────────────────────────────
const BIOMARKER_TERMS: Record<string, string> = {
  EGFR: "EGFR mutation NSCLC", "EGFR Exon 20": "EGFR exon 20 NSCLC",
  ALK: "ALK fusion NSCLC", ROS1: "ROS1 fusion NSCLC",
  "BRAF V600E": "BRAF V600E NSCLC", "KRAS G12C": "KRAS G12C NSCLC",
  NTRK: "NTRK fusion NSCLC", RET: "RET fusion NSCLC",
  MET: "MET exon 14 NSCLC", HER2: "HER2 mutation NSCLC",
  "PD-L1": "PD-L1 NSCLC", "No Driver": "non-small cell lung cancer",
};

// ─────────────────────────────────────────
// 2. FDA-approved NSCLC drug list
// ─────────────────────────────────────────

/**
 * Query the FDA Drugs@FDA API for drugs indicated for NSCLC.
 * Searches both indication field and brand/generic names.
 */
async function fetchApprovedNSCLCDrugs(): Promise<{ name: string; type: "brand" | "generic" }[]> {
  const approved: { name: string; type: "brand" | "generic" }[] = [];
  const seen = new Set<string>();

  // Search indications for NSCLC terms
  const searchTerms = [
    "non-small cell lung cancer",
    "nsclc",
    "non-small cell lung carcinoma",
    "metastatic non-small cell lung",
    "advanced non-small cell lung",
  ];

  for (const term of searchTerms) {
    try {
      const url = `${FDA_BASE}?search=openfda.indications_and_usage:${encodeURIComponent(term)}&limit=100`;
      const res = await fetch(url, { headers: { "User-Agent": "OCIE/1.0" } });
      if (!res.ok) continue;
      const data = await res.json();
      if (!data.results?.length) continue;

      for (const r of data.results) {
        const ofda = r.openfda || {};
        // Collect brand names
        for (const n of ofda.brand_name || []) {
          const key = n.toLowerCase().trim();
          if (!seen.has(key)) { seen.add(key); approved.push({ name: n, type: "brand" }); }
        }
        // Collect generic names
        for (const n of ofda.generic_name || []) {
          const key = n.toLowerCase().trim();
          if (!seen.has(key)) { seen.add(key); approved.push({ name: n, type: "generic" }); }
        }
        // Collect substance names
        for (const n of ofda.substance_name || []) {
          const key = n.toLowerCase().trim();
          if (!seen.has(key)) { seen.add(key); approved.push({ name: n, type: "generic" }); }
        }
      }
    } catch { /* continue */ }
  }

  return approved;
}

// ─────────────────────────────────────────
// 3. Trial characteristic extractors
// ─────────────────────────────────────────

function extractDesign(allocation: string | null): "RCT" | "SingleArm" | "Adaptive" {
  if (!allocation) return "SingleArm";
  const u = allocation.toUpperCase();
  if (u.includes("ADAPTIVE") || u.includes("SEQUENTIAL")) return "Adaptive";
  if (u.includes("RANDOMIZED")) return "RCT";
  return "SingleArm";
}

function extractEndpoint(primaryOutcomes: any[] | null): "PFS" | "ORR" | "OS" {
  if (!primaryOutcomes?.length) return "PFS";
  const text = primaryOutcomes.map((o: any) => `${o.measure || ""} ${o.description || ""}`).join(" ").toLowerCase();
  if (text.includes("overall survival") || text.includes("os")) return "OS";
  if (text.includes("objective response") || text.includes("response rate") ||
      text.includes("orr") || text.includes("overall response")) return "ORR";
  if (text.includes("progression free") || text.includes("pfs") ||
      text.includes("disease free") || text.includes("event free")) return "PFS";
  return "PFS";
}

function extractEnrollmentRate(count: number | null, startDate: string | null, pcd: string | null): "Fast" | "Average" | "Slow" {
  if (!count || count <= 0) return "Average";
  if (!startDate || !pcd) {
    if (count >= 200) return "Fast";
    if (count >= 50) return "Average";
    return "Slow";
  }
  const months = Math.max(1, (new Date(pcd).getTime() - new Date(startDate).getTime()) / 2592000000);
  const rate = count / months;
  if (rate >= 20) return "Fast";
  if (rate >= 5) return "Average";
  return "Slow";
}

function extractFDA(phases: string[], design: "RCT" | "SingleArm" | "Adaptive", endpoint: "PFS" | "ORR" | "OS"): {
  btd: boolean; aa: boolean; priorityReview: boolean;
} {
  const hasP2 = phases.some((p) => p.includes("PHASE2"));
  const hasP3 = phases.some((p) => p.includes("PHASE3"));
  const isUnmet = endpoint === "OS" || endpoint === "ORR";
  const btd = hasP2 && design === "SingleArm";
  const aa = hasP2 && design === "SingleArm" && endpoint === "ORR";
  const priorityReview = btd || (hasP3 && isUnmet);
  return { btd, aa, priorityReview };
}

/** Extract histology from eligibility criteria, conditions text, and trial title */
function extractHistology(conditions: string[] | null, eligibilityText: string | null, title: string | null): "Squamous" | "Non-squamous" | "Mixed" | "Unknown" {
  const text = [
    ...(conditions || []),
    eligibilityText || "",
    title || "",
  ].join(" ").toLowerCase();

  const hasSquamous = /\bsquamous\b/.test(text) && !/\bnon.?squamous\b/.test(text);
  const hasNonSquamous = /\bnon.?squamous\b|\bnonsquamous\b/.test(text) || /\badenocarcinoma\b/.test(text) || /\bnon.?small\b.*\badenocarcinoma\b/.test(text);
  const hasMixed = hasSquamous && hasNonSquamous;

  if (hasMixed) return "Mixed";
  if (hasSquamous) return "Squamous";
  if (hasNonSquamous) return "Non-squamous";
  return "Unknown";
}

/** Check if trial has at least one US site */
function hasUSLocation(locations: any[] | null): boolean {
  if (!locations?.length) return false;
  return locations.some((l: any) => {
    const c = (l.country || "").toLowerCase();
    return c === "united states" || c === "usa" || c === "u.s.a." || c === "us";
  });
}

// ─────────────────────────────────────────
// 4. API fetch
// ─────────────────────────────────────────

async function searchBiomarker(biomarker: string, term: string, pageSize = 100): Promise<any[]> {
  const url = `${CTGOV_BASE}?query.cond=NSCLC&query.term=${encodeURIComponent(term)}` +
    `&filter.overallStatus=RECRUITING,ACTIVE_NOT_RECRUITING,NOT_YET_RECRUITING,ENROLLING_BY_INVITATION` +
    `&pageSize=${pageSize}`;

  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.studies || [])
    .filter((s: any) => (s.protocolSection?.sponsorCollaboratorsModule?.leadSponsor?.class || "") === "INDUSTRY")
    .map((s: any) => {
    const p = s.protocolSection;
    const idMod = p.identificationModule;
    const dm = p.designModule || {};
    const sm = p.statusModule || {};
    const om = p.outcomeModule || {};
    const am = p.armsInterventionsModule || {};
    const scMod = p.sponsorCollaboratorsModule || {};
    const locMod = p.contactsLocationsModule || p.locationModule || {};
    const condMod = p.conditionsModule || {};
    const eligMod = p.eligibilityModule || {};

    return {
      nctId: idMod.nctId,
      title: idMod.briefTitle || idMod.officialTitle || "",
      biomarker,
      phases: dm.phases || [],
      status: sm.overallStatus,
      startDate: sm.startDateStruct?.date || null,
      pcd: sm.primaryCompletionDateStruct?.date || null,
      interventions: (am.interventions || []).map((i: any) => i.name),
      // Sponsor
      sponsor: scMod.leadSponsor?.name || "Unknown",
      sponsorClass: scMod.leadSponsor?.class || "",
      // Locations
      locations: (locMod.locations || []).map((l: any) => ({
        country: l.country || "",
        city: l.city || "",
        facility: l.facility || "",
      })),
      // ── Extracted characteristics ──
      designType: extractDesign(dm.designInfo?.allocation || null),
      endpoint: extractEndpoint(om.primaryOutcomes || null),
      enrollmentCount: dm.enrollmentInfo?.count || null,
      conditions: condMod.conditions || null,
      eligibilityText: eligMod.eligibilityCriteria || eligMod.studyPopulation || null,
      fda: null,
      enrollmentRate: null,
    };
  });
}

// ─────────────────────────────────────────
// 5. Timeline helpers
// ─────────────────────────────────────────

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

function profileToWeights(p: {
  endpoint: "PFS" | "ORR" | "OS";
  enrollment: "Fast" | "Average" | "Slow";
  design: "RCT" | "SingleArm" | "Adaptive";
  btd: boolean; aa: boolean; priorityReview: boolean;
}): { submission: number; review: number; nccnLag: number } {
  const hasAA = p.aa;
  let review = hasAA ? 4 : 8;
  let submission = 2;
  const isDefaultStd = !hasAA && p.endpoint === "PFS" && p.enrollment === "Fast" && p.design === "RCT";
  const isDefaultAcc = hasAA && p.endpoint === "ORR" && p.enrollment === "Fast" && p.design === "SingleArm";
  if (!isDefaultStd && !isDefaultAcc) {
    if (p.endpoint === "OS") review += hasAA ? 3 : 5;
    else if (p.endpoint === "ORR" && !hasAA) review -= 2;
    if (p.enrollment === "Slow") review += 4;
    else if (p.enrollment === "Average") review += 1;
    if (!hasAA && p.design === "SingleArm") submission -= 1;
    else if (hasAA && p.design === "RCT") submission += 2;
    else if (p.design === "Adaptive") review -= 1;
  }
  return { submission, review, nccnLag: 5 };
}

// ─────────────────────────────────────────
// 6. Types
// ─────────────────────────────────────────

interface DrugEntry {
  drug: string;
  nctId: string;
  biomarker: string;
  sponsor: string;
  sponsorClass: string;
  usBased: boolean;
  phases: string[];
  status: string;
  startDate: string | null;
  pcd: string | null;
  histology: "Squamous" | "Non-squamous" | "Mixed" | "Unknown";
  designType: "RCT" | "SingleArm" | "Adaptive";
  endpoint: "PFS" | "ORR" | "OS";
  enrollmentRate: "Fast" | "Average" | "Slow";
  fda: { btd: boolean; aa: boolean; priorityReview: boolean };
  inSOC: boolean;
  socTier: string | null;
  projectedFDA: string | null;
  projectedSOC: string | null;
  horizon: string | null;
}

// ─────────────────────────────────────────
// 7. Main
// ─────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const skipFDA = args.includes("--skip-fda");

  console.log("OCIE Pipeline Dashboard Fetcher v3\n");
  console.log(`Filters: INDUSTRY sponsor only, US sites only${skipFDA ? ", FDA API check disabled" : ""}\n`);

  // ── Step 1: Load SOC drugs from Supabase + FDA list ──
  console.log("1. Loading known SOC drugs...");
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: soc } = await supabase.from("regimens").select("drug, biomarker, tier");
  const socSet = new Set((soc || []).map((r: any) => r.drug.toLowerCase()));
  console.log(`   Supabase SOC: ${socSet.size} unique drugs`);

  // Fetch FDA-approved NSCLC drugs
  let fdaApproved = new Set<string>();
  if (!skipFDA) {
    console.log("\n2. Fetching FDA-approved NSCLC drug list...");
    const list = await fetchApprovedNSCLCDrugs();
    for (const { name } of list) fdaApproved.add(name.toLowerCase());
    console.log(`   FDA approved NSCLC drugs found: ${fdaApproved.size}`);
    // Merge with SOC
    for (const d of fdaApproved) socSet.add(d);
    console.log(`   Combined unique approved drugs: ${socSet.size}`);
  } else {
    console.log("   (SKIPPED)");
  }

  // ── Step 3: Search ClinicalTrials.gov ──
  console.log("\n3. Fetching industry-sponsored NSCLC trials...");
  const allTrials: any[] = [];
  for (const [bm, term] of Object.entries(BIOMARKER_TERMS)) {
    const raw = await searchBiomarker(bm, term);
    // Apply US location filter
    const usTrials = raw.filter((t) => {
      const isUS = hasUSLocation(t.locations);
      return isUS;
    });
    // Enrich
    const enriched = usTrials.map((t) => ({
      ...t,
      fda: extractFDA(t.phases, t.designType, t.endpoint),
      enrollmentRate: extractEnrollmentRate(t.enrollmentCount, t.startDate, t.pcd),
      histology: extractHistology(t.conditions, t.eligibilityText, t.title),
    }));
    allTrials.push(...enriched);
    console.log(`   ${bm}: ${raw.length} total, ${usTrials.length} US-based`);
  }
  console.log(`   Total US-based industry trials: ${allTrials.length}`);

  // ── Step 4: Group by drug name ──
  console.log("\n4. Grouping by drug (best-phase trial per drug)...");
  const drugMap = new Map<string, any>();
  for (const t of allTrials) {
    for (const drug of t.interventions) {
      const key = drug.toLowerCase().trim();
      const existing = drugMap.get(key);
      const rank = (p: string[]) =>
        p.includes("PHASE3") ? 0 : p.includes("PHASE2") ? 1 : p.includes("PHASE1") ? 2 : 3;
      if (!existing || rank(t.phases) < rank(existing.phases)) {
        drugMap.set(key, t);
      }
    }
  }
  console.log(`   ${drugMap.size} unique drugs`);

  // ── Step 5: Build entries with full extraction ──
  console.log("\n5. Computing profiles, cross-referencing approval, projecting timelines...");
  const entries: DrugEntry[] = [];
  for (const [drugName, trial] of drugMap) {
    const dl = drugName.toLowerCase();
    const inSOC = socSet.has(dl);
    const fda = trial.fda || { btd: false, aa: false, priorityReview: false };

    const w = profileToWeights({
      endpoint: trial.endpoint,
      enrollment: trial.enrollmentRate,
      design: trial.designType,
      btd: fda.btd,
      aa: fda.aa,
      priorityReview: fda.priorityReview,
    });

    let pFDA: string | null = null, pSOC: string | null = null, hz: string | null = null;
    if (trial.pcd) {
      pFDA = addMonths(trial.pcd, w.submission + w.review);
      pSOC = addMonths(trial.pcd, w.submission + w.review + w.nccnLag);
      hz = horizon(pSOC);
    }

    entries.push({
      drug: drugName.charAt(0).toUpperCase() + drugName.slice(1),
      nctId: trial.nctId,
      biomarker: trial.biomarker,
      sponsor: trial.sponsor,
      sponsorClass: trial.sponsorClass,
      usBased: true,
      phases: trial.phases,
      status: trial.status,
      startDate: trial.startDate,
      pcd: trial.pcd,
      histology: trial.histology || "Unknown",
      designType: trial.designType,
      endpoint: trial.endpoint,
      enrollmentRate: trial.enrollmentRate,
      fda,
      inSOC,
      socTier: inSOC ? "Approved" : null,
      projectedFDA: pFDA,
      projectedSOC: pSOC,
      horizon: hz,
    });
  }

  // ── Step 6: Sort & select ──
  entries.sort((a, b) => {
    if (a.inSOC !== b.inSOC) return a.inSOC ? 1 : -1;
    if (!a.projectedSOC) return 1;
    if (!b.projectedSOC) return -1;
    return a.projectedSOC.localeCompare(b.projectedSOC);
  });

  const pipeline = entries.filter((e) => !e.inSOC).slice(0, 50);
  const approved = entries.filter((e) => e.inSOC).slice(0, 5);

  const output = {
    fetchedAt: new Date().toISOString(),
    config: {
      sponsorFilter: "INDUSTRY",
      usLocationFilter: true,
      fdaApiCheck: !skipFDA,
      fdaApprovedCount: fdaApproved.size,
    },
    totalTrials: allTrials.length,
    totalDrugs: drugMap.size,
    pipeline,
    approved,
  };

  // ── Step 7: Write ──
  const outPath = path.resolve(__dirname, "../data/pipeline_dashboard.json");
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\n   Written: ${outPath}`);

  // ── Step 8: Print ──
  const phaseStr = (p: string[]) => p.join("/").replace(/PHASE/g, "P") || "—";
  const profileSig = (e: DrugEntry) =>
    `${e.endpoint}·${e.designType === "RCT" ? "RCT" : e.designType === "SingleArm" ? "SA" : "Adpt"}·${e.enrollmentRate === "Fast" ? "Fast" : e.enrollmentRate === "Average" ? "Avg" : "Slow"}${e.fda.btd ? "·BTD" : ""}${e.fda.aa ? "·AA" : ""}${e.fda.priorityReview ? "·PR" : ""}`;

  console.log(`\n── Pipeline Drugs (not yet approved) ──`);
  for (const e of pipeline) {
    console.log(`  ${e.drug.padEnd(20)} ${e.biomarker.padEnd(12)} ${phaseStr(e.phases).padEnd(8)} ${e.sponsor.slice(0, 20).padEnd(22)} ${(e.pcd || "—").padEnd(12)} ${(e.projectedSOC || "—").padEnd(12)} ${(e.horizon || "—").padEnd(8)} ${profileSig(e)}`);
  }

  console.log(`\n── Approved Drugs (model validation) ──`);
  for (const e of approved) {
    console.log(`  ${e.drug.padEnd(20)} ${e.biomarker.padEnd(12)} ${phaseStr(e.phases).padEnd(8)} ${e.sponsor.slice(0, 20).padEnd(22)} ${(e.pcd || "—").padEnd(12)} ${(e.projectedSOC || "—").padEnd(12)} ${(e.horizon || "—").padEnd(8)} ${profileSig(e)}`);
  }

  console.log(`\nSummary: ${pipeline.length} pipeline + ${approved.length} approved = ${entries.length} total drugs from ${allTrials.length} US industry trials`);
  console.log("Done.");
}

main().catch(console.error);
