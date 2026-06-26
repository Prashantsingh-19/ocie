"use client";

import { useState, useMemo } from "react";
import type { Regimen, DashboardData, KpiData, WhiteSpaceRow } from "@/types";
import {
  computeKpis,
  filterRegimens,
  biomarkerBadgeClass,
  tierTagClass,
  cardBorderClass,
  gapScore,
  gapLabel,
  gapColor,
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
  const [filters, setFilters] = useState({
    biomarker: "All Biomarkers",
    combo: "All",
    hist: "All",
    lot: "All",
  });

  const regimens = data?.regimens ?? [];
  const whiteSpace = data?.whiteSpace ?? [];
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
            <div className="cs-wrap">
              <div className="cs-eyebrow">Pipeline · Trials</div>
              <div className="cs-title">Pipeline Intelligence</div>
              <div className="cs-sub">
                This module will surface drugs currently in Phase 1–3 trials across your selected biomarker and histology filters. Global filters are active and will pre-populate results when this view launches.
              </div>
              <div className="cs-subtabs">
                <div>
                  <div className="cs-subtab">3-Year Horizon</div>
                  <div className="cs-subtab-label">Coming soon</div>
                </div>
                <div>
                  <div className="cs-subtab">5-Year Horizon</div>
                  <div className="cs-subtab-label">Coming soon</div>
                </div>
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
