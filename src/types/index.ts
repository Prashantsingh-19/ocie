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
  pipelineProfiles?: PipelineProfile[];
}

export interface PipelineProfile {
  nctId: string;
  drug: string;
  biomarker: string;
  sponsor: string;
  usBased: boolean;
  phases: string[];
  histology?: "Squamous" | "Non-squamous" | "Mixed" | "Unknown";
  designType: "RCT" | "SingleArm" | "Adaptive";
  endpoint: "PFS" | "ORR" | "OS";
  enrollmentRate: "Fast" | "Average" | "Slow";
  fda: { btd: boolean; aa: boolean; priorityReview: boolean };
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

export type TrialEndpoint = "PFS" | "ORR" | "OS";
export type TrialEnrollment = "Fast" | "Average" | "Slow";
export type TrialDesign = "RCT" | "SingleArm" | "Adaptive";
export type TrialPathway = "Standard" | "Accelerated";

export interface TrialProfile {
  endpoint: TrialEndpoint;
  enrollment: TrialEnrollment;
  design: TrialDesign;
  pathway: TrialPathway;
  btd: boolean;
  aa: boolean;
  priorityReview: boolean;
}

export interface RiskSliders {
  enrollment: number;  // 1-5
  cmc: number;         // 1-5
  urgency: number;     // 1-5
}

export const DEFAULT_PROFILES: Record<TrialPathway, TrialProfile> = {
  Standard: { endpoint: "PFS", enrollment: "Fast", design: "RCT", pathway: "Standard", btd: true, aa: false, priorityReview: true },
  Accelerated: { endpoint: "ORR", enrollment: "Fast", design: "SingleArm", pathway: "Accelerated", btd: true, aa: true, priorityReview: true },
};

export const DEFAULT_RISK: RiskSliders = { enrollment: 2, cmc: 2, urgency: 3 };

export function profileToWeights(profile: TrialProfile): TimelineWeights {
  const isAcc = profile.pathway === "Accelerated";
  let review = isAcc ? 4 : 8;
  let submission = 2;

  const isDefaultStd = !isAcc && profile.endpoint === "PFS" && profile.enrollment === "Fast" && profile.design === "RCT";
  const isDefaultAcc = isAcc && profile.endpoint === "ORR" && profile.enrollment === "Fast" && profile.design === "SingleArm";

  if (!isDefaultStd && !isDefaultAcc) {
    if (profile.endpoint === "OS") review += isAcc ? 3 : 5;
    else if (profile.endpoint === "ORR" && !isAcc) review -= 2;
    if (profile.enrollment === "Slow") review += 4;
    else if (profile.enrollment === "Average") review += 1;
    if (!isAcc && profile.design === "SingleArm") submission -= 1;
    else if (isAcc && profile.design === "RCT") submission += 2;
    else if (profile.design === "Adaptive") review -= 1;
  }

  return { submission, review, nccnLag: 5 };
}

export function profileDescription(profile: TrialProfile, weights: TimelineWeights, risk: RiskSliders): string {
  const parts: string[] = [];
  parts.push(`${profile.pathway} pathway`);
  parts.push(`${profile.endpoint} endpoint`);
  if (profile.btd) parts.push("BTD");
  if (profile.aa) parts.push("AA");
  if (profile.priorityReview) parts.push("Priority");
  return parts.join(" · ");
}

/** Sample from a triangular distribution with min, mode, max */
function sampleTriangular(min: number, mode: number, max: number): number {
  const u = Math.random();
  const f = (mode - min) / (max - min);
  if (u <= f) return min + Math.sqrt(u * (max - min) * (mode - min));
  return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}

/**
 * Monte Carlo simulation over timeline weights.
 * Runs N iterations sampling each weight from a triangular distribution whose
 * bounds widen based on risk sliders and tighten based on FDA designations.
 *
 * Returns percentiles and a confidence score based on distribution tightness.
 */
export function monteCarloConfidence(
  weights: TimelineWeights,
  profile: TrialProfile,
  risk: RiskSliders,
  n = 10000
): {
  p10: number;
  p50: number;
  p90: number;
  confidence: number;
  label: string;
  color: string;
} {
  const r = risk.enrollment / 5;
  const results: number[] = [];

  // Distribution bounds per weight, adjusted by risk + designations
  const subMin = Math.max(0, weights.submission - 1 - r);
  const subMode = profile.btd ? Math.max(0, weights.submission - 0.5) : weights.submission;
  const subMax = Math.min(8, weights.submission + 2 + r);

  const revMin = profile.priorityReview ? Math.max(2, weights.review - 1) : Math.max(0, weights.review - 2 - r);
  const revMode = weights.review;
  const revMax = profile.btd ? Math.min(12, weights.review + 2) : Math.min(18, weights.review + 4 + r + risk.cmc / 5);

  const nccnMin = Math.max(0, weights.nccnLag - 1);
  const nccnMode = weights.nccnLag;
  const nccnMax = weights.nccnLag + 3 + risk.urgency / 5;

  for (let i = 0; i < n; i++) {
    const sub = sampleTriangular(subMin, subMode, subMax);
    const rev = sampleTriangular(revMin, revMode, revMax);
    const nccn = sampleTriangular(nccnMin, nccnMode, nccnMax);
    results.push(sub + rev + nccn);
  }

  results.sort((a, b) => a - b);
  const p10 = results[Math.floor(n * 0.1)];
  const p50 = results[Math.floor(n * 0.5)];
  const p90 = results[Math.floor(n * 0.9)];

  // Confidence: inverse of relative spread
  const spread = p90 - p10;
  const confRaw = 100 - spread * 3.5;
  const confidence = Math.max(10, Math.min(99, Math.round(confRaw)));

  let label: string, color: string;
  if (confidence >= 70) { label = "High confidence"; color = "#2d6a4f"; }
  else if (confidence >= 45) { label = "Moderate confidence"; color = "#e09f3e"; }
  else { label = "Low confidence"; color = "#d00000"; }

  return { p10: Math.round(p10 * 10) / 10, p50: Math.round(p50 * 10) / 10, p90: Math.round(p90 * 10) / 10, confidence, label, color };
}

export function computePhaseBreakdown(profile: TrialProfile, weights: TimelineWeights): { label: string; months: number; color: string }[] {
  const phases: { label: string; months: number; color: string }[] = [];
  if (weights.submission > 0) phases.push({ label: "Submission prep", months: weights.submission, color: "#B85C38" });
  phases.push({ label: "FDA Review", months: weights.review, color: "#e09f3e" });
  phases.push({ label: "NCCN adoption", months: weights.nccnLag, color: "#7a8fa0" });
  return phases;
}

export function computeDrivers(profile: TrialProfile, weights: TimelineWeights): { label: string; effect: string; positive: boolean }[] {
  const drivers: { label: string; effect: string; positive: boolean }[] = [];
  if (profile.btd) drivers.push({ label: "BTD: rolling review", effect: "Saves ~18mo overall", positive: true });
  if (profile.aa) drivers.push({ label: "AA: Accelerated Approval", effect: "Removes confirmatory Ph3 from critical path", positive: true });
  if (profile.priorityReview) drivers.push({ label: "Priority Review", effect: "6mo clock (vs 10mo standard)", positive: true });
  if (profile.endpoint === "OS") drivers.push({ label: "OS endpoint", effect: "Adds follow-up time for event maturity", positive: false });
  if (profile.enrollment === "Slow") drivers.push({ label: "Slow enrollment", effect: "Accrual delay risk (+4-8mo)", positive: false });
  if (profile.design === "SingleArm" && profile.pathway === "Standard") drivers.push({ label: "Single-arm design", effect: "Smaller submission package (−1mo)", positive: true });
  if (profile.design === "Adaptive") drivers.push({ label: "Adaptive design", effect: "Interim stopping rules (−1mo)", positive: true });
  return drivers;
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

export function profileTagSummary(profile: TrialProfile): string {
  const parts: string[] = [];
  parts.push(profile.endpoint);
  parts.push(profile.design === "RCT" ? "RCT" : profile.design === "SingleArm" ? "SA" : "Adapt");
  parts.push(profile.enrollment === "Fast" ? "Fast" : profile.enrollment === "Average" ? "Avg" : "Slow");
  if (profile.btd) parts.push("BTD");
  if (profile.aa) parts.push("AA");
  if (profile.priorityReview) parts.push("PR");
  return parts.join("·");
}

export function inferProfile(phases: string[], pathway?: TrialPathway): TrialProfile {
  const hasP3 = phases.some((p) => p.includes("PHASE3"));
  const hasP2 = phases.some((p) => p.includes("PHASE2"));
  const hasP1 = phases.some((p) => p.includes("PHASE1"));
  const pw = pathway || "Standard";

  if (hasP3) {
    return { endpoint: "PFS", enrollment: "Fast", design: "RCT", pathway: pw, btd: true, aa: false, priorityReview: true };
  }
  if (hasP2) {
    return { endpoint: "ORR", enrollment: "Average", design: "SingleArm", pathway: pw, btd: true, aa: false, priorityReview: false };
  }
  if (hasP1) {
    return { endpoint: "ORR", enrollment: "Slow", design: "SingleArm", pathway: pw, btd: false, aa: false, priorityReview: false };
  }
  return { endpoint: "PFS", enrollment: "Fast", design: "RCT", pathway: pw, btd: true, aa: false, priorityReview: true };
}

export const BIOMARKERS = [
  "All Biomarkers", "EGFR", "EGFR Exon 20", "ALK", "ROS1", "PD-L1",
  "KRAS G12C", "BRAF V600E", "RET", "NTRK", "MET", "HER2", "No Driver",
];
