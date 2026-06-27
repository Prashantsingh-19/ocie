/**
 * Compare 3 models on the same 6 validation drugs:
 * Model 1: Original presets (Standard +15mo, Accelerated +11mo)
 * Model 2: Double-counting: presets + endpoint/enrollment/design modifiers on top
 * Model A: Dropdown-only: no presets, offset assembled purely from dropdown selections
 */

type Endpoint = "ORR" | "PFS" | "OS";
type Enrollment = "Fast" | "Average" | "Slow";
type Design = "SingleArm" | "RCT";
type Pathway = "Priority" | "Standard";

interface DrugProfile {
  drug: string;
  type: "standard" | "accelerated";
  pcd: string;
  actualFDA: string;
  actualSOC: string;
  endpoint: Endpoint;
  enrollment: Enrollment;
  design: Design;
  pathway: Pathway;
}

const DRUGS: DrugProfile[] = [
  {
    drug: "Osimertinib", type: "standard",
    pcd: "2017-06-19", actualFDA: "2018-04-18", actualSOC: "2018-09-01",
    endpoint: "PFS", enrollment: "Fast", design: "RCT", pathway: "Priority",
  },
  {
    drug: "Alectinib", type: "standard",
    pcd: "2017-02-09", actualFDA: "2017-11-06", actualSOC: "2018-03-01",
    endpoint: "PFS", enrollment: "Fast", design: "RCT", pathway: "Priority",
  },
  {
    drug: "Pembrolizumab", type: "standard",
    pcd: "2016-05-09", actualFDA: "2016-10-24", actualSOC: "2017-03-01",
    endpoint: "PFS", enrollment: "Fast", design: "RCT", pathway: "Priority",
  },
  {
    drug: "Sotorasib", type: "accelerated",
    pcd: "2020-12-01", actualFDA: "2021-05-28", actualSOC: "2021-10-01",
    endpoint: "ORR", enrollment: "Fast", design: "SingleArm", pathway: "Priority",
  },
  {
    drug: "Selpercatinib", type: "accelerated",
    pcd: "2019-06-17", actualFDA: "2020-05-08", actualSOC: "2020-11-01",
    endpoint: "ORR", enrollment: "Average", design: "SingleArm", pathway: "Priority",
  },
  {
    drug: "Larotrectinib", type: "accelerated",
    pcd: "2018-07-15", actualFDA: "2018-11-26", actualSOC: "2019-04-01",
    endpoint: "ORR", enrollment: "Slow", design: "SingleArm", pathway: "Priority",
  },
];

function months(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24 * 30.44);
}

function addMonths(d: string, n: number): string {
  const r = new Date(d);
  r.setMonth(r.getMonth() + Math.round(n));
  return r.toISOString().slice(0, 10);
}

// ────────────────────────────────
// MODEL 1: Original presets
// ────────────────────────────────
function model1Presets(p: DrugProfile): number {
  return p.type === "standard" ? 15 : 11;
}

// ────────────────────────────────
// MODEL 2: Double-counting (presets + modifiers stacked on top)
// Modifier values that were used in the earlier test
// ────────────────────────────────
function model2DoubleCount(p: DrugProfile): number {
  const base = p.type === "standard" ? 15 : 11;

  // These modifiers are the ones that produced 4.1mo avg error
  const endAdj: Record<Endpoint, number> = { ORR: -4, PFS: 0, OS: 8 };
  const enrAdj: Record<Enrollment, number> = { Fast: -3, Average: 0, Slow: 6 };
  const desAdj: Record<Design, number> = { SingleArm: -4, RCT: 0 };

  return base + endAdj[p.endpoint] + enrAdj[p.enrollment] + desAdj[p.design];
}

// ────────────────────────────────
// MODEL A: Dropdown-only assembly (no presets, no double-counting)
// offset = (2 + enr + des)  +  (pathway + endpoint)  +  5 (NCCN)
//          └── submission ──┘  └── review ─────────┘    └── fixed ──┘
//
// Each dropdown contributes independently. No hidden assumptions.
// ────────────────────────────────
function modelADropdown(p: DrugProfile): number {
  const subBase = 2;
  const enrAdj: Record<Enrollment, number> = { Fast: -2, Average: 0, Slow: 4 };
  const desAdj: Record<Design, number> = { SingleArm: -2, RCT: 0 };
  const submission = Math.max(0, subBase + enrAdj[p.enrollment] + desAdj[p.design]);

  const pathwayDur: Record<Pathway, number> = { Priority: 6, Standard: 10 };
  const endPtAdj: Record<Endpoint, number> = { ORR: -2, PFS: 0, OS: 4 };
  const review = pathwayDur[p.pathway] + endPtAdj[p.endpoint];

  const nccn = 5;

  return submission + review + nccn;
}

