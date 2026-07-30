"use client";

import { useMemo } from "react";
import type { PipelineProfile, PipelineRow, TrialProfile, TimelineWeights } from "@/types";
import { biomarkerBadgeClass, profileToWeights, inferProfile, projectTimeline } from "@/types";

interface Props {
  pipeline: PipelineRow[];
  profiles: PipelineProfile[];
  drugProfiles: Record<string, TrialProfile>;
  drugWeights: Record<string, TimelineWeights>;
}

export default function CompanyHeatmap({ pipeline, profiles, drugProfiles, drugWeights }: Props) {
  // Build company × biomarker matrix (count = unique trials, not drug arms)
  const matrix = useMemo(() => {
    const m = new Map<string, Map<string, { count: number; drugs: string; earliestArrival: string | null; seenNcts: Set<string> }>>();
    const allBiomarkers = new Set<string>();
    const companyTotalTrials = new Map<string, Set<string>>();

    for (const p of pipeline) {
      const pp = profiles.find((x) => x.nctId === p.nct_id);
      const sponsor = pp?.sponsor || "Unknown";
      const biomarker = p.biomarker;
      allBiomarkers.add(biomarker);

      if (!m.has(sponsor)) m.set(sponsor, new Map());
      const row = m.get(sponsor)!;

      if (!row.has(biomarker)) {
        row.set(biomarker, { count: 0, drugs: "", earliestArrival: null, seenNcts: new Set() });
      }
      const cell = row.get(biomarker)!;

      // Deduplicate by trial ID
      if (!cell.seenNcts.has(p.nct_id)) {
        cell.seenNcts.add(p.nct_id);
        cell.count++;
      }
      if (!cell.drugs.includes(p.drug)) {
        cell.drugs = cell.drugs ? cell.drugs + ", " + p.drug : p.drug;
      }
      // Update earliest arrival
      const dp = drugProfiles[p.nct_id] || inferProfile(p.phases || []);
      const dw = drugWeights[p.nct_id] || profileToWeights(dp);
      const proj = projectTimeline(p.primary_completion_date, dw);
      if (proj && (!cell.earliestArrival || proj.projectedSOC < cell.earliestArrival)) {
        cell.earliestArrival = proj.projectedSOC;
      }

      if (!companyTotalTrials.has(sponsor)) companyTotalTrials.set(sponsor, new Set());
      companyTotalTrials.get(sponsor)!.add(p.nct_id);
    }

    // Clean up internal Sets before passing to render
    const cleaned = new Map<string, Map<string, { count: number; drugs: string; earliestArrival: string | null }>>();
    for (const [sponsor, row] of m) {
      const cleanedRow = new Map<string, { count: number; drugs: string; earliestArrival: string | null }>();
      for (const [bm, cell] of row) {
        cleanedRow.set(bm, { count: cell.count, drugs: cell.drugs, earliestArrival: cell.earliestArrival });
      }
      cleaned.set(sponsor, cleanedRow);
    }

    // Sort biomarkers
    const sortedBiomarkers = [...allBiomarkers].sort();
    // Sort companies by unique trial count descending
    const sortedCompanies = [...cleaned.entries()]
      .sort((a, b) => {
        const aTotal = [...a[1].values()].reduce((s, c) => s + c.count, 0);
        const bTotal = [...b[1].values()].reduce((s, c) => s + c.count, 0);
        return bTotal - aTotal;
      });

    return { sortedCompanies, sortedBiomarkers };
  }, [pipeline, profiles, drugProfiles, drugWeights]);

  if (matrix.sortedCompanies.length === 0) {
    return <div className="oc-empty">No companies with pipeline data.</div>;
  }

  const maxCount = Math.max(
    ...matrix.sortedCompanies.map(([, row]) =>
      Math.max(...matrix.sortedBiomarkers.map((bm) => row.get(bm)?.count || 0), 0)
    ),
    1
  );

  return (
    <div className="pl-heatmap-wrap">
      {/* Header */}

      <div className="pl-heatmap">
        {/* Column headers */}
        <div className="pl-heatmap-row pl-heatmap-hdr">
          <div className="pl-heatmap-company-cell">Company</div>
          <div className="pl-heatmap-total-cell">Total</div>
          {matrix.sortedBiomarkers.map((bm) => (
            <div key={bm} className="pl-heatmap-bm-cell">
              <span className={`oc-card-bm ${biomarkerBadgeClass(bm)}`} style={{ fontSize: 9, padding: "1px 4px" }}>
                {bm}
              </span>
            </div>
          ))}
        </div>

        {/* Data rows */}
        {matrix.sortedCompanies.map(([sponsor, row]) => {
          const companyTotal = [...row.values()].reduce((s, c) => s + c.count, 0);
          return (
            <div key={sponsor} className="pl-heatmap-row pl-heatmap-data">
              <div className="pl-heatmap-company-cell" title={sponsor}>
                {sponsor.length > 20 ? sponsor.slice(0, 18) + "…" : sponsor}
              </div>
              <div className="pl-heatmap-total-cell">
                <span className="pl-heatmap-total-badge">{companyTotal}</span>
              </div>
              {matrix.sortedBiomarkers.map((bm) => {
                const cell = row.get(bm);
                if (!cell) return <div key={bm} className="pl-heatmap-cell pl-heatmap-empty" />;

                const intensity = cell.count / maxCount;
                // Color scale: light blue → dark blue
                const r = Math.round(220 - intensity * 180);
                const g = Math.round(235 - intensity * 175);
                const b = Math.round(250 - intensity * 130);
                const bg = `rgb(${r},${g},${b})`;

                return (
                  <div
                    key={bm}
                    className="pl-heatmap-cell"
                    style={{ backgroundColor: bg }}
                    title={`${sponsor} · ${bm}\n${cell.count} trial(s)\nDrugs: ${cell.drugs}\nEarliest: ${cell.earliestArrival || "—"}`}
                  >
                    <span className="pl-heatmap-count">{cell.count}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
