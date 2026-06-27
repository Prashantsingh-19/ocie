export interface Regimen {
  id: number;
  drug: string;
  type: string;
  single_or_combination: string;
  drug_class: string;
  mechanism: string;
  biomarker: string;
  biomarker_detail: string;
  histology: string;
  lot: string;
  tier: string;
  setting: string;
  route: string;
  notes: string;
  pd_l1_expression: string;
  patient_population: string;
  source_sheet: string;
}

export interface Trial {
  id: number;
  nct_id: string;
  drug_name: string;
  title: string;
  phases: string[];
  status: string;
  start_date: string;
  primary_completion_date: string;
  enrollment: number | null;
}

export interface DashboardData {
  regimens: Regimen[];
  trials: Trial[];
  whiteSpace: WhiteSpaceRow[];
  pipeline: PipelineRow[];
}

export interface WhiteSpaceRow {
  biomarker: string;
  lot: string;
  total: number;
  preferred: number;
  uicc: number;
  subsequent: number;
  trials: number;
  activeTrials: number;
}

export function gapScore(row: WhiteSpaceRow): number {
  if (row.preferred > 0) return 0;
  if (row.total === 0) return 3;
  if (row.activeTrials > 5) return 3;
  if (row.activeTrials > 0) return 2;
  return 1;
}

export function gapLabel(score: number): string {
  return ["None", "Low", "Medium", "High"][score];
}

export function gapColor(score: number): string {
  return ["#2d6a4f", "#e09f3e", "#e85d04", "#d00000"][score];
}

export interface KpiData {
  totalRegimens: number;
  biomarkerTargets: number;
  preferred1L: number;
  combinationCount: number;
  pdl1Count: number;
}

export function computeKpis(data: Regimen[]): KpiData {
  const biomarkers = new Set(data.map((r) => r.biomarker));
  return {
    totalRegimens: data.length,
    biomarkerTargets: biomarkers.size,
    preferred1L: data.filter((r) => r.tier === "Preferred").length,
    combinationCount: data.filter((r) => r.type === "Combination").length,
    pdl1Count: data.filter((r) => r.biomarker === "PD-L1").length,
  };
}

export function filterRegimens(data: Regimen[], filters: {
  biomarker: string;
  combo: string;
  hist: string;
  lot: string;
}): Regimen[] {
  return data.filter((r) => {
    if (filters.biomarker !== "All Biomarkers" && r.biomarker !== filters.biomarker) return false;
    if (filters.combo !== "All" && r.type !== filters.combo) return false;
    if (filters.hist !== "All" && !r.histology.toLowerCase().includes(filters.hist.toLowerCase())) return false;
    if (filters.lot !== "All" && r.lot !== filters.lot) return false;
    return true;
  });
}

export function biomarkerBadgeClass(biomarker: string): string {
  const map: Record<string, string> = {
    "EGFR": "bm-EGFR",
    "EGFR Exon 20": "bm-EGFR-Exon-20",
    "ALK": "bm-ALK",
    "ROS1": "bm-ROS1",
    "PD-L1": "bm-PD-L1",
    "KRAS G12C": "bm-KRAS-G12C",
    "BRAF V600E": "bm-BRAF-V600E",
    "RET": "bm-RET",
    "NTRK": "bm-NTRK",
    "MET": "bm-MET",
    "HER2": "bm-HER2",
    "No Driver": "bm-No-Driver",
  };
  return map[biomarker] || "bm-No-Driver";
}

export function tierTagClass(tier: string): string {
  if (tier === "Preferred") return "tag tag-preferred";
  if (tier === "UICC") return "tag tag-uicc";
  if (tier === "Subsequent") return "tag tag-subsequent";
  return "tag tag-other";
}

export function cardBorderClass(tier: string): string {
  if (tier === "Preferred") return "preferred";
  if (tier === "UICC") return "uicc";
  if (tier === "Subsequent") return "subsequent";
  return "";
}

export interface PipelineRow {
  regimen_id: number;
  drug: string;
  biomarker: string;
  lot: string;
  tier: string;
  nct_id: string;
  phases: string[];
  status: string;
  start_date: string | null;
  primary_completion_date: string | null;
  enrollment: number | null;
}

export interface TimelineWeights {
  submission: number;
  review: number;
  nccnLag: number;
}

export const DEFAULT_WEIGHTS: Record<string, TimelineWeights> = {
  standard: { submission: 2, review: 8, nccnLag: 5 },
  accelerated: { submission: 2, review: 4, nccnLag: 5 },
};

export function projectTimeline(
  pcd: string | null,
  weights: TimelineWeights
): { projectedFDA: string; projectedSOC: string } | null {
  if (!pcd) return null;
  const d = new Date(pcd);
  const add = (n: number) => {
    const r = new Date(d);
    r.setMonth(r.getMonth() + Math.round(n));
    return r.toISOString().slice(0, 10);
  };
  return {
    projectedFDA: add(weights.submission + weights.review),
    projectedSOC: add(weights.submission + weights.review + weights.nccnLag),
  };
}

export const BIOMARKERS = [
  "All Biomarkers", "EGFR", "EGFR Exon 20", "ALK", "ROS1", "PD-L1",
  "KRAS G12C", "BRAF V600E", "RET", "NTRK", "MET", "HER2", "No Driver",
];
