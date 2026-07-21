import * as XLSX from "xlsx";
import { Pool } from "pg";
import { config } from "dotenv";
import { readFileSync, existsSync } from "fs";
import path from "path";

config({ path: path.resolve(__dirname, "../.env.local") });

const XLSX_PATH = path.resolve(__dirname, "../data/Current Treatment mapping(NCCN_ASCO) for NSCLC.xlsx");
const NCT_MAPPING_PATH = path.resolve(__dirname, "../data/nct_mapping.json");

const BIOMARKER_MAP: Record<string, string> = {
  "EGFR exon 19 deletion / L858R": "EGFR",
  "EGFR classic and selected atypical sensitizing mutations": "EGFR",
  "EGFR exon 19 deletion / L858R; also used for selected atypical EGFR": "EGFR",
  "EGFR atypical variants S768I, L861Q, G719X; also EGFR classic": "EGFR",
  "EGFR exon 20 insertion": "EGFR Exon 20",
  "EGFR exon 20 insertion; amivantamab-containing regimens": "EGFR Exon 20",
  "ALK fusion": "ALK",
  "ROS1 fusion": "ROS1",
  "BRAF V600E": "BRAF V600E",
  "KRAS G12C": "KRAS G12C",
  "NTRK1/2/3 fusion": "NTRK",
  "RET fusion": "RET",
  "MET exon 14 skipping": "MET",
  "ERBB2/HER2 mutation": "HER2",
  "ERBB2/HER2 mutation, especially TKD activating mutation": "HER2",
  "HER2 altered NSCLC": "HER2",
  "NRG1 fusion": "No Driver",
  "PD-L1 any TPS after driver-negative confirmation": "PD-L1",
  "PD-L1 driver-negative pathway": "PD-L1",
  "PD-L1 high expression; driver-negative": "PD-L1",
  "PD-L1 TPS >=50% or selected TPS 1-49% driver-negative": "PD-L1",
  "PD-L1 low/negative driver-negative pathway": "PD-L1",
  "No actionable driver or after ICI monotherapy; histology-based, not biomarker-targeted": "No Driver",
  "No actionable driver; histology-based": "No Driver",
  "No actionable driver; subsequent-line option": "No Driver",
  "Histology-based; non-squamous only": "No Driver",
  "Histology-based; no actionable driver": "No Driver",
  "Fallback when targeted option not used or after progression": "No Driver",
  "No classic predictive biomarker in sheet; listed in EGFR-mutated nonsquamous subsequent pathway": "No Driver",
};

function simplifyLot(line: string): string {
  const l = line.toLowerCase();
  if (l.startsWith("1l")) return "1L";
  if (l.startsWith("2l")) return "2L+";
  return "1L";
}

function simplifyType(t: string): string {
  if (!t) return "Single";
  const l = t.toLowerCase();
  if (l.includes("combination") || (l.includes("+") && !l.includes("+/-"))) return "Combination";
  return "Single";
}

interface RegimenRow {
  drug: string;
  type: string;
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
  single_or_combination: string;
  stage: string;
}

function parseXLSX(): RegimenRow[] {
  const wb = XLSX.readFile(XLSX_PATH);
  const ws = wb.Sheets["Metastatic + PD-L1 expression"];
  const rows = XLSX.utils.sheet_to_json<any>(ws, { header: 1 });
  const results: RegimenRow[] = [];
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[0]) continue;
    const drug = String(r[0]).trim();
    if (!drug || drug === "null") continue;
    const biomarkerDetail = String(r[4] || "").trim();
    results.push({
      drug,
      type: simplifyType(String(r[1] || "")),
      drug_class: String(r[2] || "").trim(),
      mechanism: String(r[3] || "").trim(),
      biomarker: BIOMARKER_MAP[biomarkerDetail] || "No Driver",
      biomarker_detail: biomarkerDetail,
      histology: String(r[5] || "").trim(),
      lot: simplifyLot(String(r[6] || "")),
      tier: String(r[7] || "Other").trim(),
      setting: String(r[8] || "").trim(),
      route: String(r[9] || "").trim(),
      notes: String(r[10] || "").trim(),
      pd_l1_expression: String(r[11] || "").trim(),
      patient_population: r[12] ? String(r[12]).trim() : "",
      source_sheet: String(r[13] || "").trim(),
      single_or_combination: String(r[1] || "").trim(),
      stage: "Metastatic",
    });
  }
  return results;
}

