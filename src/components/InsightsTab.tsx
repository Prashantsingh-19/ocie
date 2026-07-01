"use client";

import { useMemo } from "react";
import type { PipelineRow, Regimen, TimelineWeights, TrialProfile } from "@/types";
import { biomarkerBadgeClass, projectTimeline, profileToWeights, inferProfile, RAW_TO_DISPLAY } from "@/types";

interface Props {
  pipeline: PipelineRow[];
  regimens: Regimen[];
  drugProfiles: Record<string, TrialProfile>;
  drugWeights: Record<string, TimelineWeights>;
}

const LOTS_2L_PLUS = ["2L", "2L+", "3L", "3L+", "Subsequent"];

function is2LPlus(lot: string): boolean {
  return LOTS_2L_PLUS.some((l) => lot.includes(l) || l.includes(lot));
}

export default function InsightsTab({ pipeline, regimens, drugProfiles, drugWeights }: Props) {
  const data = useMemo(() => {
    const pipeByKey = new Map<string, (PipelineRow & { projSOC: string | null; horizonMo: number | null })[]>();
    for (const p of pipeline) {
      const dp = drugProfiles[p.nct_id] || inferProfile(p.phases || []);
      const dw = drugWeights[p.nct_id] || profileToWeights(dp);
      const proj = projectTimeline(p.primary_completion_date, dw);
      if (!proj) continue;
      const key = `${p.biomarker}||${p.lot}`;
      if (!pipeByKey.has(key)) pipeByKey.set(key, []);
      pipeByKey.get(key)!.push({
        ...p,
        projSOC: proj.projectedSOC,
        horizonMo: Math.round((new Date(proj.projectedSOC).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30.44)),
      });
    }

    const regByBm = new Map<string, Regimen[]>();
    for (const r of regimens) {
      const key = RAW_TO_DISPLAY[r.biomarker] || r.biomarker;
      if (!regByBm.has(key)) regByBm.set(key, []);
      regByBm.get(key)!.push(r);
    }

    const result: {
      biomarker: string;
      regimens1L: Regimen[];
      regimens2LPlus: Regimen[];
      pipeline1L: (PipelineRow & { projSOC: string | null; horizonMo: number | null })[];
      pipeline2LPlus: (PipelineRow & { projSOC: string | null; horizonMo: number | null })[];
    }[] = [];

    for (const [bm, regs] of regByBm) {
      const regs1L = regs.filter((r) => r.lot === "1L");
      const regs2LPlus = regs.filter((r) => is2LPlus(r.lot));

      const incoming1L: (PipelineRow & { projSOC: string | null; horizonMo: number | null })[] = [];
      const incoming2LPlus: (PipelineRow & { projSOC: string | null; horizonMo: number | null })[] = [];

      for (const r of regs1L) {
        const rawBm = r.biomarker;
        const key = `${bm}||${r.lot}`;
        const rawKey = `${rawBm}||${r.lot}`;
        const pipeDrugs = pipeByKey.get(key) || pipeByKey.get(rawKey);
        if (pipeDrugs) {
          for (const pd of pipeDrugs) {
            if (!incoming1L.find((x) => x.nct_id === pd.nct_id)) incoming1L.push(pd);
          }
        }
      }
      for (const r of regs2LPlus) {
        const rawBm = r.biomarker;
        const key = `${bm}||${r.lot}`;
        const rawKey = `${rawBm}||${r.lot}`;
        const pipeDrugs = pipeByKey.get(key) || pipeByKey.get(rawKey);
        if (pipeDrugs) {
          for (const pd of pipeDrugs) {
            if (!incoming2LPlus.find((x) => x.nct_id === pd.nct_id)) incoming2LPlus.push(pd);
          }
        }
      }

      if (regs1L.length > 0 || regs2LPlus.length > 0) {
        result.push({
          biomarker: bm,
          regimens1L: regs1L,
          regimens2LPlus: regs2LPlus,
          pipeline1L: incoming1L,
          pipeline2LPlus: incoming2LPlus,
        });
      }
    }

    result.sort((a, b) => a.biomarker.localeCompare(b.biomarker));
    return result;
  }, [pipeline, regimens, drugProfiles, drugWeights]);

  return (
    <div className="oc-main">
      <div className="oc-section-header">
        <div className="oc-section-title">Insights — Current SOC &amp; Incoming Pipeline</div>
        <span className="oc-count">{regimens.length} SOC · {pipeline.length} pipeline</span>
      </div>

      {data.length === 0 ? (
        <div className="oc-empty">No data matches current filters.</div>
      ) : (
        data.map((group) => (
          <div key={group.biomarker} className="in-group">
            <div className="in-group-header">
              <span className={`oc-card-bm ${biomarkerBadgeClass(group.biomarker)}`}>{group.biomarker}</span>
              <span className="in-group-count">
                {group.regimens1L.length + group.regimens2LPlus.length} regimens ·
                {group.pipeline1L.length + group.pipeline2LPlus.length} incoming
              </span>
            </div>

            <div className="in-group-cols">
              {/* ── 1L Column ── */}
              <div className="in-col">
                <div className="in-col-header">1L</div>
                {group.regimens1L.length === 0 ? (
                  <div className="in-empty-col">No SOC regimens</div>
                ) : (
                  group.regimens1L.map((r) => {
                    const incoming = group.pipeline1L.filter((p) => p.lot === r.lot || p.lot === "1L");
                    return (
                      <div key={r.id} className="in-soc-card">
                        <div className="in-soc-header">
                          <span className="in-soc-drug">{r.drug}</span>
                          <span className={`tag ${r.tier === "Preferred" ? "tag-preferred" : r.tier === "UICC" ? "tag-uicc" : "tag-subsequent"}`}>{r.tier}</span>
                          <span className={`tag ${r.type === "Combination" ? "tag-type-combo" : "tag-type-single"}`}>{r.type === "Combination" ? "Combo" : "Single"}</span>
                        </div>
                        <div className="in-soc-detail">{r.drug_class}{r.histology ? ` · ${r.histology}` : ""}</div>

                        {incoming.length > 0 && (
                          <div className="in-pipe-list">
                            <div className="in-pipe-label">Incoming</div>
                            {incoming.map((p) => (
                              <div key={p.nct_id} className="in-pipe-tag">
                                <span className="in-pipe-drug">{p.drug}</span>
                                <span className="in-pipe-horizon" style={{
                                  color: p.horizonMo !== null && p.horizonMo < 12 ? "#2d6a4f" : p.horizonMo !== null && p.horizonMo < 24 ? "#e09f3e" : p.horizonMo !== null && p.horizonMo < 48 ? "#d00000" : "#aa80a0",
                                }}>
                                  {p.projSOC || "—"}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* ── 2L+ Column ── */}
              <div className="in-col">
                <div className="in-col-header">2L &amp; Subsequent</div>
                {group.regimens2LPlus.length === 0 ? (
                  <div className="in-empty-col">No SOC regimens</div>
                ) : (
                  group.regimens2LPlus.map((r) => {
                    const incoming = group.pipeline2LPlus.filter((p) => p.lot === r.lot || is2LPlus(p.lot));
                    return (
                      <div key={r.id} className="in-soc-card">
                        <div className="in-soc-header">
                          <span className="in-soc-drug">{r.drug}</span>
                          <span className={`tag ${r.tier === "Preferred" ? "tag-preferred" : r.tier === "UICC" ? "tag-uicc" : "tag-subsequent"}`}>{r.tier}</span>
                          <span className={`tag ${r.type === "Combination" ? "tag-type-combo" : "tag-type-single"}`}>{r.type === "Combination" ? "Combo" : "Single"}</span>
                        </div>
                        <div className="in-soc-detail">{r.drug_class}{r.histology ? ` · ${r.histology}` : ""}</div>

                        {incoming.length > 0 && (
                          <div className="in-pipe-list">
                            <div className="in-pipe-label">Incoming</div>
                            {incoming.map((p) => (
                              <div key={p.nct_id} className="in-pipe-tag">
                                <span className="in-pipe-drug">{p.drug}</span>
                                <span className="in-pipe-horizon" style={{
                                  color: p.horizonMo !== null && p.horizonMo < 12 ? "#2d6a4f" : p.horizonMo !== null && p.horizonMo < 24 ? "#e09f3e" : p.horizonMo !== null && p.horizonMo < 48 ? "#d00000" : "#aa80a0",
                                }}>
                                  {p.projSOC || "—"}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Summary chips */}
            {(group.pipeline1L.length > 0 || group.pipeline2LPlus.length > 0) && (
              <div className="in-group-pipe-summary">
                <span className="in-group-pipe-label">All incoming:</span>
                {[...group.pipeline1L, ...group.pipeline2LPlus].map((p) => (
                  <span key={p.nct_id} className="in-pipe-chip">
                    {p.drug}
                    <span className="in-pipe-chip-date">{p.projSOC || "—"}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
