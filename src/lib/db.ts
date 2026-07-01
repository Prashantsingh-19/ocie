import { createClient } from "@supabase/supabase-js";
import type { DashboardData, Regimen } from "@/types";

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

  const { data: regimens, error } = await supabase
    .from("regimens")
    .select("*")
    .order("biomarker")
    .order("drug");

  if (error) throw error;

  return {
    regimens: regimens as Regimen[],
  };
}
