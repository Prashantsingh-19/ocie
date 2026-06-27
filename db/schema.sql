-- OCIE: Oncology Guidelines Intelligence Engine
-- Supabase schema for Current SOC + Pipeline + White Space modules

-- Regimens: one row per drug/regimen entry from NCCN/ASCO guidelines
CREATE TABLE IF NOT EXISTS regimens (
  id SERIAL PRIMARY KEY,
  drug TEXT NOT NULL,
  type TEXT,
  single_or_combination TEXT,
  drug_class TEXT,
  mechanism TEXT,
  biomarker TEXT,
  biomarker_detail TEXT,
  histology TEXT,
  lot TEXT,
  tier TEXT,
  setting TEXT,
  route TEXT,
  notes TEXT,
  pd_l1_expression TEXT,
  patient_population TEXT,
  source_sheet TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trials: NCT IDs and metadata from ClinicalTrials.gov
CREATE TABLE IF NOT EXISTS trials (
  id SERIAL PRIMARY KEY,
  nct_id TEXT UNIQUE NOT NULL,
  drug_name TEXT,
  title TEXT,
  phases TEXT[],
  status TEXT,
  start_date TEXT,
  primary_completion_date TEXT,
  enrollment INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Junction: which trials are linked to which regimens
CREATE TABLE IF NOT EXISTS regimen_trials (
  regimen_id INTEGER REFERENCES regimens(id) ON DELETE CASCADE,
  nct_id TEXT REFERENCES trials(nct_id) ON DELETE CASCADE,
  PRIMARY KEY (regimen_id, nct_id)
);

-- Inclusion criteria: linked by NCT ID (populated later from trial protocols)
CREATE TABLE IF NOT EXISTS inclusion_criteria (
  id SERIAL PRIMARY KEY,
  nct_id TEXT REFERENCES trials(nct_id) ON DELETE CASCADE,
  criterion TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Exclusion criteria: linked by NCT ID (populated later from trial protocols)
CREATE TABLE IF NOT EXISTS exclusion_criteria (
  id SERIAL PRIMARY KEY,
  nct_id TEXT REFERENCES trials(nct_id) ON DELETE CASCADE,
  criterion TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_regimens_biomarker ON regimens(biomarker);
CREATE INDEX IF NOT EXISTS idx_regimens_lot ON regimens(lot);
CREATE INDEX IF NOT EXISTS idx_regimens_tier ON regimens(tier);
CREATE INDEX IF NOT EXISTS idx_trials_nct_id ON trials(nct_id);
CREATE INDEX IF NOT EXISTS idx_regimen_trials_regimen ON regimen_trials(regimen_id);
CREATE INDEX IF NOT EXISTS idx_regimen_trials_nct ON regimen_trials(nct_id);

-- View for white space analysis: regimen counts and trial counts per biomarker × LOT
CREATE OR REPLACE VIEW white_space AS
with bio_lot as (
  select biomarker, lot,
         count(*) as total,
         count(*) filter (where tier = 'Preferred') as preferred,
         count(*) filter (where tier = 'UICC') as uicc,
         count(*) filter (where tier = 'Subsequent') as subsequent
  from regimens
  group by biomarker, lot
),
bio_trials as (
  select r.biomarker,
         count(distinct rt.nct_id) as trials,
         count(distinct rt.nct_id) filter (where t.status not in ('TERMINATED','WITHDRAWN','COMPLETED')) as active_trials
  from regimens r
  join regimen_trials rt on rt.regimen_id = r.id
  join trials t on t.nct_id = rt.nct_id
  group by r.biomarker
)
select bl.biomarker, bl.lot, bl.total, bl.preferred, bl.uicc, bl.subsequent,
       coalesce(bt.trials, 0) as trials,
       coalesce(bt.active_trials, 0) as active_trials
from bio_lot bl
left join bio_trials bt on bt.biomarker = bl.biomarker
order by bl.biomarker, bl.lot;

-- View for pipeline timeline: best (highest phase) trial per regimen
CREATE OR REPLACE VIEW pipeline_drugs AS
SELECT DISTINCT ON (r.id)
  r.id as regimen_id,
  r.drug,
  r.biomarker,
  r.lot,
  r.tier,
  t.nct_id,
  t.phases,
  t.status,
  t.start_date,
  t.primary_completion_date,
  t.enrollment
FROM regimens r
JOIN regimen_trials rt ON rt.regimen_id = r.id
JOIN trials t ON t.nct_id = rt.nct_id
ORDER BY r.id,
  CASE
    WHEN t.phases @> ARRAY['PHASE3'] THEN 0
    WHEN t.phases @> ARRAY['PHASE2'] THEN 1
    WHEN t.phases @> ARRAY['PHASE1'] THEN 2
    ELSE 3
  END,
  t.start_date DESC NULLS LAST;
