import * as XLSX from "xlsx";
import { Pool } from "pg";
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

function extractLotFromSetting(setting: string): string {
  const s = setting.toLowerCase();
  if (
    s.includes("neoadjuvant") || s.includes("adjuvant") ||
    s.includes("perioperative") || s.includes("definitive") ||
    s.includes("consolidation") || s.includes("sequential") ||
    s.includes("rt alone")
  ) return "1L";
  return "1L";
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

  // Row 0 = title, Row 1 = header, Data from Row 2
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[0]) continue;
    const drug = String(r[0]).trim();
    if (!drug || drug === "null") continue;

    const biomarkerDetail = String(r[4] || "").trim();
    const biomarkerHigh = String(r[5] || "").trim();

    // Build notes: col 13 + link (col 15) + flag (col 16)
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
      lot: extractLotFromSetting(String(r[7] || "")),
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

async function batchInsert(
  pool: Pool, table: string, columns: string[], rows: any[][],
  onConflict = "",
) {
  if (rows.length === 0) return;
  const BATCH = 50;
  const suffix = onConflict ? ` ON CONFLICT ${onConflict}` : "";
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const placeholders = batch
      .map((_, rIdx) =>
        `(${columns.map((_, cIdx) => `$${rIdx * columns.length + cIdx + 1}`).join(",")})`
      )
      .join(",");
    const params = batch.flat();
    await pool.query(
      `INSERT INTO ${table} (${columns.join(",")}) VALUES ${placeholders}${suffix}`,
      params,
    );
  }
}

async function seed() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL not set.");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  console.log("Parsing Stage 3 xlsx...");
  const regimens = parseStage3();
  console.log(`  ${regimens.length} rows`);

  console.log("Inserting Stage 3 regimens...");
  const columns = [
    "drug", "type", "single_or_combination", "drug_class", "mechanism",
    "biomarker", "biomarker_detail", "histology", "lot", "tier", "setting",
    "route", "notes", "pd_l1_expression", "patient_population", "source_sheet",
    "stage",
  ];
  const values = regimens.map((r) => [
    r.drug, r.type, r.single_or_combination, r.drug_class, r.mechanism,
    r.biomarker, r.biomarker_detail, r.histology, r.lot, r.tier, r.setting,
    r.route, r.notes, r.pd_l1_expression, r.patient_population, r.source_sheet,
    r.stage,
  ]);
  await batchInsert(pool, "regimens", columns, values);
  console.log(`  ${regimens.length} inserted`);

  const { rows: count } = await pool.query("SELECT COUNT(*) FROM regimens");
  console.log(`\nDone. Total regimens: ${count[0].count}`);
  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
