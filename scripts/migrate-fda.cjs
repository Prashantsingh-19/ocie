const { Client } = require("pg");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  await client.query(
    "ALTER TABLE regimens ADD COLUMN IF NOT EXISTS fda_approved BOOLEAN DEFAULT FALSE;"
  );
  console.log("column added");

  await client.query(`
    CREATE OR REPLACE VIEW pipeline_drugs AS
    SELECT DISTINCT ON (r.id)
      r.id as regimen_id, r.drug, r.biomarker, r.lot, r.tier,
      t.nct_id, t.phases, t.status, t.start_date, t.primary_completion_date, t.enrollment
    FROM regimens r
    JOIN regimen_trials rt ON rt.regimen_id = r.id
    JOIN trials t ON t.nct_id = rt.nct_id
    WHERE r.fda_approved = FALSE
    ORDER BY r.id,
      CASE WHEN t.phases @> ARRAY['PHASE3'::text] THEN 0
           WHEN t.phases @> ARRAY['PHASE2'::text] THEN 1
           WHEN t.phases @> ARRAY['PHASE1'::text] THEN 2 ELSE 3 END,
      t.start_date DESC NULLS LAST;
  `);
  console.log("view updated");

  const jsonPath = path.resolve(__dirname, "../data/pipeline_dashboard.json");
  if (fs.existsSync(jsonPath)) {
    const raw = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    const approvedNames = new Set();
    for (const e of [...(raw.approved || []), ...(raw.pipeline || [])]) {
      if (e.inSOC) approvedNames.add(e.drug.toLowerCase());
    }
    console.log("marking " + approvedNames.size + " drugs...");
    let count = 0;
    for (const name of approvedNames) {
      const r = await client.query(
        "UPDATE regimens SET fda_approved = TRUE WHERE LOWER(drug) = $1",
        [name]
      );
      count += r.rowCount || 0;
    }
    console.log("marked " + count + " regimens as approved");
  }

  await client.end();
  console.log("done");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
