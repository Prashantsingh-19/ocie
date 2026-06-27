"use client";

import { useState, useMemo } from "react";
import type { PipelineRow, WhiteSpaceRow, Regimen, TimelineWeights, TrialProfile } from "@/types";
import { biomarkerBadgeClass, projectTimeline, profileToWeights, monteCarloConfidence } from "@/types";

const INSIGHT_TABS = [
  { id: "timeline", label: "Timeline Gantt" },
  { id: "overlay", label: "White Space + Pipeline" },
  { id: "matrix", label: "Threat Matrix" },
  { id: "simulator", label: "Scenario Simulator" },
] as const;

type ITab = (typeof INSIGHT_TABS)[number]["id"];

interface Props {
  pipeline: PipelineRow[];
  whiteSpace: WhiteSpaceRow[];
  regimens: Regimen[];
  drugProfiles: Record<string, TrialProfile>;
  drugWeights: Record<string, TimelineWeights>;
}

export default function InsightsTab({ pipeline, whiteSpace, regimens, drugProfiles, drugWeights }: Props) {
  const [subTab, setSubTab] = useState<ITab>("timeline");
  const [simFactor, setSimFactor] = useState(1);

  const biomarkers = [...new Set(pipeline.map((p) => p.biomarker))].sort();

  // ── 1. Timeline Gantt ──
  const ganttData = useMemo(() => {
    const now = Date.now();
    return pipeline
      .map((p) => {
        const dp = drugProfiles[p.nct_id];
        const dw = drugWeights[p.nct_id] || profileToWeights(dp);
        const proj = projectTimeline(p.primary_completion_date, dw);
        const conf = proj && dp ? monteCarloConfidence(dw, dp, { enrollment: 2, cmc: 2, urgency: 3 }) : null;
        return { ...p, proj, conf };
      })
      .filter((p) => p.proj)
      .sort((a, b) => a.proj!.projectedSOC.localeCompare(b.proj!.projectedSOC));
  }, [pipeline, drugProfiles, drugWeights]);

  const maxDate = ganttData.length > 0 ? new Date(ganttData[ganttData.length - 1].proj!.projectedSOC).getTime() : Date.now() + 5 * 365 * 86400000;
  const minDate = Date.now();
  const range = Math.max(1, maxDate - minDate);

  // ── 2. White Space Overlay ──
  const overlayData = useMemo(() => {
    const pipeByCell = new Map<string, PipelineRow[]>();
    for (const p of pipeline) {
      const key = `${p.biomarker}||${p.lot}`;
      if (!pipeByCell.has(key)) pipeByCell.set(key, []);
      pipeByCell.get(key)!.push(p);
    }
    return whiteSpace.map((w) => {
      const incoming = pipeByCell.get(`${w.biomarker}||${w.lot}`) || [];
      const hasGap = w.preferred === 0;
      return { ...w, incoming, hasGap };
    });
  }, [whiteSpace, pipeline]);

  // ── 3. Threat Matrix ──
  const threatData = useMemo(() => {
    const windows = ["<2yr", "2-4yr", ">4yr"] as const;
    const nowMs = Date.now();
    const matrix = new Map<string, number[]>();
    for (const bm of biomarkers) matrix.set(bm, [0, 0, 0]);

    for (const p of pipeline) {
      const dp = drugProfiles[p.nct_id];
      const dw = drugWeights[p.nct_id] || profileToWeights(dp);
      const proj = projectTimeline(p.primary_completion_date, dw);
      if (!proj) continue;
      const mo = (new Date(proj.projectedSOC).getTime() - nowMs) / 2592000000;
      const row = matrix.get(p.biomarker);
      if (!row) continue;
      if (mo < 24) row[0]++;
      else if (mo < 48) row[1]++;
      else row[2]++;
    }
    return { windows, matrix };
  }, [pipeline, biomarkers, drugProfiles, drugWeights]);

  // ── 4. Simulator ──
  const simData = useMemo(() => {
    return pipeline.map((p) => {
      const dp = drugProfiles[p.nct_id];
      const dw0 = drugWeights[p.nct_id] || profileToWeights(dp);
      const dwAdj: TimelineWeights = {
        submission: Math.max(0, Math.round(dw0.submission * simFactor)),
        review: Math.max(0, Math.round(dw0.review * simFactor)),
        nccnLag: Math.max(0, Math.round(dw0.nccnLag * simFactor)),
      };
      const proj = projectTimeline(p.primary_completion_date, dwAdj);
      const orig = projectTimeline(p.primary_completion_date, dw0);
      return { ...p, projAdj: proj, projOrig: orig, dwAdj, dw0 };
    });
  }, [pipeline, drugProfiles, drugWeights, simFactor]);

  return (
    <div className="oc-main">
      <div className="oc-section-header">
        <div className="oc-section-title">Insights — Competitive Intelligence</div>
        <span className="oc-count">{pipeline.length} pipeline drugs</span>
      </div>

      <div className="oc-nav" style={{ marginBottom: 14 }}>
        {INSIGHT_TABS.map((t) => (
          <button key={t.id} className={`oc-tab ${subTab === t.id ? "active" : "nav-idle"}`}
            onClick={() => setSubTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ──────────────────────────────────────── */}
      {/* 1. TIMELINE GANTT                         */}
      {/* ──────────────────────────────────────── */}
      {subTab === "timeline" && (
        <div className="in-section">
          <div className="in-section-label">Competitive Timeline — Projected SOC by Biomarker</div>
          <div className="in-gantt">
            {biomarkers.map((bm) => {
              const drugs = ganttData.filter((p) => p.biomarker === bm);
              if (drugs.length === 0) return null;
              return (
                <div key={bm} className="in-gantt-group">
                  <div className="in-gantt-bm">
                    <span className={`oc-card-bm ${biomarkerBadgeClass(bm)}`}>{bm}</span>
                    <span className="in-gantt-count">{drugs.length} drugs</span>
                  </div>
                  {drugs.map((p) => {
                    const startPct = 0;
                    const endPct = Math.min(100, ((new Date(p.proj!.projectedSOC).getTime() - minDate) / range) * 100);
                    const color = p.conf ? p.conf.color : "#888";
                    return (
                      <div key={p.nct_id} className="in-gantt-row">
                        <div className="in-gantt-bar-wrap">
                          <div className="in-gantt-bar" style={{ width: `${endPct - startPct}%`, backgroundColor: color }} />
                        </div>
                        <span className="in-gantt-drug">{p.drug}</span>
                        <span className="in-gantt-date">{p.proj!.projectedSOC}</span>
                        {p.conf && (
                          <span className="in-gantt-conf" style={{ color }}>
                            {p.conf.label === "High confidence" ? "●" : p.conf.label === "Moderate confidence" ? "◆" : "○"} {p.conf.confidence}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {ganttData.length === 0 && <div className="oc-empty">No pipeline data to display.</div>}
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────── */}
      {/* 2. WHITE SPACE + PIPELINE OVERLAY         */}
      {/* ──────────────────────────────────────── */}
      {subTab === "overlay" && (
        <div className="in-section">
          <div className="in-section-label">White Space — Pipeline Incoming Drugs by Biomarker × LOT</div>
          <div className="ws-table-wrap">
            <table className="ws-table in-overlay-table">
              <thead>
                <tr>
                  <th>Biomarker</th>
                  <th>LOT</th>
                  <th>Regimens</th>
                  <th>Preferred</th>
                  <th>Gap</th>
                  <th>Incoming Pipeline</th>
                </tr>
              </thead>
              <tbody>
                {overlayData.map((w) => (
                  <tr key={`${w.biomarker}-${w.lot}`}>
                    <td><span className={`oc-card-bm ${biomarkerBadgeClass(w.biomarker)}`}>{w.biomarker}</span></td>
                    <td className="ws-lot">{w.lot}</td>
                    <td className="ws-num">{w.total}</td>
                    <td className={`ws-num ${w.preferred === 0 ? "ws-zero" : ""}`}>{w.preferred}</td>
                    <td>
                      <span className="ws-gap-badge" style={{
                        backgroundColor: w.hasGap ? (w.incoming.length > 0 ? "#e09f3e" : "#d00000") : "#2d6a4f"
                      }}>
                        {w.hasGap ? (w.incoming.length > 0 ? "Pending" : "Gap") : "Covered"}
                      </span>
                    </td>
                    <td className="in-incoming-cell">
                      {w.incoming.length > 0 ? (
                        <div className="in-incoming-list">
                          {w.incoming.map((p) => {
                            const dp = drugProfiles[p.nct_id];
                            const dw = drugWeights[p.nct_id] || profileToWeights(dp);
                            const proj = projectTimeline(p.primary_completion_date, dw);
                            return (
                              <span key={p.nct_id} className="in-incoming-tag">
                                {p.drug}
                                {proj && <span className="in-incoming-date">{proj.projectedSOC}</span>}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="in-incoming-none" style={{ color: w.hasGap ? "#d00000" : "#aaa" }}>
                          {w.hasGap ? "Unaddressed gap" : "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────── */}
      {/* 3. THREAT MATRIX                           */}
      {/* ──────────────────────────────────────── */}
      {subTab === "matrix" && (
        <div className="in-section">
          <div className="in-section-label">Competitive Threat Matrix — Pipeline Density by Time Window</div>
          <div className="ws-table-wrap">
            <table className="ws-table in-matrix">
              <thead>
                <tr>
                  <th>Biomarker</th>
                  {threatData.windows.map((w) => <th key={w} className="ws-num">{w}</th>)}
                  <th className="ws-num">Total</th>
                </tr>
              </thead>
              <tbody>
                {biomarkers.map((bm) => {
                  const counts = threatData.matrix.get(bm) || [0, 0, 0];
                  const total = counts.reduce((a, b) => a + b, 0);
                  const cellColor = (c: number) =>
                    c === 0 ? "#2d6a4f" : c <= 2 ? "#e09f3e" : "#d00000";
                  return (
                    <tr key={bm}>
                      <td><span className={`oc-card-bm ${biomarkerBadgeClass(bm)}`}>{bm}</span></td>
                      {counts.map((c, i) => (
                        <td key={i} className="ws-num">
                          <span className="in-matrix-cell" style={{ backgroundColor: cellColor(c) }}>
                            {c}
                          </span>
                        </td>
                      ))}
                      <td className="ws-num" style={{ fontWeight: 600 }}>{total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="in-matrix-legend">
            <span><span className="in-legend-dot" style={{ background: "#2d6a4f" }} /> 0 competitors</span>
            <span><span className="in-legend-dot" style={{ background: "#e09f3e" }} /> 1-2 competitors</span>
            <span><span className="in-legend-dot" style={{ background: "#d00000" }} /> 3+ competitors</span>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────── */}
      {/* 4. SCENARIO SIMULATOR                      */}
      {/* ──────────────────────────────────────── */}
      {subTab === "simulator" && (
        <div className="in-section">
          <div className="in-section-label">Scenario Simulator</div>
          <div className="in-sim-controls">
            <span className="oc-filter-label">Global timeline multiplier</span>
            <div className="in-sim-slider-row">
              <span>0.5×</span>
              <input type="range" min={0.5} max={2} step={0.1} value={simFactor}
                onChange={(e) => setSimFactor(+e.target.value)} />
              <span>2×</span>
              <span className="in-sim-val">{simFactor}×</span>
              <button className="oc-tab nav-idle" onClick={() => setSimFactor(1)}>Reset</button>
            </div>
          </div>
          <div className="ws-table-wrap" style={{ marginTop: 12 }}>
            <table className="ws-table in-sim-table">
              <thead>
                <tr>
                  <th>Drug</th>
                  <th>Biomarker</th>
                  <th>Original SOC</th>
                  <th>Adjusted SOC</th>
                  <th>Shift</th>
                </tr>
              </thead>
              <tbody>
                {simData.map((p) => {
                  const shift = p.projAdj && p.projOrig
                    ? Math.round((new Date(p.projAdj.projectedSOC).getTime() - new Date(p.projOrig.projectedSOC).getTime()) / 2592000000)
                    : 0;
                  return (
                    <tr key={p.nct_id}>
                      <td className="pl-drug">{p.drug}</td>
                      <td><span className={`oc-card-bm ${biomarkerBadgeClass(p.biomarker)}`}>{p.biomarker}</span></td>
                      <td className="pl-date">{p.projOrig?.projectedSOC || "—"}</td>
                      <td className="pl-date">{p.projAdj?.projectedSOC || "—"}</td>
                      <td className="pl-val-offset" style={{ color: shift > 0 ? "#d00000" : shift < 0 ? "#2d6a4f" : "#888" }}>
                        {shift > 0 ? `+${shift}mo` : shift < 0 ? `${shift}mo` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
