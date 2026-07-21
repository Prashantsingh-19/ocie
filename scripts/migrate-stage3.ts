import { Pool } from "pg";
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(__dirname, "../.env.local") });

async function migrate() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL not set.");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  console.log("Adding stage column to regimens table...");
  await pool.query(
    "ALTER TABLE regimens ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'Metastatic';",
  );
  console.log("Done.");

  await pool.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
