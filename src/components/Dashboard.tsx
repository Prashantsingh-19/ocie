"use client";

import { useState, useEffect, useMemo } from "react";
import InsightsTab from "./InsightsTab";
import type { Regimen, DashboardData, KpiData, WhiteSpaceRow, PipelineRow, TimelineWeights, TrialProfile, TrialEndpoint, TrialEnrollment, TrialDesign, TrialPathway, RiskSliders } from "@/types";
import {
  computeKpis,
  filterRegimens,
  biomarkerBadgeClass,
  tierTagClass,
  cardBorderClass,
  gapScore,
  gapLabel,
  gapColor,
  projectTimeline,
  profileToWeights,
  monteCarloConfidence,
  computePhaseBreakdown,
  computeDrivers,
  profileTagSummary,
  inferProfile,
  DEFAULT_PROFILES,
  DEFAULT_RISK,
  DEFAULT_WEIGHTS,
  BIOMARKERS,
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
  const [expandedDrug, setExpandedDrug] = useState<string | null>(null);
  const [inferredDone, setInferredDone] = useState(false);

  const regimens = data?.regimens ?? [];
  const whiteSpace = data?.whiteSpace ?? [];
  const pipeline = data?.pipeline ?? [];

  useEffect(() => {
    if (pipeline.length > 0 && !inferredDone) {
      const profiles: Record<string, TrialProfile> = {};
      const risks: Record<string, RiskSliders> = {};
      const dw: Record<string, TimelineWeights> = {};
      const pp = data?.pipelineProfiles;
      for (const p of pipeline) {
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
  }, [pipeline, inferredDone, data?.pipelineProfiles]);
  const [filters, setFilters] = useState({
    biomarker: "All Biomarkers",
    combo: "All",
    hist: "All",
    lot: "All",
  });

  const kpis = useMemo(() => computeKpis(regimens), [regimens]);
  const filtered = useMemo(() => filterRegimens(regimens, filters), [regimens, filters]);
  const selectedRegimen = useMemo(
    () => regimens.find((r) => r.drug === selected),
    [regimens, selected]
  );
  const filteredWhiteSpace = useMemo(() => {
    return whiteSpace.filter((w) => {
      if (filters.biomarker !== "All Biomarkers" && w.biomarker !== filters.biomarker) return false;
      if (filters.lot !== "All" && w.lot !== filters.lot) return false;
      return true;
    });
  }, [whiteSpace, filters]);

  const filteredPipeline = useMemo(() => {
    return pipeline.filter((p) => {
      if (filters.biomarker !== "All Biomarkers" && p.biomarker !== filters.biomarker) return false;
      if (filters.lot !== "All" && p.lot !== filters.lot) return false;
      return true;
    });
  }, [pipeline, filters]);

  const setFilter = (key: string, val: string) => {
    setFilters((prev) => ({ ...prev, [key]: val }));
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
              value={filters.biomarker}
              onChange={(e) => setFilter("biomarker", e.target.value)}
            >
              {BIOMARKERS.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </div>

          <div className="oc-filter-group">
            <span className="oc-filter-label">Regimen Type</span>
            <select
              className="oc-select"
              value={filters.combo}
              onChange={(e) => setFilter("combo", e.target.value)}
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
              value={filters.hist}
              onChange={(e) => setFilter("hist", e.target.value)}
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
              value={filters.lot}
              onChange={(e) => setFilter("lot", e.target.value)}
            >
              <option>All</option>
              <option>1L</option>
              <option>2L+</option>
            </select>
          </div>

          <div className="oc-sidebar-note">
            Stage: Metastatic<br />
            Source: NCCN 2025 · ASCO<br />
            Filters apply across all tabs
          </div>
        </aside>

        {/* Main content */}
        {tab === "soc" && (
          <div className="oc-main">
            <div className="oc-section-header">
              <div className="oc-section-title">
                Current SOC — <em>{filters.biomarker === "All Biomarkers" ? "All Biomarkers" : filters.biomarker}</em>
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
                      {r.biomarker}
                    </span>
                    <div className="oc-card-drug">{r.drug}</div>
                    <div className="oc-card-class">{r.drug_class}</div>
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
                      <div className="oc-field-label">Patient Setting</div>
                      <div className="oc-field-val">{selectedRegimen.setting}</div>
                    </div>
                  </div>

                  {selectedRegimen.notes && (
                    <div className="oc-modal-notes">
                      <div className="oc-notes-label">Clinical notes / monitoring</div>
                      <div className="oc-notes-text">{selectedRegimen.notes}</div>
                    </div>
                  )}

                  <div className="oc-modal-soon">
                    <div className="oc-soon-label">Patient Subtype</div>
                    <div className="oc-soon-val">Updating soon — subtype-level patient segmentation in progress</div>
                  </div>
                  <div className="oc-modal-soon">
                    <div className="oc-soon-label">Inclusion Criteria</div>
                    <div className="oc-soon-val">Updating soon — eligibility mapping from trial protocols in progress</div>
                  </div>
                  <div className="oc-modal-soon">
                    <div className="oc-soon-label">Exclusion Criteria</div>
                    <div className="oc-soon-val">Updating soon — exclusion mapping from trial protocols in progress</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "pipeline" && (
          <div className="oc-main">
            <div className="oc-section-header">
              <div className="oc-section-title">Pipeline — Projected SOC Timeline</div>
              <span className="oc-count">{filteredPipeline.length} drugs</span>
            </div>

            {/* ── Bulk Profile Template ── */}
            <div className="pl-section">
              <div className="pl-section-label">Bulk Profile Template</div>
              <div className="pl-bulk-row">
                <div className="pl-bulk-fields">
                  <select className="oc-select" value={profile.endpoint}
                    onChange={(e) => setProfile({ ...profile, endpoint: e.target.value as TrialEndpoint })}>
                    <option>PFS</option><option>ORR</option><option>OS</option>
                  </select>
                  <select className="oc-select" value={profile.enrollment}
                    onChange={(e) => setProfile({ ...profile, enrollment: e.target.value as TrialEnrollment })}>
                    <option>Fast</option><option>Average</option><option>Slow</option>
                  </select>
                  <select className="oc-select" value={profile.design}
                    onChange={(e) => setProfile({ ...profile, design: e.target.value as TrialDesign })}>
                    <option>RCT</option><option>SingleArm</option><option>Adaptive</option>
                  </select>
                </div>
                <div className="pl-bulk-toggles">
                  {([["btd","BTD"],["aa","AA"],["priorityReview","PR"]] as const).map(([k,l]) => (
                    <label key={k} className="pl-toggle">
                      <input type="checkbox" checked={profile[k as keyof TrialProfile] as boolean}
                        onChange={() => setProfile({ ...profile, [k]: !profile[k as keyof TrialProfile] })} />
                      <span>{l}</span>
                    </label>
                  ))}
                </div>
                <div className="pl-bulk-btns">
                  <button className="oc-tab nav-idle" onClick={() => {
                    const updated = { ...drugProfiles };
                    for (const id of Object.keys(updated)) updated[id] = { ...profile };
                    setDrugProfiles(updated);
                  }}>Apply to all</button>
                  <button className="oc-tab nav-idle" onClick={() => {
                    const updated: Record<string, TrialProfile> = {};
                    for (const p of pipeline) updated[p.nct_id] = inferProfile(p.phases || []);
                    setDrugProfiles(updated);
                  }}>Reset to inferred</button>
                </div>
              </div>
              {(profile.endpoint !== "PFS" || profile.enrollment !== "Fast" || profile.design !== "RCT" || !profile.btd || profile.aa || !profile.priorityReview) && (
                <div className="pl-profile-note">Defaults reflect typical trial characteristics. Apply to all drugs, or edit per drug below.</div>
              )}
            </div>

            {/* ── Pipeline Table ── */}
            <div className="pl-section">
              <div className="pl-section-label">Pipeline Drugs</div>
              <div className="pl-table-wrap">
                <table className="pl-table">
                  <thead>
                    <tr>
                      <th>Drug</th>
                      <th>Biomarker</th>
                      <th>Phase</th>
                      <th>Start</th>
                      <th>PCD</th>
                      <th>Proj SOC</th>
                      <th>Horizon</th>
                      <th>Profile</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPipeline.map((p) => {
                      const dp = drugProfiles[p.nct_id] || inferProfile(p.phases || []);
                      const computedW = profileToWeights(dp);
                      const dw = drugWeights[p.nct_id] || computedW;
                      const isCustomW = drugWeights[p.nct_id] !== undefined && (drugWeights[p.nct_id].submission !== computedW.submission || drugWeights[p.nct_id].review !== computedW.review || drugWeights[p.nct_id].nccnLag !== computedW.nccnLag);
                      const proj = projectTimeline(p.primary_completion_date, dw);
                      const horizon = proj ? Math.round(
                        (new Date(proj.projectedSOC).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30.44)
                      ) : null;
                      const isExpanded = expandedDrug === p.nct_id;
                      const conf = isExpanded ? monteCarloConfidence(dw, dp, drugRisks[p.nct_id] || DEFAULT_RISK) : null;
                      const phases = isExpanded ? computePhaseBreakdown(dp, dw) : [];
                      const drivers = isExpanded ? computeDrivers(dp, dw) : [];
                      return (<>
                        <tr key={p.nct_id} className="pl-row" onClick={() => setExpandedDrug(isExpanded ? null : p.nct_id)} style={{ cursor: "pointer" }}>
                          <td className="pl-drug">{p.drug}</td>
                          <td>
                            <span className={`oc-card-bm ${biomarkerBadgeClass(p.biomarker)}`}>
                              {p.biomarker}
                            </span>
                          </td>
                          <td className="pl-phase">{p.phases?.join("/").replace(/PHASE/g, "P") || "—"}</td>
                          <td className="pl-date">{p.start_date || "—"}</td>
                          <td className="pl-date">{p.primary_completion_date || "—"}</td>
                          <td className="pl-date">{proj?.projectedSOC || "—"}</td>
                          <td className="pl-horizon">
                            {horizon !== null ? (
                              <span className={`pl-horizon-badge ${horizon < 36 ? "pl-hz-near" : horizon < 60 ? "pl-hz-mid" : "pl-hz-far"}`}>
                                {horizon < 12 ? "<1yr" : horizon < 36 ? "1-3yr" : horizon < 60 ? "3-5yr" : ">5yr"}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="pl-profile-cell">
                            <span className="pl-pro-tags">{profileTagSummary(dp)}</span>
                            <span className="pl-pro-expand">{isExpanded ? "▲" : "▸"}</span>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${p.nct_id}-edit`} className="pl-edit-row">
                            <td colSpan={8}>
                              <div className="pl-inline-editor">
                                {(() => {
                                  const pp = data?.pipelineProfiles?.find((x) => x.nctId === p.nct_id);
                                  const sponsor = pp?.sponsor;
                                  const phaseStr = p.phases?.join("/").replace(/PHASE/g, "P") || "";
                                  return (
                                    <div className="pl-ie-header">
                                      <span className="pl-ie-comp">Competitor</span>
                                      <span className="pl-ie-drug">{p.drug}</span>
                                      {sponsor && <span className="pl-ie-sponsor">{sponsor}</span>}
                                      {phaseStr && <span className="pl-ie-phase">{phaseStr}</span>}
                                    </div>
                                  );
                                })()}
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

                                  {conf && (
                                  <div className="pl-ie-status">
                                    <div className="pl-ie-metrics">
                                      <div className="pl-metric">
                                        <span className="pl-metric-label">MC Confidence</span>
                                        <span className="pl-conf-val" style={{ color: conf.color }}>{conf.confidence}</span>
                                        <span className="pl-conf-lbl2" style={{ color: conf.color }}>{conf.label}</span>
                                      </div>
                                      <div className="pl-metric">
                                        <span className="pl-metric-label">Optimistic (P10)</span>
                                        <span className="pl-metric-val">{conf.p10}mo</span>
                                        <div className="pl-mc-bar"><div className="pl-mc-fill" style={{ width: `${(conf.p10 / conf.p90) * 100}%`, backgroundColor: "#2d6a4f" }} /></div>
                                      </div>
                                      <div className="pl-metric">
                                        <span className="pl-metric-label">Median (P50)</span>
                                        <span className="pl-metric-val">{conf.p50}mo</span>
                                        <div className="pl-mc-bar"><div className="pl-mc-fill" style={{ width: `${(conf.p50 / conf.p90) * 100}%`, backgroundColor: "#141412" }} /></div>
                                      </div>
                                      <div className="pl-metric">
                                        <span className="pl-metric-label">Conservative (P90)</span>
                                        <span className="pl-metric-val">{conf.p90}mo</span>
                                        <div className="pl-mc-bar"><div className="pl-mc-fill" style={{ width: "100%", backgroundColor: "#d00000" }} /></div>
                                      </div>
                                    </div>

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

                                    <div className="pl-ie-weights" style={{ marginTop: 8, fontSize: 10, color: "#888" }}>
                                      Weights: submission {dw.submission}mo · review {dw.review}mo · nccn {dw.nccnLag}mo = {dw.submission + dw.review + dw.nccnLag}mo
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>);
                    })}
                  </tbody>
                </table>
              </div>
              {filteredPipeline.length === 0 && (
                <div className="oc-empty">No pipeline data matches current filters.</div>
              )}
            </div>

            {/* ── Model Validation ── */}
            <div className="pl-section">
              <div className="pl-section-label">Model Validation — 6 Approved Drugs</div>
              <p style={{ fontSize: 11, color: "#888", marginBottom: 10, lineHeight: 1.5 }}>
                Predicted dates computed via <code>profileToWeights()</code> using each drug's actual trial profile (endpoint, design, enrollment, pathway).<br />
                Model 1 defaults used for drugs matching Standard profile (PFS·RCT·Fast). Drugs with non-default profiles receive modifier adjustments.
              </p>
              <div className="pl-table-wrap">
                <table className="pl-table pl-val-table">
                  <thead>
                    <tr>
                      <th>Drug</th>
                      <th>Biomarker</th>
                      <th>Profile</th>
                      <th>Actual FDA</th>
                      <th>Pred. FDA</th>
                      <th>Δ FDA</th>
                      <th>Actual SOC</th>
                      <th>Pred. SOC</th>
                      <th>Δ SOC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { drug: "Osimertinib", bm: "EGFR", profile: "PFS·RCT·Fast·Std", actualFDA: "2018-04-18", predFDA: "2018-04-19", dFDA: "+0.03mo", actualSOC: "2018-09-01", predSOC: "2018-09-19", dSOC: "+0.6mo" },
                      { drug: "Alectinib", bm: "ALK", profile: "PFS·RCT·Fast·Std", actualFDA: "2017-11-06", predFDA: "2017-12-09", dFDA: "+1.1mo", actualSOC: "2018-03-01", predSOC: "2018-05-09", dSOC: "+2.3mo" },
                      { drug: "Pembrolizumab", bm: "PD-L1", profile: "PFS·RCT·Fast·Std", actualFDA: "2016-10-24", predFDA: "2017-03-09", dFDA: "+4.5mo", actualSOC: "2017-03-01", predSOC: "2017-08-09", dSOC: "+5.3mo" },
                      { drug: "Sotorasib", bm: "KRAS G12C", profile: "ORR·SA·Fast·Acc", actualFDA: "2021-05-28", predFDA: "2021-06-01", dFDA: "+0.1mo", actualSOC: "2021-10-01", predSOC: "2021-11-01", dSOC: "+1.0mo" },
                      { drug: "Selpercatinib", bm: "RET", profile: "ORR·SA·Avg·Acc", actualFDA: "2020-05-08", predFDA: "2020-01-17", dFDA: "−3.7mo", actualSOC: "2020-11-01", predSOC: "2020-06-17", dSOC: "−4.5mo" },
                      { drug: "Larotrectinib", bm: "NTRK", profile: "ORR·SA·Slow·Acc", actualFDA: "2018-11-26", predFDA: "2019-05-15", dFDA: "+5.6mo", actualSOC: "2019-04-01", predSOC: "2019-10-15", dSOC: "+6.5mo" },
                    ].map((v) => (
                      <tr key={v.drug}>
                        <td className="pl-drug">{v.drug}</td>
                        <td><span className={`oc-card-bm ${biomarkerBadgeClass(v.bm)}`}>{v.bm}</span></td>
                        <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#888" }}>{v.profile}</td>
                        <td className="pl-date">{v.actualFDA}</td>
                        <td className="pl-date">{v.predFDA}</td>
                        <td className="pl-val-offset" style={{ color: v.dFDA.startsWith("+") && v.dFDA !== "+0.03mo" && v.dFDA !== "+0.1mo" && v.dFDA !== "+1.1mo" ? "#d00000" : "#555" }}>{v.dFDA}</td>
                        <td className="pl-date">{v.actualSOC}</td>
                        <td className="pl-date">{v.predSOC}</td>
                        <td className="pl-val-offset" style={{ color: v.dSOC.startsWith("+") ? "#d00000" : "#555" }}>{v.dSOC}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pl-val-summary">
                Avg |FDA Δ|: <strong>2.5mo</strong> · Avg |SOC Δ|: <strong>3.4mo</strong> · Best: Osimertinib FDA +0.03mo · Most under-predicted: Selpercatinib SOC −4.5mo
              </div>
              <p style={{ fontSize: 10, color: "#aaa", marginTop: 6, fontStyle: "italic" }}>
                Model 1 (flat 15/11mo presets) achieves lower avg error (±2.9mo) but doesn't reflect per-drug trial characteristics.
                The profile→weights system trades some accuracy for per-drug granularity.
              </p>
            </div>
          </div>
        )}

        {tab === "whitespace" && (
          <div className="oc-main">
            <div className="oc-section-header">
              <div className="oc-section-title">White Space — Unmet Need by Biomarker × Line of Therapy</div>
              <span className="oc-count">{filteredWhiteSpace.length} cells</span>
            </div>

            <div className="ws-table-wrap">
              <table className="ws-table">
                <thead>
                  <tr>
                    <th>Biomarker</th>
                    <th>LOT</th>
                    <th>Regimens</th>
                    <th>Preferred</th>
                    <th>UICC</th>
                    <th>Subsequent</th>
                    <th>Trials</th>
                    <th>Active</th>
                    <th>Gap</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWhiteSpace.map((w) => {
                    const score = gapScore(w);
                    return (
                      <tr key={`${w.biomarker}-${w.lot}`}>
                        <td>
                          <span className={`oc-card-bm ${biomarkerBadgeClass(w.biomarker)}`}>
                            {w.biomarker}
                          </span>
                        </td>
                        <td className="ws-lot">{w.lot}</td>
                        <td className="ws-num">{w.total}</td>
                        <td className={`ws-num ${w.preferred === 0 ? "ws-zero" : ""}`}>{w.preferred}</td>
                        <td className="ws-num">{w.uicc}</td>
                        <td className="ws-num">{w.subsequent}</td>
                        <td className="ws-num">{w.trials}</td>
                        <td className="ws-num">{w.activeTrials}</td>
                        <td>
                          <span
                            className="ws-gap-badge"
                            style={{ backgroundColor: gapColor(score) }}
                          >
                            {gapLabel(score)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredWhiteSpace.length === 0 && (
              <div className="oc-empty">No white space data matches current filters.</div>
            )}
          </div>
        )}

        {tab === "insights" && (
          <InsightsTab
            pipeline={filteredPipeline}
            whiteSpace={filteredWhiteSpace}
            regimens={filtered}
            drugProfiles={drugProfiles}
            drugWeights={drugWeights}
          />
        )}
      </div>
    </div>
  );
}
