import { getDashboardData } from "@/lib/db";
import DashboardClient from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function Page() {
  let data;
  let error: string | null = null;

  try {
    data = await getDashboardData();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load data";
  }

  return <DashboardClient data={data ?? null} error={error} />;
}
