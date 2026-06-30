import * as XLSX from "xlsx";
import { Pool } from "pg";
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(__dirname, "../.env.local") });

const XLSX_PATH = path.resolve(__dirname, "../data/NSCLC_Treatment_Mapping_with_PDL1.xlsx");
const SHEET = "Metastatic_Final";

const PDL1_MAP: Record<string, string> = {
  ">= 50% (High Expressor)": ">=50%",
  "< 1% (Negative Expressor)": "<1%",
  "1% - 49% (Low Expressor)": "1-49%",
  "1% - 49% (Low Expressor) | < 1% (Negative Expressor)": "1-49%",
  ">= 50% (High Expressor) | 1% - 49% (Low Expressor) | < 1% (Negative Expressor)": "All PD-L1",
  "N/A": "N/A",
};

const BIOMARKER_MAP: Record<string, string> = {
  "EGFR": "EGFR",
  "ALK": "ALK",
  "ROS1": "ROS1",
  "KRAS": "KRAS G12C",
  "BRAF": "BRAF V600E",
  "RET": "RET",
  "NTRK1/2/3": "NTRK",
  "MET": "MET",
  "HER2": "HER2",
  "NRG1": "NRG1",
  "PD-L1": "PD-L1",
  "Histology-based;": "No Driver",
  "No": "No Driver",
  "Fallback": "No Driver",
};

function normalizePDL1(raw: string): string {
  const trimmed = raw.trim();
  return PDL1_MAP[trimmed] || trimmed;
}

function normalizeBiomarker(raw: string, rawPDL1: string): string {
  const trimmed = raw.trim();
  const mapped = BIOMARKER_MAP[trimmed] || "No Driver";
  // Rows with "No"/"Fallback"/"Histology-based;" biomarker but explicit PD-L1 value
  // are PD-L1 pathway options (chemo for PD-L1 negatives, etc.)
  if (mapped === "No Driver" && rawPDL1.trim() && rawPDL1.trim() !== "N/A") {
    return "PD-L1";
  }
  return mapped;
}

function extractLot(raw: string): string {
  const l = raw.toLowerCase();
  if (l.startsWith("1l")) return "1L";
  if (l.startsWith("2l")) return "2L+";
  return "1L";
}

function simplifyType(raw: string): string {
  const l = raw.toLowerCase();
  if (l.includes("combination") || (l.includes("+") && !l.includes("+/-"))) return "Combination";
  return "Single";
}

interface RegimenRow {
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

function parseXLSX(): RegimenRow[] {
  const wb = XLSX.readFile(XLSX_PATH);
  const ws = wb.Sheets[SHEET];
  const rows = XLSX.utils.sheet_to_json<any>(ws, { header: 1 });

  const results: RegimenRow[] = [];
  let started = false;

  for (const r of rows) {
    if (!r || !r[0]) continue;
    const cell0 = String(r[0]).trim();
    if (!started) {
      if (cell0 === "Drug / Regimen") { started = true; }
      continue;
    }
    if (!cell0 || cell0 === "null") continue;

    const rawPDL1 = String(r[10] || "").trim();
    const rawBiomarker = String(r[5] || "").trim();
    const rawLot = String(r[7] || "").trim();
    const rawCombo = String(r[1] || "").trim();

    results.push({
      drug: cell0,
      type: simplifyType(rawCombo),
      single_or_combination: rawCombo,
      drug_class: String(r[2] || "").trim(),
      mechanism: String(r[3] || "").trim(),
      biomarker: normalizeBiomarker(rawBiomarker, rawPDL1),
      biomarker_detail: String(r[4] || "").trim(),
      histology: String(r[6] || "").trim(),
      lot: extractLot(rawLot),
      tier: String(r[8] || "Other").trim(),
      setting: String(r[9] || "").trim(),
      route: String(r[12] || "").trim(),
      notes: String(r[13] || "").trim(),
      pd_l1_expression: normalizePDL1(rawPDL1),
      patient_population: String(r[11] || "").trim(),
      source_sheet: String(r[14] || "").trim(),
    });
  }
  return results;
}

async function upsertRegimens(pool: Pool, rows: RegimenRow[]) {
  const BATCH = 50;
  const columns = [
    "drug", "type", "single_or_combination", "drug_class", "mechanism",
    "biomarker", "biomarker_detail", "histology", "lot", "tier", "setting",
    "route", "notes", "pd_l1_expression", "patient_population", "source_sheet",
  ];

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const placeholders = batch
      .map((_, rIdx) => `(${columns.map((_, cIdx) => `$${rIdx * columns.length + cIdx + 1}`).join(",")})`)
      .join(",");
    const params = batch.flatMap((r) => [
      r.drug, r.type, r.single_or_combination, r.drug_class, r.mechanism,
      r.biomarker, r.biomarker_detail, r.histology, r.lot, r.tier, r.setting,
      r.route, r.notes, r.pd_l1_expression, r.patient_population, r.source_sheet,
    ]);

    await pool.query(
      `INSERT INTO regimens (${columns.join(",")})
       VALUES ${placeholders}
       ON CONFLICT (drug, biomarker, lot) DO UPDATE SET
         type = EXCLUDED.type,
         single_or_combination = EXCLUDED.single_or_combination,
         drug_class = EXCLUDED.drug_class,
         mechanism = EXCLUDED.mechanism,
         biomarker_detail = EXCLUDED.biomarker_detail,
         histology = EXCLUDED.histology,
         tier = EXCLUDED.tier,
         setting = EXCLUDED.setting,
         route = EXCLUDED.route,
         notes = EXCLUDED.notes,
         pd_l1_expression = EXCLUDED.pd_l1_expression,
         patient_population = EXCLUDED.patient_population,
         source_sheet = EXCLUDED.source_sheet`,
      params
    );
  }
}

async function seed() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) { console.error("DATABASE_URL not set."); process.exit(1); }

  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

  // Ensure unique constraint for upsert
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'regimens_drug_biomarker_lot_key'
      ) THEN
        ALTER TABLE regimens ADD CONSTRAINT regimens_drug_biomarker_lot_key UNIQUE (drug, biomarker, lot);
      END IF;
    END $$;
  `);

  console.log("Parsing SOC xlsx...");
  const regimens = parseXLSX();
  console.log(`  ${regimens.length} rows parsed`);

  console.log("Upserting regimens...");
  await upsertRegimens(pool, regimens);

  const s = await pool.query("SELECT COUNT(*) FROM regimens");
  console.log(`Done. Regimens in DB: ${s.rows[0].count}`);
  await pool.end();
}

seed().catch((err) => { console.error("Seed SOC failed:", err); process.exit(1); });
