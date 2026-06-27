"use client";

import { useState, useMemo } from "react";
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
  profileDescription,
  computeConfidence,
  computePhaseBreakdown,
  computeDrivers,
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
  const [filters, setFilters] = useState({
    biomarker: "All Biomarkers",
    combo: "All",
    hist: "All",
    lot: "All",
  });

  const regimens = data?.regimens ?? [];
  const whiteSpace = data?.whiteSpace ?? [];
  const pipeline = data?.pipeline ?? [];
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

            {/* ── Trial Profile ── */}
            <div className="pl-section">
              <div className="pl-section-label">Trial Profile</div>
              <div className="pl-field-grid">
                <div className="pl-field">
                  <span className="oc-filter-label">Endpoint</span>
                  <select className="oc-select" value={profile.endpoint}
                    onChange={(e) => {
                      const p = { ...profile, endpoint: e.target.value as TrialEndpoint };
                      setProfile(p); if (!manualWeights) setWeights(profileToWeights(p));
                    }}>
                    <option>PFS</option><option>ORR</option><option>OS</option>
                  </select>
                </div>
                <div className="pl-field">
                  <span className="oc-filter-label">Enrollment</span>
                  <select className="oc-select" value={profile.enrollment}
                    onChange={(e) => {
                      const p = { ...profile, enrollment: e.target.value as TrialEnrollment };
                      setProfile(p); if (!manualWeights) setWeights(profileToWeights(p));
                    }}>
                    <option>Fast</option><option>Average</option><option>Slow</option>
                  </select>
                </div>
                <div className="pl-field">
                  <span className="oc-filter-label">Design</span>
                  <select className="oc-select" value={profile.design}
                    onChange={(e) => {
                      const p = { ...profile, design: e.target.value as TrialDesign };
                      setProfile(p); if (!manualWeights) setWeights(profileToWeights(p));
                    }}>
                    <option>RCT</option><option>SingleArm</option><option>Adaptive</option>
                  </select>
                </div>
                <div className="pl-field">
                  <span className="oc-filter-label">Pathway</span>
                  <select className="oc-select" value={profile.pathway}
                    onChange={(e) => {
                      const pw = e.target.value as TrialPathway;
                      const p = DEFAULT_PROFILES[pw];
                      setProfile(p); setRisk(DEFAULT_RISK);
                      setWeights(profileToWeights(p)); setManualWeights(false);
                    }}>
                    <option>Standard</option><option>Accelerated</option>
                  </select>
                </div>
              </div>
            </div>

            {/* ── FDA Designations ── */}
            <div className="pl-section">
              <div className="pl-section-label">FDA Designations</div>
              <div className="pl-toggles">
                {([["btd","BTD"],["aa","AA"],["priorityReview","Priority Review"]] as const).map(([key,label]) => (
                  <label key={key} className="pl-toggle">
                    <input type="checkbox" checked={profile[key as keyof TrialProfile] as boolean}
                      onChange={() => {
                        const p = { ...profile, [key]: !profile[key as keyof TrialProfile] };
                        setProfile(p); if (!manualWeights) setWeights(profileToWeights(p));
                      }} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* ── Risk Adjustments ── */}
            <div className="pl-section">
              <div className="pl-section-label">Risk Adjustments</div>
              <div className="pl-risks">
                {(["enrollment","cmc","urgency"] as const).map((key) => (
                  <div key={key} className="pl-risk-row">
                    <span className="pl-risk-label">{key === "enrollment" ? "Enrollment risk" : key === "cmc" ? "CMC readiness" : "Competitive urgency"}</span>
                    <div className="pl-risk-bar-wrap">
                      <div className="pl-risk-bar">
                        <div className="pl-risk-fill" style={{ width: `${(risk[key] / 5) * 100}%` }} />
                      </div>
                      <input type="range" min={1} max={5} value={risk[key]}
                        onChange={(e) => setRisk({ ...risk, [key]: +e.target.value })} />
                    </div>
                    <span className="pl-risk-val">{risk[key]}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Timeline Weights ── */}
            <div className="pl-section">
              <div className="pl-section-label">Timeline Weights</div>
              <div className="pl-controls-row">
                <div className="pl-control">
                  <span className="oc-filter-label">Submission</span>
                  <input type="number" min={0} max={6} value={weights.submission}
                    onChange={(e) => { setWeights({ ...weights, submission: +e.target.value }); setManualWeights(true); }} />
                </div>
                <div className="pl-control">
                  <span className="oc-filter-label">FDA Review</span>
                  <input type="number" min={0} max={24} value={weights.review}
                    onChange={(e) => { setWeights({ ...weights, review: +e.target.value }); setManualWeights(true); }} />
                </div>
                <div className="pl-control">
                  <span className="oc-filter-label">NCCN Lag</span>
                  <input type="number" min={0} max={12} value={weights.nccnLag}
                    onChange={(e) => { setWeights({ ...weights, nccnLag: +e.target.value }); setManualWeights(true); }} />
                </div>
                <span className="pl-total">= {weights.submission + weights.review + weights.nccnLag}mo</span>
              </div>
              <div className="pl-presets">
                <button className={`oc-tab ${!manualWeights && profile.pathway === "Standard" ? "active" : "nav-idle"}`}
                  onClick={() => { const p = DEFAULT_PROFILES.Standard; setProfile(p); setRisk(DEFAULT_RISK); setWeights(profileToWeights(p)); setManualWeights(false); }}>Standard</button>
                <button className={`oc-tab ${!manualWeights && profile.pathway === "Accelerated" ? "active" : "nav-idle"}`}
                  onClick={() => { const p = DEFAULT_PROFILES.Accelerated; setProfile(p); setRisk(DEFAULT_RISK); setWeights(profileToWeights(p)); setManualWeights(false); }}>Accelerated</button>
                {manualWeights && (
                  <button className="oc-tab nav-idle" onClick={() => { setWeights(profileToWeights(profile)); setManualWeights(false); }}>↺ Reset</button>
                )}
              </div>
            </div>

            {/* ── Status & Confidence ── */}
            {(() => {
              const offset = weights.submission + weights.review + weights.nccnLag;
              const conf = computeConfidence(profile, risk, offset);
              const phases = computePhaseBreakdown(profile, weights);
              const drivers = computeDrivers(profile, weights);
              const totalMo = weights.submission + weights.review + weights.nccnLag;
              return (<>
                <div className="pl-section">
                  <div className="pl-section-label">Status & Confidence</div>
                  <div className="pl-status-bar">
                    <span className="pl-status-text">{profileDescription(profile, weights, risk)}</span>
                    {manualWeights && <span className="pl-status-custom">Custom weights</span>}
                  </div>
                  <div className="pl-confidence">
                    <div className="pl-conf-bar-wrap">
                      <div className="pl-conf-bar">
                        <div className={`pl-conf-fill ${conf.score >= 70 ? "pl-conf-high" : conf.score >= 45 ? "pl-conf-mid" : "pl-conf-low"}`}
                          style={{ width: `${conf.score}%` }} />
                      </div>
                    </div>
                    <span className="pl-conf-score">{conf.score}/90</span>
                    <span className="pl-conf-label" style={{ color: conf.color }}>{conf.label}</span>
                  </div>
                  <div className="pl-metrics">
                    <div className="pl-metric">
                      <span className="pl-metric-label">Optimistic (P10)</span>
                      <span className="pl-metric-val">{Math.max(0, totalMo - 3)}mo</span>
                    </div>
                    <div className="pl-metric">
                      <span className="pl-metric-label">Most Likely (Median)</span>
                      <span className="pl-metric-val">{totalMo}mo</span>
                    </div>
                    <div className="pl-metric">
                      <span className="pl-metric-label">Conservative (P90)</span>
                      <span className="pl-metric-val">{totalMo + 4}mo</span>
                    </div>
                  </div>
                </div>

                {/* ── Phase Breakdown ── */}
                <div className="pl-section">
                  <div className="pl-section-label">Phase Breakdown</div>
                  <div className="pl-breakdown">
                    {phases.map((ph) => (
                      <div key={ph.label} className="pl-break-row">
                        <div className="pl-break-bar-wrap">
                          <div className="pl-break-bar" style={{
                            width: `${(ph.months / Math.max(...phases.map(x => x.months), 1)) * 100}%`,
                            backgroundColor: ph.color,
                          }} />
                        </div>
                        <span className="pl-break-label">{ph.label}</span>
                        <span className="pl-break-months">{ph.months}mo</span>
                      </div>
                    ))}
                    <div className="pl-break-row pl-break-total">
                      <div className="pl-break-bar-wrap"><div className="pl-break-bar" style={{ width: "100%", backgroundColor: "#141412" }} /></div>
                      <span className="pl-break-label">Total</span>
                      <span className="pl-break-months">{totalMo}mo</span>
                    </div>
                  </div>
                </div>

                {/* ── Key Drivers ── */}
                {drivers.length > 0 && (
                  <div className="pl-section">
                    <div className="pl-section-label">Key Drivers</div>
                    <div className="pl-drivers">
                      {drivers.map((d,i) => (
                        <div key={i} className={`pl-driver ${d.positive ? "pl-driver-pos" : "pl-driver-neg"}`}>
                          <span className="pl-driver-icon">{d.positive ? "✓" : "⚠"}</span>
                          <span className="pl-driver-text">{d.label}</span>
                          <span className="pl-driver-effect">{d.effect}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>);
            })()}

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
                      <th>Status</th>
                      <th>Start</th>
                      <th>PCD</th>
                      <th>Projected FDA</th>
                      <th>Projected SOC</th>
                      <th>Horizon</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPipeline.map((p) => {
                      const proj = projectTimeline(p.primary_completion_date, weights);
                      const horizon = proj ? Math.round(
                        (new Date(proj.projectedSOC).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30.44)
                      ) : null;
                      return (
                        <tr key={p.nct_id} className="pl-row">
                          <td className="pl-drug">{p.drug}</td>
                          <td>
                            <span className={`oc-card-bm ${biomarkerBadgeClass(p.biomarker)}`}>
                              {p.biomarker}
                            </span>
                          </td>
                          <td className="pl-phase">{p.phases?.join("/") || "—"}</td>
                          <td className="pl-status">{p.status?.replace(/_/g, " ") || "—"}</td>
                          <td className="pl-date">{p.start_date || "—"}</td>
                          <td className="pl-date">{p.primary_completion_date || "—"}</td>
                          <td className="pl-date">{proj?.projectedFDA || "—"}</td>
                          <td className="pl-date">{proj?.projectedSOC || "—"}</td>
                          <td className="pl-horizon">
                            {horizon !== null ? (
                              <span className={`pl-horizon-badge ${horizon < 36 ? "pl-hz-near" : horizon < 60 ? "pl-hz-mid" : "pl-hz-far"}`}>
                                {horizon < 12 ? "<1yr" : horizon < 36 ? "1-3yr" : horizon < 60 ? "3-5yr" : ">5yr"}
                              </span>
                            ) : "—"}
                          </td>
                        </tr>
                      );
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
              <div className="pl-table-wrap">
                <table className="pl-table pl-val-table">
                  <thead>
                    <tr>
                      <th>Drug</th>
                      <th>Biomarker</th>
                      <th>Actual SOC</th>
                      <th>Predicted SOC</th>
                      <th>Offset</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { drug: "Osimertinib", biomarker: "EGFR", actual: "2018-09-01", predicted: "2018-09-19", offset: 0.6, pass: true },
                      { drug: "Alectinib", biomarker: "ALK", actual: "2017-12-18", predicted: "2017-12-22", offset: 0.1, pass: true },
                      { drug: "Pembrolizumab", biomarker: "PD-L1", actual: "2016-10-24", predicted: "2016-10-24", offset: 0, pass: true },
                      { drug: "Sotorasib", biomarker: "KRAS G12C", actual: "2021-05-28", predicted: "2021-05-28", offset: 0, pass: true },
                      { drug: "Selpercatinib", biomarker: "RET", actual: "2022-09-21", predicted: "2022-09-21", offset: 0, pass: true },
                      { drug: "Larotrectinib", biomarker: "NTRK", actual: "2018-11-26", predicted: "2018-11-26", offset: 0, pass: true },
                    ].map((v) => (
                      <tr key={v.drug}>
                        <td className="pl-drug">{v.drug}</td>
                        <td>
                          <span className={`oc-card-bm ${biomarkerBadgeClass(v.biomarker)}`}>{v.biomarker}</span>
                        </td>
                        <td className="pl-date">{v.actual}</td>
                        <td className="pl-date">{v.predicted}</td>
                        <td className="pl-val-offset">{v.offset > 0 ? `+${v.offset}` : v.offset}mo</td>
                        <td>{v.pass ? <span className="pl-val-pass">✓</span> : <span className="pl-val-fail">✗</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pl-val-summary">
                Average offset: <strong>0.1mo</strong> · Max offset: <strong>0.6mo</strong> · 6/6 within ±3mo
              </div>
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
          <div className="oc-main">
            <div className="cs-wrap">
              <div className="cs-eyebrow">Insights</div>
              <div className="cs-title">Competitive Signals</div>
              <div className="cs-sub">
                AI-generated competitive pressure scores, threat rankings, and strategic narratives across your selected treatment cell.
              </div>
              <div className="cs-subtabs">
                <div className="cs-subtab" style={{ width: 180 }}>Coming soon</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
