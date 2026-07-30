import fs from "fs";
import path from "path";
import os from "os";
import type { DashboardData, Regimen } from "@/types";

const SOC_DATA_PATH = path.join(process.cwd(), "data", "soc_data.json");
const PIPELINE_DASHBOARD_PATH = path.join(process.cwd(), "data", "pipeline_dashboard.json");
const PHASE_LOOKUPS_PATH = path.join(process.cwd(), "data", "phase_duration_lookups.json");
const BENCHMARKS_PATH = path.join(process.cwd(), "data", "timeline_benchmarks.json");
const GUIDELINES_PATH = path.join(os.homedir(), "Desktop", "nsclc_guidelines.json");

/** Build drug → biomarker_detail map from NCCN guidelines */
function loadBiomarkerDetailMap(): Record<string, string> {
  try {
    if (!fs.existsSync(GUIDELINES_PATH)) return {};
    const raw = JSON.parse(fs.readFileSync(GUIDELINES_PATH, "utf-8"));
    if (!Array.isArray(raw)) return {};
    const map: Record<string, string> = {};
    for (const g of raw) {
      const drug = (g.drug as string || "").toLowerCase().trim();
      const bio = (g.biomarker as string || "").trim();
      if (drug && bio) map[drug] = bio;
    }
    return map;
  } catch {
    return {};
  }
}

/**
 * Load dashboard data from local JSON files (no Supabase dependency).
 *
 * Regimen data: `data/soc_data.json` (58 entries)
 * Pipeline data: `data/pipeline_dashboard.json`
 */
export async function getDashboardData(): Promise<DashboardData> {
  let regimens: Regimen[] = [];

  const detailMap = loadBiomarkerDetailMap();

  try {
    const raw = JSON.parse(fs.readFileSync(SOC_DATA_PATH, "utf-8"));
    if (Array.isArray(raw)) {
      regimens = raw.map((r: Record<string, unknown>, i: number) => {
        const drugName = (r.drug as string) || "";
        const biomarker = (r.biomarker as string) || "";
        const drugKey = drugName.toLowerCase().trim();

        // Try exact drug match, then biomarker-based fallback
        let biomarkerDetail = (r.biomarker_detail as string) || detailMap[drugKey] || "";
        if (!biomarkerDetail) {
          // Fallback: extract detail from guidelines that match this biomarker group
          const matched = Object.entries(detailMap).find(([, v]) =>
            v.toLowerCase().includes(biomarker.toLowerCase())
          );
          if (matched) biomarkerDetail = matched[1];
        }

        return {
          id: i + 1,
          drug: drugName,
          type: (r.type as string) || "",
          single_or_combination: (r.type as string) === "Combination" ? "Combination" : "Single",
          drug_class: (r.drugClass as string) || (r.drug_class as string) || "",
          mechanism: (r.mechanism as string) || "",
          biomarker,
          biomarker_detail: biomarkerDetail,
          histology: (r.histology as string) || "",
          lot: (r.lot as string) || "",
          tier: (r.tier as string) || "",
          setting: (r.setting as string) || "",
          route: (r.route as string) || "",
          notes: (r.notes as string) || "",
          pd_l1_expression: (r.pd_l1_expression as string) || (r.pdl1 as string) || "N/A",
          patient_population: (r.patient_population as string) || (r.setting as string) || "",
          source_sheet: (r.source_sheet as string) || "NCCN 2025",
          stage: (r.stage as string) || "Metastatic",
        };
      });
    }
  } catch {
    // If no soc_data.json, return empty regimens
  }

  return {
    regimens,
  };
}

/** Lookup tables for timeline estimator */
export function loadPhaseDurationLookups(): Record<string, unknown>[] {
  try {
    if (!fs.existsSync(PHASE_LOOKUPS_PATH)) return [];
    return JSON.parse(fs.readFileSync(PHASE_LOOKUPS_PATH, "utf-8"));
  } catch {
    return [];
  }
}

export function loadTimelineBenchmarks(): Record<string, unknown>[] {
  try {
    if (!fs.existsSync(BENCHMARKS_PATH)) return [];
    return JSON.parse(fs.readFileSync(BENCHMARKS_PATH, "utf-8"));
  } catch {
    return [];
  }
}
