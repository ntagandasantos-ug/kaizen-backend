-- Kaizen Committee Portal — schema
-- Run this once against your Postgres database (see README for how).

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'auditor', 'viewer')),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS committee_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  photo_url TEXT,
  is_lead BOOLEAN DEFAULT false,
  attached_departments UUID[] DEFAULT '{}',
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
  month DATE NOT NULL, -- always stored as first-of-month, e.g. 2026-07-01
  score NUMERIC(5,2),
  sort_score NUMERIC(5,2),
  set_in_order_score NUMERIC(5,2),
  shine_score NUMERIC(5,2),
  standardize_score NUMERIC(5,2),
  sustain_score NUMERIC(5,2),
  safety_score NUMERIC(5,2),
  auditor_id UUID REFERENCES committee_members(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(department_id, month)
);

CREATE TABLE IF NOT EXISTS audit_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID REFERENCES audits(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_key TEXT NOT NULL, -- the raw object storage key, needed for deletion
  file_type TEXT CHECK (file_type IN ('photo', 'video', 'report')),
  file_size_bytes BIGINT,
  uploaded_by UUID REFERENCES users(id),
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  event_date DATE NOT NULL,
  event_type TEXT CHECK (event_type IN ('Audit', 'Ceremony', 'Activity')),
  department_ids UUID[] DEFAULT '{}',
  auditor_id UUID REFERENCES committee_members(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Audit trail: who changed a score, and when — important for SACCO-adjacent
-- data where you may need to show a record of changes later.
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,        -- e.g. 'audit.score.update'
  target_table TEXT NOT NULL,
  target_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audits_department_month ON audits(department_id, month);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
