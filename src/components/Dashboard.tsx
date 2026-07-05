"use client";

import { useState, useEffect, useMemo } from "react";
import InsightsTab from "./InsightsTab";
import type { DashboardData, PipelineRow, TimelineWeights, TrialProfile, TrialEndpoint, TrialEnrollment, TrialDesign, TrialPathway, RiskSliders } from "@/types";
import {
  computeKpis,
  filterRegimens,
  biomarkerBadgeClass,
  biomarkerMatches,
  tierTagClass,
  cardBorderClass,
  projectTimeline,
  profileToWeights,
  monteCarloConfidence,
  computePhaseBreakdown,
  computeDrivers,
  inferProfile,
  DEFAULT_PROFILES,
  DEFAULT_RISK,
  DEFAULT_WEIGHTS,
  BIOMARKER_GROUP,
  BIOMARKER_DISPLAY_NAMES,
  RAW_TO_DISPLAY,
} from "@/types";

const TABS = [
  { id: "soc", label: "Current SOC" },
  { id: "pipeline", label: "Pipeline / Trials" },
  { id: "whitespace", label: "White Space" },
  { id: "insights", label: "Insights" },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface Props {
  data: DashboardData | null;
  error: string | null;
}

export default function Dashboard({ data, error }: Props) {
  const [tab, setTab] = useState<TabId>("soc");
  const [selected, setSelected] = useState<string | null>(null);
  const [weights, setWeights] = useState<TimelineWeights>(DEFAULT_WEIGHTS.standard);
  const [profile, setProfile] = useState<TrialProfile>(DEFAULT_PROFILES.Standard);
  const [risk, setRisk] = useState<RiskSliders>(DEFAULT_RISK);
  const [manualWeights, setManualWeights] = useState(false);
  const [drugProfiles, setDrugProfiles] = useState<Record<string, TrialProfile>>({});
  const [drugRisks, setDrugRisks] = useState<Record<string, RiskSliders>>({});
  const [drugWeights, setDrugWeights] = useState<Record<string, TimelineWeights>>({});
  const [expandedTile, setExpandedTile] = useState<string | null>(null);
  const [inferredDone, setInferredDone] = useState(false);
  const [landingMode, setLandingMode] = useState(true);
  const [hasApplied, setHasApplied] = useState(false);
  const [pendingFilters, setPendingFilters] = useState({
    biomarker: "",
    combo: "All",
    hist: "All",
    lot: "All",
    subtype: "All",
  });
  const [appliedFilters, setAppliedFilters] = useState({
    biomarker: "",
    combo: "All",
    hist: "All",
    lot: "All",
    subtype: "All",
  });

  const [sliderValue, setSliderValue] = useState(12);
  const [viewMode, setViewMode] = useState<"drug" | "company">("drug");

  const regimens = data?.regimens ?? [];

  const pipelineSrc = useMemo(() => {
    const pp = data?.pipelineProfiles;
    if (!pp || pp.length === 0) return [];
    const socDrugs = new Set(regimens.map((r) => r.drug.toLowerCase()));
    const today = new Date();
    return pp
      .filter((p) => {
        if (socDrugs.has(p.drug.toLowerCase())) return false;
        if (p.pcd) {
          const d = new Date(p.pcd);
          if (isNaN(d.getTime())) return true;
          if (d.getFullYear() <= 1970) return true;
          return d > today;
        }
        return true;
      })
      .map((p) => ({
        regimen_id: 0,
        drug: p.drug,
        biomarker: p.biomarker,
        lot: "1L",
        tier: "Pipeline",
        nct_id: p.nctId,
        phases: p.phases,
        status: p.status || "Active",
        start_date: p.startDate || null,
        primary_completion_date: p.pcd || null,
        enrollment: null,
      } as PipelineRow));
  }, [data?.pipelineProfiles, regimens]);

  useEffect(() => {
    if (pipelineSrc.length > 0 && !inferredDone) {
      const profiles: Record<string, TrialProfile> = {};
      const risks: Record<string, RiskSliders> = {};
      const dw: Record<string, TimelineWeights> = {};
      const pp = data?.pipelineProfiles;
      for (const p of pipelineSrc) {
        const ext = pp?.find((x) => x.nctId === p.nct_id);
        if (ext) {
          profiles[p.nct_id] = {
            endpoint: ext.endpoint,
            enrollment: ext.enrollmentRate,
            design: ext.designType,
            pathway: ext.fda.aa ? "Accelerated" : "Standard",
            btd: ext.fda.btd,
            aa: ext.fda.aa,
            priorityReview: ext.fda.priorityReview,
          };
        } else {
          profiles[p.nct_id] = inferProfile(p.phases || []);
        }
        risks[p.nct_id] = { ...DEFAULT_RISK };
        dw[p.nct_id] = profileToWeights(profiles[p.nct_id]);
      }
      setDrugProfiles(profiles);
      setDrugRisks(risks);
      setDrugWeights(dw);
      setInferredDone(true);
    }
  }, [pipelineSrc, inferredDone, data?.pipelineProfiles]);

  const kpis = useMemo(() => computeKpis(regimens), [regimens]);
  const filtered = useMemo(() => filterRegimens(regimens, {
    biomarker: appliedFilters.biomarker,
    combo: appliedFilters.combo || "All",
    hist: appliedFilters.hist || "All",
    lot: appliedFilters.lot,
    pdl1: "All",
    subtype: appliedFilters.subtype || "All",
  }), [regimens, appliedFilters]);
  const selectedRegimen = useMemo(
    () => regimens.find((r) => r.drug === selected),
    [regimens, selected]
  );
  const filteredPipeline = useMemo(() => {
    return pipelineSrc.filter((p) => {
      if (appliedFilters.biomarker && !biomarkerMatches(p.biomarker, appliedFilters.biomarker)) return false;
      if (appliedFilters.lot !== "All" && p.lot !== appliedFilters.lot) return false;
      return true;
    });
  }, [pipelineSrc, appliedFilters]);

  const pipelineYearFiltered = useMemo(() => {
    return filteredPipeline.filter((p) => {
      const dp = drugProfiles[p.nct_id] || inferProfile(p.phases || []);
      const dw = drugWeights[p.nct_id] || profileToWeights(dp);
      const proj = projectTimeline(p.primary_completion_date, dw);
      if (!proj) return false;
      const projected = new Date(proj.projectedSOC);
      const horizonMo = (projected.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30.44);
      return horizonMo <= sliderValue;
    });
  }, [filteredPipeline, sliderValue, drugProfiles, drugWeights]);

  const companyData = useMemo(() => {
    const companies = new Map<string, { drugs: string; trials: number; biomarkers: Set<string>; minArrival: string | null }>();
    for (const p of pipelineYearFiltered) {
      const pp = data?.pipelineProfiles?.find((x) => x.nctId === p.nct_id);
      const sp = pp?.sponsor || "Unknown";
      if (!companies.has(sp)) companies.set(sp, { drugs: "", trials: 0, biomarkers: new Set(), minArrival: null });
      const c = companies.get(sp)!;
      c.trials++;
      if (c.drugs) { if (!c.drugs.includes(p.drug)) c.drugs += ", " + p.drug; }
      else c.drugs = p.drug;
      c.biomarkers.add(p.biomarker);
      const dp = drugProfiles[p.nct_id] || inferProfile(p.phases || []);
      const dw = drugWeights[p.nct_id] || profileToWeights(dp);
      const proj = projectTimeline(p.primary_completion_date, dw);
      if (proj && (!c.minArrival || proj.projectedSOC < c.minArrival)) c.minArrival = proj.projectedSOC;
    }
    return [...companies.entries()].sort((a, b) => b[1].trials - a[1].trials).map(([sponsor, d]) => ({
      sponsor, ...d, biomarkers: [...d.biomarkers].sort(),
    }));
  }, [pipelineYearFiltered, drugProfiles, drugWeights, data?.pipelineProfiles]);

  const biomarkerOpportunity = useMemo(() => {
    const socByBm = new Map<string, number>();
    for (const r of regimens) {
      if (appliedFilters.lot !== "All" && r.lot !== appliedFilters.lot) continue;
      if (appliedFilters.biomarker && !biomarkerMatches(r.biomarker, appliedFilters.biomarker)) continue;
      const key = RAW_TO_DISPLAY[r.biomarker] || r.biomarker;
      socByBm.set(key, (socByBm.get(key) || 0) + 1);
    }
    const pipeByBm = new Map<string, number>();
    for (const p of pipelineSrc) {
      if (appliedFilters.lot !== "All" && p.lot !== appliedFilters.lot) continue;
      if (appliedFilters.biomarker && !biomarkerMatches(p.biomarker, appliedFilters.biomarker)) continue;
      const key = RAW_TO_DISPLAY[p.biomarker] || p.biomarker;
      pipeByBm.set(key, (pipeByBm.get(key) || 0) + 1);
    }
    let allBms = BIOMARKER_DISPLAY_NAMES.filter((b) => socByBm.has(b) || pipeByBm.has(b));
    if (appliedFilters.biomarker) {
      allBms = allBms.filter((b) => b === appliedFilters.biomarker);
    }
    return allBms.map((bm) => {
      const soc = socByBm.get(bm) || 0;
      const pipe = pipeByBm.get(bm) || 0;
      let label: string, color: string;
      if (soc <= 2) { label = "Low Density"; color = "#2d6a4f"; }
      else if (soc <= 5) { label = "Medium Density"; color = "#e09f3e"; }
      else { label = "High Density"; color = "#8a817c"; }
      return { biomarker: bm, socCount: soc, pipelineCount: pipe, landscape: { label, color } };
    });
  }, [regimens, pipelineSrc, appliedFilters]);

  const setPendingFilter = (key: string, val: string) => {
    setPendingFilters((prev) => {
      const next = { ...prev, [key]: val };
      if (key === "biomarker") {
        next.subtype = val ? autoSelectSubtype(val) : "All";
      }
      return next;
    });
  };

  const autoSelectSubtype = (bm: string): string => {
    const group = BIOMARKER_GROUP[bm] || [bm];
    const details = [...new Set(
      regimens.filter((r) => group.includes(r.biomarker)).map((r) => r.biomarker_detail)
    )].filter(Boolean).sort();
    return details.length === 1 ? details[0] : "All";
  };

  if (error || !data) {
    return (
      <div className="oc-root" style={{ padding: "40px", textAlign: "center" }}>
        <div className="oc-logo" style={{ fontSize: 28, marginBottom: 16, color: "#141412" }}>
          OC<span style={{ color: "#B85C38" }}>IE</span>
        </div>
        <p style={{ color: "#888", fontSize: 14, marginBottom: 8 }}>Database connection required</p>
        <p style={{ color: "#aaa", fontSize: 12 }}>
          {error || "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment variables"}
        </p>
      </div>
    );
  }

  if (landingMode) {
    return (
      <div className="oc-landing">
        <div className="oc-landing-content">
          <div className="oc-landing-logo">OC<span>IE</span></div>
          <div className="oc-landing-sub">Oncology Competitive Intelligence Engine</div>
          <div className="oc-landing-tag">The Only Analytical solution you need to stay Updated !</div>
          <button className="oc-landing-btn" onClick={() => setLandingMode(false)}>
            Dive In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="oc-root">
      {/* ── Header ── */}
      <header className="oc-header">
        <div className="oc-logo-wrap">
          <div className="oc-logo">OC<span>IE</span></div>
          <div className="oc-logo-divider" />
          <div className="oc-logo-sub">Oncology Guidelines Intelligence</div>
        </div>
        <div className="oc-header-right">
          <div className="oc-source">NCCN 2025 · ASCO</div>
        </div>
      </header>

      {/* ── Tabs ── */}
      <nav className="oc-nav">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`oc-tab ${tab === t.id ? "active" : "nav-idle"}`}
            onClick={() => { setTab(t.id); setSelected(null); }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* ── KPI row ── */}
      <div className="oc-kpi-row">
        <div className="oc-kpi">
          <div className="oc-kpi-label">Total Regimens</div>
          <div className="oc-kpi-val">{kpis.totalRegimens}</div>
          <div className="oc-kpi-sub">NCCN/ASCO listed</div>
        </div>
        <div className="oc-kpi">
          <div className="oc-kpi-label">Biomarker Targets</div>
          <div className="oc-kpi-val">{kpis.biomarkerTargets}</div>
          <div className="oc-kpi-sub">Actionable drivers</div>
        </div>
        <div className="oc-kpi highlight">
          <div className="oc-kpi-label">Preferred 1L</div>
          <div className="oc-kpi-val">{kpis.preferred1L}</div>
          <div className="oc-kpi-sub">Category 1 regimens</div>
        </div>
        <div className="oc-kpi">
          <div className="oc-kpi-label">Combination</div>
          <div className="oc-kpi-val">{kpis.combinationCount}</div>
          <div className="oc-kpi-sub">Multi-drug regimens</div>
        </div>
        <div className="oc-kpi">
          <div className="oc-kpi-label">PD-L1 Pathway</div>
          <div className="oc-kpi-val">{kpis.pdl1Count}</div>
          <div className="oc-kpi-sub">IO / chemo-IO options</div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="oc-body">
        {/* Sidebar */}
        <aside className="oc-sidebar">
          <div className="oc-sidebar-section">Cancer Type</div>
          <div className="oc-filter-group">
            <span className="oc-filter-label">Indication</span>
            <select className="oc-select" defaultValue="NSCLC">
              <option>NSCLC</option>
            </select>
          </div>

          <div className="oc-sidebar-section">Global Filters</div>

          <div className="oc-filter-group">
            <span className="oc-filter-label">Biomarker / Driver</span>
            <select
              className="oc-select"
              value={pendingFilters.biomarker}
              onChange={(e) => setPendingFilter("biomarker", e.target.value)}
            >
              <option value="" disabled>Select a biomarker...</option>
              {BIOMARKER_DISPLAY_NAMES.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {pendingFilters.biomarker && (
            (() => {
              const group = BIOMARKER_GROUP[pendingFilters.biomarker] || [pendingFilters.biomarker];
              const details = [...new Set(
                regimens.filter((r) => group.includes(r.biomarker)).map((r) => r.biomarker_detail)
              )].filter(Boolean).sort();
              return (
                <div className="oc-filter-group">
                  <span className="oc-filter-label">Target Driver</span>
                  <select
                    className="oc-select"
                    value={pendingFilters.subtype}
                    onChange={(e) => setPendingFilter("subtype", e.target.value)}
                  >
                    {details.length > 1 && <option>All</option>}
                    {details.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </div>
              );
            })()
          )}

          <div className="oc-filter-group">
            <span className="oc-filter-label">Regimen Type</span>
            <select
              className="oc-select"
              value={pendingFilters.combo}
              onChange={(e) => setPendingFilter("combo", e.target.value)}
            >
              <option>All</option>
              <option>Single</option>
              <option>Combination</option>
            </select>
          </div>

          <div className="oc-filter-group">
            <span className="oc-filter-label">Histology</span>
            <select
              className="oc-select"
              value={pendingFilters.hist}
              onChange={(e) => setPendingFilter("hist", e.target.value)}
            >
              <option>All</option>
              <option>Squamous</option>
              <option>Non-squamous</option>
            </select>
          </div>

          <div className="oc-filter-group">
            <span className="oc-filter-label">Line of Therapy</span>
            <select
              className="oc-select"
              value={pendingFilters.lot}
              onChange={(e) => setPendingFilter("lot", e.target.value)}
            >
              <option>All</option>
              <option>1L</option>
              <option>2L+</option>
            </select>
          </div>

          <button className="oc-apply-btn" disabled={!pendingFilters.biomarker} onClick={() => {
            setAppliedFilters(pendingFilters);
            setHasApplied(true);
          }}>
            Apply
          </button>

          <div className="oc-sidebar-note">
            Stage: Metastatic<br />
            Source: NCCN 2025 · ASCO<br />
            Filters apply across all tabs
          </div>
        </aside>

        {/* Main content */}
        {tab === "soc" && (
          <div className="oc-main">
            {!hasApplied || !appliedFilters.biomarker ? (
              <div className="oc-soc-prompt">
                <div className="oc-soc-prompt-text">Please select a biomarker and apply filters to begin.</div>
              </div>
            ) : (
            <>
            <div className="oc-section-header">
              <div className="oc-section-title">
                Current SOC — <em>{appliedFilters.biomarker}</em>
              </div>
              <span className="oc-count">{filtered.length} regimens</span>
            </div>

            {filtered.length === 0 ? (
              <div className="oc-empty">No regimens match current filters.</div>
            ) : (
              <div className="oc-grid">
                {filtered.map((r) => (
                  <div
                    key={r.id}
                    className={`oc-card ${cardBorderClass(r.tier)}`}
                    onClick={() => setSelected(r.drug)}
                  >
                    <span className="oc-expand-icon">↗</span>
                    <span className={`oc-card-bm ${biomarkerBadgeClass(r.biomarker)}`}>
                      {RAW_TO_DISPLAY[r.biomarker] || r.biomarker}
                    </span>
                    <div className="oc-card-drug">{r.drug}</div>
                    <div className="oc-card-class">{r.drug_class}</div>
                    {r.pd_l1_expression && r.pd_l1_expression !== "N/A" && (
                      <span className="oc-card-pdl1">{r.pd_l1_expression}</span>
                    )}
                    <div className="oc-card-footer">
                      <span className="tag tag-lot">{r.lot}</span>
                      <span className={tierTagClass(r.tier)}>{r.tier}</span>
                      <span className={`tag ${r.type === "Combination" ? "tag-type-combo" : "tag-type-single"}`}>
                        {r.type === "Combination" ? "Combo" : "Single"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Modal */}
            {selectedRegimen && (
              <div className="oc-modal-wrap" onClick={(e) => { if (e.target === e.currentTarget) setSelected(null); }}>
                <div className="oc-modal">
                  <button className="oc-modal-close" onClick={() => setSelected(null)}>×</button>
                  <span
                    className={`oc-card-bm ${biomarkerBadgeClass(selectedRegimen.biomarker)}`}
                    style={{ display: "inline-block", marginBottom: 10 }}
                  >
                    {selectedRegimen.biomarker}
                  </span>
                  <div className="oc-modal-drug">{selectedRegimen.drug}</div>
                  <div className="oc-modal-class">{selectedRegimen.drug_class}</div>

                  <div className="oc-modal-grid">
                    <div className="oc-modal-field">
                      <div className="oc-field-label">Line</div>
                      <div className="oc-field-val">{selectedRegimen.lot}</div>
                    </div>
                    <div className="oc-modal-field">
                      <div className="oc-field-label">Guideline Tier</div>
                      <div className="oc-field-val">{selectedRegimen.tier}</div>
                    </div>
                    <div className="oc-modal-field">
                      <div className="oc-field-label">Type</div>
                      <div className="oc-field-val">{selectedRegimen.type}</div>
                    </div>
                    <div className="oc-modal-field">
                      <div className="oc-field-label">Route</div>
                      <div className="oc-field-val">{selectedRegimen.route || "—"}</div>
                    </div>
                    <div className="oc-modal-field" style={{ gridColumn: "1 / -1" }}>
                      <div className="oc-field-label">Histology</div>
                      <div className="oc-field-val">{selectedRegimen.histology}</div>
                    </div>
                    <div className="oc-modal-field" style={{ gridColumn: "1 / -1" }}>
                      <div className="oc-field-label">Patient Population</div>
                      <div className="oc-field-val">{selectedRegimen.patient_population || selectedRegimen.setting || "—"}</div>
                    </div>
                  </div>

                  {selectedRegimen.notes && (
                    <div className="oc-modal-notes">
                      <div className="oc-notes-label">Clinical notes / monitoring</div>
                      <div className="oc-notes-text">{selectedRegimen.notes}</div>
                    </div>
                  )}

                  <div className="oc-modal-soon">
                    <div className="oc-soon-label">Biomarker Detail</div>
                    <div className="oc-soon-val">{selectedRegimen.biomarker_detail || "—"}</div>
                  </div>
                  {selectedRegimen.pd_l1_expression && selectedRegimen.pd_l1_expression !== "N/A" && (
                    <div className="oc-modal-soon">
                      <div className="oc-soon-label">PD-L1 Expression</div>
                      <div className="oc-soon-val">{selectedRegimen.pd_l1_expression}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
            </>
            )}
          </div>
        )}

        {tab === "pipeline" && (
          <div className="oc-main">
            <div className="oc-section-header">
              <div className="oc-section-title">Pipeline — Projected Competitor Timeline</div>
              <span className="oc-count">{viewMode === "drug" ? pipelineYearFiltered.length + " drugs" : companyData.length + " companies"}</span>
            </div>

            <div className="pl-instruct">
              Drag slider to show drugs projected for SOC entry within a time horizon.
            </div>

            <div className="pl-slider-section">
              <input type="range" min={0} max={120} value={sliderValue}
                onChange={(e) => setSliderValue(+e.target.value)}
                className="pl-slider" />
              <div className="pl-slider-labels">
                <span>0</span>
                <span>1yr</span>
                <span>2yr</span>
                <span>3yr</span>
                <span>10yr</span>
              </div>
              <div className="pl-slider-value">{sliderValue}mo ({sliderValue >= 12 ? Math.round(sliderValue / 12 * 10) / 10 + "yr" : sliderValue + "mo"})</div>
            </div>

            <div className="pl-view-pills">
              <button className={`pl-pill ${viewMode === "drug" ? "active" : ""}`} onClick={() => setViewMode("drug")}>Drug View</button>
              <button className={`pl-pill ${viewMode === "company" ? "active" : ""}`} onClick={() => setViewMode("company")}>Company View</button>
            </div>

            {/* ── Pipeline Drug View ── */}
            {viewMode === "drug" && (pipelineYearFiltered.length === 0 ? (
              <div className="oc-empty">No drugs projected for this horizon with current filters.</div>
            ) : (
              <div className="oc-grid pl-tile-grid">
                {pipelineYearFiltered.map((p) => {
                  const dp = drugProfiles[p.nct_id] || inferProfile(p.phases || []);
                  const computedW = profileToWeights(dp);
                  const dw = drugWeights[p.nct_id] || computedW;
                  const isCustomW = drugWeights[p.nct_id] !== undefined && (drugWeights[p.nct_id].submission !== computedW.submission || drugWeights[p.nct_id].review !== computedW.review || drugWeights[p.nct_id].nccnLag !== computedW.nccnLag);
                  const proj = projectTimeline(p.primary_completion_date, dw);
                  const horizonMo = proj ? (new Date(proj.projectedSOC).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30.44) : null;
                  const isExpanded = expandedTile === p.drug;
                  const conf = isExpanded ? monteCarloConfidence(dw, dp, drugRisks[p.nct_id] || DEFAULT_RISK) : null;
                  const phases = isExpanded ? computePhaseBreakdown(dp, dw) : [];
                  const drivers = isExpanded ? computeDrivers(dp, dw) : [];
                  const pp = data?.pipelineProfiles?.find((x) => x.nctId === p.nct_id);
                  const sponsor = pp?.sponsor;
                  const phaseStr = p.phases?.join("/").replace(/PHASE/g, "P") || "";

                  return (
                    <div key={`${p.drug}-${p.nct_id}`} className={`pl-tile ${isExpanded ? "pl-tile-expanded" : ""}`}>
                      <div className="oc-card" onClick={() => setExpandedTile(isExpanded ? null : p.drug)} style={{ cursor: "pointer" }}>
                        <span className="pl-tile-horizon" style={{
                          backgroundColor: horizonMo !== null && horizonMo < 12 ? "#2d6a4f" : horizonMo !== null && horizonMo < 24 ? "#e09f3e" : horizonMo !== null && horizonMo < 48 ? "#d00000" : "#aa80a0",
                        }}>
                          {horizonMo !== null
                            ? horizonMo < 12 ? "<1yr" : horizonMo < 24 ? "1-2yr" : horizonMo < 48 ? "2-4yr" : ">4yr"
                            : "—"}
                        </span>
                        <span className={`oc-card-bm ${biomarkerBadgeClass(p.biomarker)}`}>
                          {p.biomarker}
                        </span>
                        <div className="oc-card-drug">{p.drug}</div>
                        <div className="oc-card-class">{sponsor || "—"}</div>
                        <div className="oc-card-footer">
                          <span className="tag tag-lot">{phaseStr || "—"}</span>
                          {proj && <span className="pl-tile-date">{proj.projectedSOC}</span>}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="pl-tile-detail">
                          <div className="pl-ie-header">
                            <span className="pl-ie-comp">Competitor</span>
                            <span className="pl-ie-drug">{p.drug}</span>
                            {sponsor && <span className="pl-ie-sponsor">{sponsor}</span>}
                            {phaseStr && <span className="pl-ie-phase">{phaseStr}</span>}
                          </div>

                          <div className="pl-tile-dates">
                            <div className="pl-tile-date-field"><span className="oc-filter-label">PCD</span><span>{p.primary_completion_date || "—"}</span></div>
                            <div className="pl-tile-date-field"><span className="oc-filter-label">Est. Arrival</span><span>{proj?.projectedSOC || "—"}</span></div>
                          </div>

                          <div className="pl-ie-grid">
                            <div className="pl-field">
                              <span className="oc-filter-label">Endpoint</span>
                              <select className="oc-select" value={dp.endpoint}
                                onChange={(e) => setDrugProfiles({ ...drugProfiles, [p.nct_id]: { ...dp, endpoint: e.target.value as TrialEndpoint } })}>
                                <option>PFS</option><option>ORR</option><option>OS</option>
                              </select>
                            </div>
                            <div className="pl-field">
                              <span className="oc-filter-label">Enrollment</span>
                              <select className="oc-select" value={dp.enrollment}
                                onChange={(e) => setDrugProfiles({ ...drugProfiles, [p.nct_id]: { ...dp, enrollment: e.target.value as TrialEnrollment } })}>
                                <option>Fast</option><option>Average</option><option>Slow</option>
                              </select>
                            </div>
                            <div className="pl-field">
                              <span className="oc-filter-label">Design</span>
                              <select className="oc-select" value={dp.design}
                                onChange={(e) => setDrugProfiles({ ...drugProfiles, [p.nct_id]: { ...dp, design: e.target.value as TrialDesign } })}>
                                <option>RCT</option><option>SingleArm</option><option>Adaptive</option>
                              </select>
                            </div>
                            <div className="pl-field">
                              <span className="oc-filter-label">FDA</span>
                              <div className="pl-ie-toggles">
                                {([["btd","BTD"],["aa","AA"],["priorityReview","PR"]] as const).map(([k,l]) => (
                                  <label key={k} className="pl-toggle">
                                    <input type="checkbox" checked={dp[k as keyof TrialProfile] as boolean}
                                      onChange={() => setDrugProfiles({ ...drugProfiles, [p.nct_id]: { ...dp, [k]: !dp[k as keyof TrialProfile] } })} />
                                    <span>{l}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="pl-ie-status">
                            <div className="pl-ie-weight-override">
                              <div className="pl-ie-subsection">
                                <span className="oc-filter-label">Weight Overrides</span>
                                {isCustomW && <span className="pl-status-custom">Custom</span>}
                              </div>
                              <div className="pl-ie-weight-inputs">
                                <div className="pl-control">
                                  <span className="oc-filter-label">Submission</span>
                                  <input type="number" min={0} max={6} value={dw.submission}
                                    onChange={(e) => setDrugWeights({ ...drugWeights, [p.nct_id]: { ...dw, submission: +e.target.value } })} />
                                </div>
                                <div className="pl-control">
                                  <span className="oc-filter-label">FDA Review</span>
                                  <input type="number" min={0} max={24} value={dw.review}
                                    onChange={(e) => setDrugWeights({ ...drugWeights, [p.nct_id]: { ...dw, review: +e.target.value } })} />
                                </div>
                                <div className="pl-control">
                                  <span className="oc-filter-label">NCCN Lag</span>
                                  <input type="number" min={0} max={12} value={dw.nccnLag}
                                    onChange={(e) => setDrugWeights({ ...drugWeights, [p.nct_id]: { ...dw, nccnLag: +e.target.value } })} />
                                </div>
                                <span className="pl-total">= {dw.submission + dw.review + dw.nccnLag}mo</span>
                                {isCustomW && (
                                  <button className="oc-tab nav-idle" style={{ fontSize: 10, padding: "4px 10px" }}
                                    onClick={() => setDrugWeights({ ...drugWeights, [p.nct_id]: computedW })}>↺ Reset</button>
                                )}
                              </div>
                            </div>

                            {conf && (
                              <div className="pl-ie-metrics">
                                <div className="pl-metric">
                                  <span className="pl-metric-label">MC Confidence</span>
                                  <span className="pl-conf-val" style={{ color: conf.color }}>{conf.confidence}</span>
                                  <span className="pl-conf-lbl2" style={{ color: conf.color }}>{conf.label}</span>
                                </div>
                                <div className="pl-metric">
                                  <span className="pl-metric-label">P10</span>
                                  <span className="pl-metric-val">{conf.p10}mo</span>
                                </div>
                                <div className="pl-metric">
                                  <span className="pl-metric-label">P50</span>
                                  <span className="pl-metric-val">{conf.p50}mo</span>
                                </div>
                                <div className="pl-metric">
                                  <span className="pl-metric-label">P90</span>
                                  <span className="pl-metric-val">{conf.p90}mo</span>
                                </div>
                              </div>
                            )}

                            <div className="pl-ie-phases">
                              {phases.map((ph) => (
                                <div key={ph.label} className="pl-break-row">
                                  <div className="pl-break-bar-wrap">
                                    <div className="pl-break-bar" style={{ width: `${(ph.months / Math.max(...phases.map(x => x.months), 1)) * 100}%`, backgroundColor: ph.color }} />
                                  </div>
                                  <span className="pl-break-label">{ph.label}</span>
                                  <span className="pl-break-months">{ph.months}mo</span>
                                </div>
                              ))}
                              <div className="pl-break-row pl-break-total">
                                <div className="pl-break-bar-wrap"><div className="pl-break-bar" style={{ width: "100%", backgroundColor: "#141412" }} /></div>
                                <span className="pl-break-label">Total</span>
                                <span className="pl-break-months">{dw.submission + dw.review + dw.nccnLag}mo</span>
                              </div>
                            </div>

                            {drivers.length > 0 && (
                              <div className="pl-ie-drivers">
                                {drivers.map((d,i) => (
                                  <div key={i} className={`pl-driver ${d.positive ? "pl-driver-pos" : "pl-driver-neg"}`}>
                                    <span className="pl-driver-icon">{d.positive ? "✓" : "⚠"}</span>
                                    <span className="pl-driver-text">{d.label}</span>
                                    <span className="pl-driver-effect">{d.effect}</span>
                                  </div>
                                ))}
                              </div>
                            )}


                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            {/* ── Pipeline Company View ── */}
            {viewMode === "company" && (companyData.length === 0 ? (
              <div className="oc-empty">No companies with pipeline in this horizon.</div>
            ) : (
              <div className="pl-company-section">
                {companyData.map((c) => {
                  const maxTrials = Math.max(...companyData.map(x => x.trials), 1);
                  const pct = (c.trials / maxTrials) * 100;
                  return (
                    <div key={c.sponsor} className="pl-company-row">
                      <div className="pl-company-header">
                        <span className="pl-company-name">{c.sponsor}</span>
                        <span className="pl-company-trials">{c.trials} trial{c.trials > 1 ? "s" : ""}</span>
                      </div>
                      <div className="pl-company-bar-wrap">
                        <div className="pl-company-bar" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="pl-company-details">
                        <div className="pl-company-drugs"><span className="oc-filter-label">Drugs</span> {c.drugs}</div>
                        <div className="pl-company-bms">
                          {c.biomarkers.map((b) => (
                            <span key={b} className={`oc-card-bm ${biomarkerBadgeClass(b)}`}>{b}</span>
                          ))}
                        </div>
                        {c.minArrival && <div className="pl-company-arrival"><span className="oc-filter-label">Earliest Arrival</span> {c.minArrival}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {tab === "whitespace" && (
          <div className="oc-main">
            <div className="oc-section-header">
              <div className="oc-section-title">White Space — SOC Density by Biomarker</div>
              <span className="oc-count">{biomarkerOpportunity.length} biomarkers</span>
            </div>

            {biomarkerOpportunity.length === 0 ? (
              <div className="oc-empty">No data matches current filters.</div>
            ) : (
              <div className="ws-table">
                <div className="ws-tr ws-tr-header">
                  <div className="ws-th">Biomarker</div>
                  <div className="ws-th">SOC Regimens</div>
                  <div className="ws-th">Pipeline</div>
                  <div className="ws-th">SOC Density</div>
                </div>
                {biomarkerOpportunity.map((row) => (
                  <div key={row.biomarker} className="ws-tr">
                    <div className="ws-td">
                      <span className={`oc-card-bm ${biomarkerBadgeClass(row.biomarker)}`}>{row.biomarker}</span>
                    </div>
                    <div className="ws-td">{row.socCount}</div>
                    <div className="ws-td">{row.pipelineCount}</div>
                    <div className="ws-td">
                        <span className="ws-opp-badge" style={{ backgroundColor: row.landscape.color }}>
                        {row.landscape.label}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "insights" && (
          <InsightsTab
            pipeline={filteredPipeline}
            regimens={filtered}
            drugProfiles={drugProfiles}
            drugWeights={drugWeights}
          />
        )}
      </div>
    </div>
  );
}
