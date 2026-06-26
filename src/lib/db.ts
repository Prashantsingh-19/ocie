import { createClient } from "@supabase/supabase-js";
import type { DashboardData, Regimen, Trial, WhiteSpaceRow } from "@/types";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  }
  return createClient(url, key);
}

export async function getDashboardData(): Promise<DashboardData> {
  const supabase = getSupabase();

  const [regimensRes, trialsRes, whiteSpaceRes] = await Promise.all([
    supabase
      .from("regimens")
      .select("*")
      .order("biomarker")
      .order("drug"),
    supabase
      .from("trials")
      .select("*")
      .order("drug_name"),
    supabase
      .from("white_space")
      .select("*"),
  ]);

  if (regimensRes.error) throw regimensRes.error;
  if (trialsRes.error) throw trialsRes.error;
  if (whiteSpaceRes.error) throw whiteSpaceRes.error;

  return {
    regimens: regimensRes.data as Regimen[],
    trials: trialsRes.data as Trial[],
    whiteSpace: whiteSpaceRes.data as WhiteSpaceRow[],
  };
}
