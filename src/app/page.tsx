import { getDashboardData } from "@/lib/db";
import DashboardClient from "@/components/Dashboard";
import type { PipelineProfile } from "@/types";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

function loadPipelineProfiles(): PipelineProfile[] | null {
  let all: PipelineProfile[] = [];
  try {
    const p = path.join(process.cwd(), "data", "pipeline_dashboard.json");
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
      all = [...(raw.pipeline || []), ...(raw.approved || [])];
    }
  } catch {}

  // Also load Stage III trials (separate file, hand-curated)
  try {
    const s3 = path.join(process.cwd(), "data", "stage3_pipeline.json");
    if (fs.existsSync(s3)) {
      const stage3 = JSON.parse(fs.readFileSync(s3, "utf-8"));
      for (const entry of stage3) {
        // Avoid dupes by nctId
        if (!all.some(e => e.nctId === entry.nctId)) {
          all.push(entry);
        }
      }
    }
  } catch {}

  return all.length > 0 ? all : null;
}

export default async function Page() {
  let data;
  let error: string | null = null;

  try {
    data = await getDashboardData();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load data";
  }

  const pipelineProfiles = loadPipelineProfiles();

  return <DashboardClient data={data ? { ...data, pipelineProfiles: pipelineProfiles ?? undefined } : null} error={error} />;
}
