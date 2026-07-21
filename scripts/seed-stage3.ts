import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(__dirname, "../.env.local") });

const XLSX_PATH = path.resolve(
  __dirname,
  "../NSCLC_Stage3_Treatment_Mapping_VERIFIED_rows1-19.xlsx",
);

const STAGE3_BIOMARKER_MAP: Record<string, string> = {
  "Driver-negative": "No Driver",
  "EGFR": "EGFR",
  "ALK": "ALK",
};

function simplifyType(t: string): string {
  if (!t) return "Single";
  const l = t.toLowerCase();
  if (l.includes("combination") || (l.includes("+") && !l.includes("+/-"))) return "Combination";
  return "Single";
}

interface Stage3Row {
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
  stage: string;
}

function parseStage3(): Stage3Row[] {
  const wb = XLSX.readFile(XLSX_PATH);
  const ws = wb.Sheets["Stage3_Final"];
  const rows = XLSX.utils.sheet_to_json<any>(ws, { header: 1 });
  const results: Stage3Row[] = [];

  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[0]) continue;
    const drug = String(r[0]).trim();
    if (!drug || drug === "null") continue;

    const biomarkerDetail = String(r[4] || "").trim();
    const biomarkerHigh = String(r[5] || "").trim();

    let notes = String(r[13] || "").trim();
    const link = String(r[15] || "").trim();
    if (link) notes += notes ? ` | ${link}` : link;
    const flag = String(r[16] || "").trim();
    if (flag) notes += notes ? ` | Flag: ${flag}` : `Flag: ${flag}`;

    results.push({
      drug,
      type: simplifyType(String(r[1] || "")),
      single_or_combination: String(r[1] || "").trim(),
      drug_class: String(r[2] || "").trim(),
      mechanism: String(r[3] || "").trim(),
      biomarker: STAGE3_BIOMARKER_MAP[biomarkerHigh] || "No Driver",
      biomarker_detail: biomarkerDetail,
      histology: String(r[6] || "").trim(),
      lot: "1L",
      tier: String(r[8] || "Other").trim(),
      setting: String(r[7] || "").trim(),
      route: String(r[12] || "").trim(),
      notes,
      pd_l1_expression: String(r[10] || "").trim(),
      patient_population: String(r[11] || "").trim(),
      source_sheet: "Stage3_Final",
      stage: "Stage III",
    });
  }
  return results;
}

async function batchInsert(supabase: any, table: string, rows: any[]) {
  if (rows.length === 0) return;
  const BATCH = 50;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase.from(table).insert(batch);
    if (error) throw error;
  }
}

async function seed() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set."); process.exit(1); }

  const supabase = createClient(url, key);

  console.log("Parsing Stage 3 xlsx...");
  const regimens = parseStage3();
  console.log(`  ${regimens.length} rows`);

  console.log("Inserting Stage 3 regimens...");
  const rows = regimens.map((r) => ({
    drug: r.drug, type: r.type, single_or_combination: r.single_or_combination,
    drug_class: r.drug_class, mechanism: r.mechanism, biomarker: r.biomarker,
    biomarker_detail: r.biomarker_detail, histology: r.histology, lot: r.lot,
    tier: r.tier, setting: r.setting, route: r.route, notes: r.notes,
    pd_l1_expression: r.pd_l1_expression, patient_population: r.patient_population,
    source_sheet: r.source_sheet, stage: r.stage,
  }));
  await batchInsert(supabase, "regimens", rows);
  console.log(`  ${regimens.length} inserted`);

  const { count } = await supabase.from("regimens").select("*", { count: "exact", head: true });
  console.log(`\nDone. Total regimens: ${count}`);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
