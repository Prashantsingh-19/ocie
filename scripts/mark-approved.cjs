require("dotenv").config({ path: require("path").resolve(__dirname, "../.env.local") });
const { Client } = require("pg");

const approved = [
  "sotorasib", "amg 510", "lumakras",
  "adagrasib", "mrtx849", "krazati",
  "pembrolizumab", "keytruda",
  "nivolumab", "opdivo",
  "atezolizumab", "tecentriq",
  "durvalumab", "imfinzi",
  "osimertinib", "tagrisso", "azd9291",
  "erlotinib", "tarceva",
  "gefitinib", "iressa",
  "crizotinib", "xalkori",
  "lorlatinib", "lorbrena",
  "tepotinib", "tepmekto",
  "cemiplimab", "libtayo",
  "amivantamab", "rybrevant",
];

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  let count = 0;
  for (const name of approved) {
    const r = await client.query(
      "UPDATE regimens SET fda_approved = TRUE WHERE LOWER(drug) LIKE '%' || $1 || '%'",
      [name]
    );
    count += r.rowCount || 0;
  }
  console.log("marked " + count + " regimens as approved");
  await client.end();
})();