function loadNctMapping(): Record<string, any> {
  if (!existsSync(NCT_MAPPING_PATH)) return {};
  return JSON.parse(readFileSync(NCT_MAPPING_PATH, "utf-8"));
}

async function batchInsert(pool: Pool, table: string, columns: string[], rows: any[][], onConflict = "") {
  if (rows.length === 0) return;
  const BATCH = 50;
  const suffix = onConflict ? ` ON CONFLICT ${onConflict}` : "";
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const placeholders = batch
      .map((_, rIdx) => `(${columns.map((_, cIdx) => `$${rIdx * columns.length + cIdx + 1}`).join(",")})`)
      .join(",");
    const params = batch.flat();
    await pool.query(`INSERT INTO ${table} (${columns.join(",")}) VALUES ${placeholders}${suffix}`, params);
  }
}

async function seed() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) { console.error("DATABASE_URL not set."); process.exit(1); }

  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

  console.log("Parsing xlsx...");
  const regimens = parseXLSX();
  console.log(`  ${regimens.length} rows`);

  console.log("Loading NCT mapping...");
  const nctMapping = loadNctMapping();
  console.log(`  ${Object.keys(nctMapping).length} drugs mapped`);

  console.log("Clearing existing data...");
  await pool.query("DELETE FROM regimen_trials");
  await pool.query("DELETE FROM inclusion_criteria");
  await pool.query("DELETE FROM exclusion_criteria");
  await pool.query("DELETE FROM trials");
  await pool.query("DELETE FROM regimens");

  console.log("Inserting regimens...");
  const regColumns = ["drug", "type", "single_or_combination", "drug_class", "mechanism", "biomarker", "biomarker_detail", "histology", "lot", "tier", "setting", "route", "notes", "pd_l1_expression", "patient_population", "source_sheet", "stage"];
  const regRows = regimens.map((r) => [r.drug, r.type, r.single_or_combination, r.drug_class, r.mechanism, r.biomarker, r.biomarker_detail, r.histology, r.lot, r.tier, r.setting, r.route, r.notes, r.pd_l1_expression, r.patient_population, r.source_sheet, r.stage]);
  await batchInsert(pool, "regimens", regColumns, regRows);
  console.log(`  ${regimens.length} inserted`);

  console.log("Inserting trials...");
  const seenNcts = new Set<string>();
  const trialRows: any[][] = [];
  const trialDrugMap: { nctId: string; drugName: string }[] = [];

  for (const [drugName, mapping] of Object.entries(nctMapping)) {
    for (const t of mapping.trials) {
      if (seenNcts.has(t.nctId)) { trialDrugMap.push({ nctId: t.nctId, drugName }); continue; }
      seenNcts.add(t.nctId);
      trialRows.push([t.nctId, drugName, t.title, t.phases, t.status, t.startDate, t.primaryCompletionDate, t.enrollment]);
      trialDrugMap.push({ nctId: t.nctId, drugName });
    }
  }
  await batchInsert(pool, "trials", ["nct_id", "drug_name", "title", "phases", "status", "start_date", "primary_completion_date", "enrollment"], trialRows);
  console.log(`  ${seenNcts.size} trials inserted`);

  console.log("Linking regimens to trials...");
  const regResult = await pool.query("SELECT id, drug FROM regimens");
  const regimenMap = new Map<string, number>();
  for (const r of regResult.rows) regimenMap.set((r.drug as string).toLowerCase(), r.id as number);

  const pairs: { regId: number; nctId: string }[] = [];
  for (const { nctId, drugName } of trialDrugMap) {
    const firstWord = drugName.split(" ")[0].toLowerCase();
    for (const [regDrug, regId] of regimenMap) {
      if (regDrug.includes(firstWord) || firstWord.includes(regDrug)) pairs.push({ regId, nctId });
    }
  }

  const linkRows = pairs.map((p) => [p.regId, p.nctId]);
  await batchInsert(pool, "regimen_trials", ["regimen_id", "nct_id"], linkRows, "(regimen_id, nct_id) DO NOTHING");
  console.log(`  ${pairs.length} links created`);

  const s1 = await pool.query("SELECT COUNT(*) FROM regimens");
  const s2 = await pool.query("SELECT COUNT(*) FROM trials");
  console.log(`\nDone. Regimens: ${s1.rows[0].count}, Trials: ${s2.rows[0].count}`);
  await pool.end();
}

seed().catch((err) => { console.error("Seed failed:", err); process.exit(1); });
