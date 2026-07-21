import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
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

  console.log("Parsing xlsx...");
  const regimens = parseXLSX();
  console.log(`  ${regimens.length} rows`);

  console.log("Loading NCT mapping...");
  const nctMapping = loadNctMapping();
  console.log(`  ${Object.keys(nctMapping).length} drugs mapped`);

  console.log("Clearing existing data...");
  await supabase.from("regimen_trials").delete().neq("id", 0);
  await supabase.from("inclusion_criteria").delete().neq("id", 0);
  await supabase.from("exclusion_criteria").delete().neq("id", 0);
  await supabase.from("trials").delete().neq("id", 0);
  await supabase.from("regimens").delete().neq("id", 0);

  console.log("Inserting regimens...");
  const regRows = regimens.map((r) => ({
    drug: r.drug, type: r.type, single_or_combination: r.single_or_combination,
    drug_class: r.drug_class, mechanism: r.mechanism, biomarker: r.biomarker,
    biomarker_detail: r.biomarker_detail, histology: r.histology, lot: r.lot,
    tier: r.tier, setting: r.setting, route: r.route, notes: r.notes,
    pd_l1_expression: r.pd_l1_expression, patient_population: r.patient_population,
    source_sheet: r.source_sheet, stage: r.stage,
  }));
  await batchInsert(supabase, "regimens", regRows);
  console.log(`  ${regimens.length} inserted`);

  console.log("Inserting trials...");
  const seenNcts = new Set<string>();
  const trialRows: any[] = [];
  const trialDrugMap: { nctId: string; drugName: string }[] = [];

  for (const [drugName, mapping] of Object.entries(nctMapping)) {
    for (const t of mapping.trials) {
      if (seenNcts.has(t.nctId)) { trialDrugMap.push({ nctId: t.nctId, drugName }); continue; }
      seenNcts.add(t.nctId);
      trialRows.push({
        nct_id: t.nctId, drug_name: drugName, title: t.title,
        phases: t.phases, status: t.status, start_date: t.startDate,
        primary_completion_date: t.primaryCompletionDate, enrollment: t.enrollment,
      });
      trialDrugMap.push({ nctId: t.nctId, drugName });
    }
  }
  await batchInsert(supabase, "trials", trialRows);
  console.log(`  ${seenNcts.size} trials inserted`);

  console.log("Linking regimens to trials...");
  const { data: regData, error: regErr } = await supabase.from("regimens").select("id, drug");
  if (regErr) throw regErr;
  const regimenMap = new Map<string, number>();
  for (const r of regData) regimenMap.set((r.drug as string).toLowerCase(), r.id as number);

  const seenLinks = new Set<string>();
  const linkRows: any[] = [];
  for (const { nctId, drugName } of trialDrugMap) {
    const firstWord = drugName.split(" ")[0].toLowerCase();
    for (const [regDrug, regId] of regimenMap) {
      if (!(regDrug.includes(firstWord) || firstWord.includes(regDrug))) continue;
      const key = `${regId}:${nctId}`;
      if (seenLinks.has(key)) continue;
      seenLinks.add(key);
      linkRows.push({ regimen_id: regId, nct_id: nctId });
    }
  }
  await batchInsert(supabase, "regimen_trials", linkRows);
  console.log(`  ${linkRows.length} links created`);

  const { count: regCount } = await supabase.from("regimens").select("*", { count: "exact", head: true });
  const { count: trialCount } = await supabase.from("trials").select("*", { count: "exact", head: true });
  console.log(`\nDone. Regimens: ${regCount}, Trials: ${trialCount}`);
}

seed().catch((err) => { console.error("Seed failed:", err); process.exit(1); });