// ────────────────────────────────
// TEST ALL 3
// ────────────────────────────────
function testModel(name: string, fn: (p: DrugProfile) => number) {
  console.log(`\n\n═══ ${name} ═══\n`);

  let totalAbsError = 0;
  const results: { drug: string; offset: number; actualSOCmo: number; error: number }[] = [];

  for (const p of DRUGS) {
    const offset = fn(p);
    const projectedSOC = addMonths(p.pcd, offset);
    const actualSOCmo = months(p.pcd, p.actualSOC);
    const error = months(p.actualSOC, projectedSOC); // + = late, - = early

    totalAbsError += Math.abs(error);
    results.push({ drug: p.drug, offset, actualSOCmo, error });

    console.log(
      `${p.drug.padEnd(18)} offset=${offset.toFixed(0).padStart(3)}mo  ` +
      `actual=${actualSOCmo.toFixed(1).padStart(5)}mo  ` +
      `proj=${projectedSOC}  ` +
      `Δ=${(error > 0 ? "+" : "") + error.toFixed(1).padStart(5)}mo`
    );
  }

  const avgAbs = totalAbsError / DRUGS.length;
  console.log(`\n  Average absolute error: ${avgAbs.toFixed(1)}mo`);
  return { avgAbs, results };
}

function main() {
  console.log("Comparing 3 models against actual PCD→SOC timelines:");
  console.log("Model 1: Original presets (Std +15mo, Acc +11mo)");
  console.log("Model 2: Presets + modifiers stacked (double-counted)");
  console.log("Model A: Dropdown-only assembly (no presets)\n");

  const m1 = testModel("MODEL 1 — Original Presets", model1Presets);
  const m2 = testModel("MODEL 2 — Presets + Modifiers", model2DoubleCount);
  const mA = testModel("MODEL A — Dropdown-Only", modelADropdown);

  console.log("\n\n");
  console.log("═══ COMPARISON ═══\n");
  console.log(`Model 1 (Presets):         ${m1.avgAbs.toFixed(1)}mo avg error`);
  console.log(`Model 2 (Double-counted):  ${m2.avgAbs.toFixed(1)}mo avg error`);
  console.log(`Model A (Dropdown-only):   ${mA.avgAbs.toFixed(1)}mo avg error`);
  console.log("");

  if (mA.avgAbs <= m1.avgAbs) {
    console.log("→ Model A (dropdown-only) is equal or better than Model 1.");
    console.log("  It resolves the double-counting issue without sacrificing accuracy.");
  } else if (mA.avgAbs <= m2.avgAbs) {
    console.log(`→ Model A (dropdown-only) is ${(mA.avgAbs - m1.avgAbs).toFixed(1)}mo worse than Model 1,`);
    console.log(`  but ${(m2.avgAbs - mA.avgAbs).toFixed(1)}mo better than Model 2 (double-counted).`);
    console.log("  The dropdown structure is cleaner but the simple presets are more accurate.");
  } else {
    console.log("→ Model A is the worst performer. Stick with Model 1.");
  }

  console.log("\n\n═══ PER-DRUG BREAKDOWN ═══");
  console.log("Drug              Presets  DblCount  Dropdown  Best");
  console.log("───────────────────────────────────────────────────");
  for (let i = 0; i < DRUGS.length; i++) {
    const e1 = Math.abs(m1.results[i].error).toFixed(1);
    const e2 = Math.abs(m2.results[i].error).toFixed(1);
    const eA = Math.abs(mA.results[i].error).toFixed(1);
    const min = Math.min(m1.results[i].errorAbs ?? 99, Infinity); // fix later
    console.log(
      `${DRUGS[i].drug.padEnd(17)} ` +
      `${e1.padStart(5)}mo  ${e2.padStart(5)}mo  ${eA.padStart(5)}mo`
    );
  }
}

main();