/**
 * Timeline Estimator — JSON-Backed Lookup with Fallback Chain
 *
 * Given a pipeline drug entry (biomarker, stage, phases), estimate how many
 * months remain from today until SOC entry by looking up similar approved drugs.
 *
 * Lookup chain (highest priority first):
 *   1. timeline_benchmarks: biomarker + stage + segment match
 *   2. timeline_benchmarks: Any + stage + segment match
 *   3. phase_duration_lookups: phase + stage match
 *   4. phase_duration_lookups: phase + Any match
 *   5. Static default values
 *
 * All data loaded from local JSON files (no external DB).
 */
import type { PipelineProfile } from "@/types";
import { loadPhaseDurationLookups, loadTimelineBenchmarks } from "@/lib/db";

export interface PhaseDurationRow {
  phase: string;
  stage: string;
  p25: number | null;
  p50: number;
  p75: number | null;
  sample_size: number;
  source_drugs?: string[];
}

export interface BenchmarkRow {
  biomarker: string;
  stage: string;
  segment: string;
  p25: number | null;
  p50: number;
  p75: number | null;
  sample_size: number;
  source_drugs?: string[];
}

export interface TimelineEstimate {
  projectedSOC: string;
  confidence: "High" | "Moderate" | "Low";
  sources: string[];
  monthsRemaining: number;
  breakdown: { label: string; months: number }[];
}

// ── Static Fallbacks ──

const STATIC_PHASE_DURATIONS: Record<string, number> = {
  PHASE1: 18,
  PHASE2: 24,
  PHASE3: 36,
  SUBMISSION: 2,
  REVIEW: 8,
  NCCN_LAG: 5,
};

// ── Lazy-loaded lookups ──

let _phaseLookups: PhaseDurationRow[] | null = null;
let _benchmarks: BenchmarkRow[] | null = null;

function getPhaseLookups(): PhaseDurationRow[] {
  if (!_phaseLookups) {
    _phaseLookups = loadPhaseDurationLookups() as unknown as PhaseDurationRow[];
  }
  return _phaseLookups;
}

function getBenchmarks(): BenchmarkRow[] {
  if (!_benchmarks) {
    _benchmarks = loadTimelineBenchmarks() as unknown as BenchmarkRow[];
  }
  return _benchmarks;
}

// ── Phase Duration Lookup ──

function findPhaseDuration(phase: string, stage: string): PhaseDurationRow | null {
  const lookups = getPhaseLookups();
  for (const s of [stage, "Any"]) {
    const found = lookups.find((l) => l.phase === phase && l.stage === s);
    if (found) return found;
  }
  return null;
}

// ── Benchmark Lookup ──

function findBenchmark(biomarker: string, stage: string, segment: string): BenchmarkRow | null {
  const benchmarks = getBenchmarks();
  const combos = [
    { biomarker, stage },
    { biomarker: "Any", stage },
    { biomarker, stage: "Any" },
    { biomarker: "Any", stage: "Any" },
  ];
  for (const c of combos) {
    const found = benchmarks.find((b) => b.biomarker === c.biomarker && b.stage === c.stage && b.segment === segment);
    if (found) return found;
  }
  return null;
}

// ── Phase-to-Segment Mapping ──

function phaseToSegments(phases: string[]): string[] {
  const segments: string[] = [];
  const hasP3 = phases.some((p) => p.includes("PHASE3"));
  const hasP2 = phases.some((p) => p.includes("PHASE2"));
  const hasP1 = phases.some((p) => p.includes("PHASE1"));

  if (hasP3) {
    segments.push("P3→FDA", "FDA→SOC");
  } else if (hasP2) {
    segments.push("P2→P3", "P3→FDA", "FDA→SOC");
  } else if (hasP1) {
    segments.push("P1→P2", "P2→P3", "P3→FDA", "FDA→SOC");
  }
  return segments;
}

// ── Main Estimate Function ──

export function estimateSOC(entry: PipelineProfile): TimelineEstimate | null {
  const today = new Date();
  const stage = entry.stages?.[0] || "Metastatic";
  const phases = entry.phases || [];

  if (phases.length === 0) return null;

  const sources: string[] = [];
  let totalMonths = 0;
  const breakdown: { label: string; months: number }[] = [];

  const segments = phaseToSegments(phases);

  for (const segment of segments) {
    let months: number | null = null;
    let sourceType = "static";

    // 1. Try full benchmark lookup
    const bench = findBenchmark(entry.biomarker, stage, segment);
    if (bench) {
      months = bench.p50;
      sourceType = `benchmark(${entry.biomarker},${stage},${segment})`;
      sources.push(sourceType);
    }

    if (months === null) {
      // 2. Fall back to phase duration lookup
      let phase = "";
      if (segment === "P1→P2") phase = "PHASE1";
      else if (segment === "P2→P3") phase = "PHASE2";
      else if (segment === "P3→FDA") phase = "PHASE3";
      else if (segment === "FDA→SOC") phase = "NCCN_LAG";

      if (phase) {
        const pd = findPhaseDuration(phase, stage);
        if (pd) {
          months = pd.p50;
          sourceType = `phase_duration(${phase},${stage})`;
          sources.push(sourceType);
        }
      }
    }

    if (months === null) {
      // 3. Static fallback
      if (segment === "P1→P2") months = STATIC_PHASE_DURATIONS.PHASE1;
      else if (segment === "P2→P3") months = STATIC_PHASE_DURATIONS.PHASE2;
      else if (segment === "P3→FDA") months = STATIC_PHASE_DURATIONS.PHASE3;
      else if (segment === "FDA→SOC") months = STATIC_PHASE_DURATIONS.NCCN_LAG;
      sourceType = "static";
      sources.push(sourceType);
    }

    totalMonths += months!;
    breakdown.push({ label: segment, months: months! });
  }

  // Add submission prep and FDA review
  totalMonths += STATIC_PHASE_DURATIONS.SUBMISSION + STATIC_PHASE_DURATIONS.REVIEW;
  breakdown.push(
    { label: "Submission prep", months: STATIC_PHASE_DURATIONS.SUBMISSION },
    { label: "FDA Review", months: STATIC_PHASE_DURATIONS.REVIEW }
  );
  sources.push("static(submission+review)");

  const projected = new Date(today);
  projected.setMonth(projected.getMonth() + Math.round(totalMonths));
  const projectedSOC = projected.toISOString().slice(0, 10);

  const hasBenchmark = sources.some((s) => s.startsWith("benchmark"));
  const hasPhaseDuration = sources.some((s) => s.startsWith("phase_duration"));
  const confidence = hasBenchmark ? "High" : hasPhaseDuration ? "Moderate" : "Low";

  return {
    projectedSOC,
    confidence,
    sources,
    monthsRemaining: Math.round(totalMonths),
    breakdown,
  };
}
