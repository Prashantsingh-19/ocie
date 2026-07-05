"use client";

import { useState, useMemo } from "react";
import type { PipelineRow, Regimen, TimelineWeights, TrialProfile } from "@/types";
import { biomarkerBadgeClass, projectTimeline, profileToWeights, inferProfile, RAW_TO_DISPLAY } from "@/types";

interface Props {
  pipeline: PipelineRow[];
  regimens: Regimen[];
  drugProfiles: Record<string, TrialProfile>;
  drugWeights: Record<string, TimelineWeights>;
}

const LOTS_2L_PLUS = ["2L", "2L+", "3L", "3L+", "Subsequent"];
const DEFAULT_SHOWN = 4;
const SCROLL_STEP = 6;

function is2LPlus(lot: string): boolean {
  return LOTS_2L_PLUS.some((l) => lot.includes(l) || l.includes(lot));
}

function horizonColor(mo: number | null): string {
  if (mo === null) return "#aa80a0";
  if (mo < 12) return "#2d6a4f";
  if (mo < 24) return "#e09f3e";
  if (mo < 48) return "#d00000";
  return "#aa80a0";
}

export default function InsightsTab({ pipeline, regimens, drugProfiles, drugWeights }: Props) {
  const [expandedBm, setExpandedBm] = useState<Record<string, "1L" | "2L+" | null>>({});
  const [scrollOffsets, setScrollOffsets] = useState<Record<string, number>>({});
  const [showDensity, setShowDensity] = useState(true);

  const densityData = useMemo(() => {
    const socByBm = new Map<string, number>();
    for (const r of regimens) {
      const key = RAW_TO_DISPLAY[r.biomarker] || r.biomarker;
      socByBm.set(key, (socByBm.get(key) || 0) + 1);
    }
    const pipeByBm = new Map<string, number>();
    for (const p of pipeline) {
      const key = RAW_TO_DISPLAY[p.biomarker] || p.biomarker;
      pipeByBm.set(key, (pipeByBm.get(key) || 0) + 1);
    }
    const allBms = [...new Set([...socByBm.keys(), ...pipeByBm.keys()])].sort();
    return allBms.map((bm) => {
      const soc = socByBm.get(bm) || 0;
      const pipe = pipeByBm.get(bm) || 0;
      let label: string, color: string;
      if (soc <= 2) { label = "Low Density"; color = "#2d6a4f"; }
      else if (soc <= 5) { label = "Medium Density"; color = "#e09f3e"; }
      else { label = "High Density"; color = "#8a817c"; }
      return { biomarker: bm, socCount: soc, pipelineCount: pipe, density: { label, color } };
    });
  }, [regimens, pipeline]);

  const data = useMemo(() => {
    const pipeWithProj: (PipelineRow & { projSOC: string | null; horizonMo: number | null })[] = [];
    for (const p of pipeline) {
      const dp = drugProfiles[p.nct_id] || inferProfile(p.phases || []);
      const dw = drugWeights[p.nct_id] || profileToWeights(dp);
      const proj = projectTimeline(p.primary_completion_date, dw);
      if (!proj) continue;
      pipeWithProj.push({ ...p, projSOC: proj.projectedSOC, horizonMo: (new Date(proj.projectedSOC).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30.44) });
    }

    const regByBm = new Map<string, Regimen[]>();
    for (const r of regimens) {
      const key = RAW_TO_DISPLAY[r.biomarker] || r.biomarker;
      if (!regByBm.has(key)) regByBm.set(key, []);
      regByBm.get(key)!.push(r);
    }

    const pipelineByBm = new Map<string, typeof pipeWithProj>();
    for (const p of pipeWithProj) {
      const key = RAW_TO_DISPLAY[p.biomarker] || p.biomarker;
      if (!pipelineByBm.has(key)) pipelineByBm.set(key, []);
      pipelineByBm.get(key)!.push(p);
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
      if (regs1L.length === 0 && regs2LPlus.length === 0) continue;

      const allPipe = pipelineByBm.get(bm) || [];
      const pipe1L = allPipe.filter((p) => p.lot === "1L");
      const pipe2LPlus = allPipe.filter((p) => is2LPlus(p.lot));

      result.push({ biomarker: bm, regimens1L: regs1L, regimens2LPlus: regs2LPlus, pipeline1L: pipe1L, pipeline2LPlus: pipe2LPlus });
    }

    result.sort((a, b) => a.biomarker.localeCompare(b.biomarker));
    return result;
  }, [pipeline, regimens, drugProfiles, drugWeights]);

  const toggleExpand = (bm: string, lot: "1L" | "2L+") => {
    setExpandedBm((prev) => ({ ...prev, [bm]: prev[bm] === lot ? null : lot }));
    setScrollOffsets((prev) => ({ ...prev, [bm]: 0 }));
  };

  const scrollMore = (bm: string) => {
    setScrollOffsets((prev) => ({ ...prev, [bm]: (prev[bm] || 0) + SCROLL_STEP }));
  };

  const renderColumn = (
    bm: string,
    label: string,
    regimens: Regimen[],
    pipeline: (PipelineRow & { projSOC: string | null; horizonMo: number | null })[]
  ) => {
    const isExpanded = expandedBm[bm] === (label === "1L" ? "1L" : "2L+");
    const showing = isExpanded ? regimens.length : Math.min(regimens.length, DEFAULT_SHOWN);
    const offset = scrollOffsets[bm] || 0;
    const visibleRegimens = isExpanded ? regimens.slice(offset, offset + SCROLL_STEP) : regimens.slice(0, DEFAULT_SHOWN);
    const hasMore = isExpanded ? offset + SCROLL_STEP < regimens.length : regimens.length > DEFAULT_SHOWN;

    return (
      <div className="in-col">
        <div className="in-col-header">{label}</div>

        {/* SOC section */}
        {regimens.length === 0 ? (
          <div className="in-empty-col">No SOC regimens</div>
        ) : (
          <div className="in-soc-list">
            {visibleRegimens.map((r) => (
              <div key={r.id} className="in-soc-card">
                <div className="in-soc-header">
                  <span className="in-soc-drug">{r.drug}</span>
                  <span className={`tag ${r.tier === "Preferred" ? "tag-preferred" : r.tier === "UICC" ? "tag-uicc" : "tag-subsequent"}`}>{r.tier}</span>
                  <span className={`tag ${r.type === "Combination" ? "tag-type-combo" : "tag-type-single"}`}>{r.type === "Combination" ? "Combo" : "Single"}</span>
                </div>
                <div className="in-soc-detail">{r.drug_class}{r.histology ? ` · ${r.histology}` : ""}</div>
              </div>
            ))}
            {isExpanded && hasMore && (
              <button className="in-scroll-btn" onClick={() => scrollMore(bm)}>Show {SCROLL_STEP} more</button>
            )}
          </div>
        )}

        {/* Show more / less toggle */}
        {regimens.length > DEFAULT_SHOWN && (
          <button className="in-expand-btn" onClick={() => toggleExpand(bm, label === "1L" ? "1L" : "2L+")}>
            {isExpanded ? "Show less" : `Show all (${regimens.length})`}
          </button>
        )}

        {/* Incoming section */}
        {pipeline.length > 0 && (
          <div className="in-pipe-section">
            <div className="in-pipe-label">Incoming ({pipeline.length})</div>
            {pipeline.map((p) => (
              <div key={p.nct_id} className="in-pipe-tag">
                <span className="in-pipe-drug">{p.drug}</span>
                <span className="in-pipe-horizon" style={{ color: horizonColor(p.horizonMo) }}>{p.projSOC || "—"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="oc-main">
      <div className="oc-section-header">
        <div className="oc-section-title">Insights — SOC &amp; Pipeline by Biomarker</div>
        <span className="oc-count">{regimens.length} SOC · {pipeline.length} pipeline</span>
      </div>

      {/* ── SOC Density Summary ── */}
      <div className="in-density-toggle" onClick={() => setShowDensity(!showDensity)}>
        <span>{showDensity ? "▾" : "▸"} SOC Density Overview</span>
        <span className="oc-count">{densityData.length} biomarkers</span>
      </div>
      {showDensity && (
        <div className="in-density-wrap">
          <div className="in-density-hdr">
            <span>Biomarker</span>
            <span>SOC</span>
            <span>Pipeline</span>
            <span>Density</span>
          </div>
          {densityData.map((d) => (
            <div key={d.biomarker} className="in-density-row">
              <span className={`oc-card-bm ${biomarkerBadgeClass(d.biomarker)}`}>{d.biomarker}</span>
              <span>{d.socCount}</span>
              <span>{d.pipelineCount}</span>
              <span><span className="ws-opp-badge" style={{ backgroundColor: d.density.color }}>{d.density.label}</span></span>
            </div>
          ))}
        </div>
      )}

      {data.length === 0 ? (
        <div className="oc-empty">No data matches current filters.</div>
      ) : (
        data.map((group) => (
          <div key={group.biomarker} className="in-group">
            <div className="in-group-header">
              <span className={`oc-card-bm ${biomarkerBadgeClass(group.biomarker)}`}>{group.biomarker}</span>
              <span className="in-group-count">
                {group.regimens1L.length + group.regimens2LPlus.length} SOC ·
                {group.pipeline1L.length + group.pipeline2LPlus.length} incoming
              </span>
            </div>

            <div className="in-group-cols">
              {renderColumn(group.biomarker, "1L", group.regimens1L, group.pipeline1L)}
              {renderColumn(group.biomarker, "2L+", group.regimens2LPlus, group.pipeline2LPlus)}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
