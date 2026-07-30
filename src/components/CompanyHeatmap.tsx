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

interface HeatCell {
  /** Unique trial count for this company × biomarker */
  count: number;
  /** Drug names (comma-separated) */
  drugs: string;
  /** Earliest projected SOC date among these drugs */
  earliestArrival: string | null;
}

export default function CompanyHeatmap({ pipeline, profiles, drugProfiles, drugWeights }: Props) {
  // Build company × biomarker matrix
  const matrix = useMemo(() => {
    const m = new Map<string, Map<string, HeatCell>>();
    const allBiomarkers = new Set<string>();
    const companyOrder = new Map<string, number>(); // total trials per company for ordering

    for (const p of pipeline) {
      const pp = profiles.find((x) => x.nctId === p.nct_id);
      const sponsor = pp?.sponsor || "Unknown";
      const biomarker = p.biomarker;
      allBiomarkers.add(biomarker);

      if (!m.has(sponsor)) m.set(sponsor, new Map());
      const row = m.get(sponsor)!;

      const existing = row.get(biomarker);
      if (existing) {
        existing.count++;
        if (!existing.drugs.includes(p.drug)) existing.drugs += ", " + p.drug;
        // Update earliest arrival
        const dp = drugProfiles[p.nct_id] || inferProfile(p.phases || []);
        const dw = drugWeights[p.nct_id] || profileToWeights(dp);
        const proj = projectTimeline(p.primary_completion_date, dw);
        if (proj && (!existing.earliestArrival || proj.projectedSOC < existing.earliestArrival)) {
          existing.earliestArrival = proj.projectedSOC;
        }
      } else {
        // Compute arrival
        let arrival: string | null = null;
        const dp = drugProfiles[p.nct_id] || inferProfile(p.phases || []);
        const dw = drugWeights[p.nct_id] || profileToWeights(dp);
        const proj = projectTimeline(p.primary_completion_date, dw);
        if (proj) arrival = proj.projectedSOC;

        row.set(biomarker, { count: 1, drugs: p.drug, earliestArrival: arrival });
      }

      companyOrder.set(sponsor, (companyOrder.get(sponsor) || 0) + 1);
    }

    // Sort biomarkers
    const sortedBiomarkers = [...allBiomarkers].sort();
    // Sort companies by total trials descending
    const sortedCompanies = [...m.entries()]
      .sort((a, b) => (companyOrder.get(b[0]) || 0) - (companyOrder.get(a[0]) || 0));

    return { sortedCompanies, sortedBiomarkers, m, companyOrder };
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
          const companyTotal = matrix.companyOrder.get(sponsor) || 0;
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
